import uuid
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin
from db import get_session
from models_sql import CategoryMeta, Contact, Product, User, utcnow

products_router = APIRouter(prefix="/api", tags=["products"])


# ----------------- Schemas -----------------
class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    barcode: Optional[str] = None
    sku: Optional[str] = None
    category: str = "General"
    price: float = 0.0
    cost: float = 0.0
    stock: float = 0.0
    unit: str = "und"
    tax_rate: float = 19.0
    supplier_id: Optional[str] = None
    image_url: Optional[str] = None
    is_service: bool = False
    created_at: datetime
    updated_at: datetime


class ProductCreate(BaseModel):
    name: str
    barcode: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = "General"
    price: float = 0.0
    cost: float = 0.0
    stock: float = 0.0
    unit: str = "und"
    tax_rate: float = 19.0
    supplier_id: Optional[str] = None
    image_url: Optional[str] = None
    is_service: bool = False


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    barcode: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    stock: Optional[float] = None
    unit: Optional[str] = None
    tax_rate: Optional[float] = None
    supplier_id: Optional[str] = None
    image_url: Optional[str] = None
    is_service: Optional[bool] = None


class CategoryInfo(BaseModel):
    name: str
    count: int
    stock: float
    emoji: Optional[str] = None
    pinned: bool = False
    order: int = 0


class CategoryMetaUpsert(BaseModel):
    name: str
    emoji: Optional[str] = None
    pinned: Optional[bool] = None
    order: Optional[int] = None


class BulkUpdatePayload(BaseModel):
    category: Optional[str] = None  # None = all
    percent_price: Optional[float] = None
    percent_cost: Optional[float] = None
    set_tax: Optional[float] = None
    add_stock: Optional[float] = None


# ----------------- Endpoints -----------------
@products_router.get("/products", response_model=List[ProductOut])
async def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    categories: Optional[str] = None,
    limit: int = Query(default=500, le=5000),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Product)
    cat_list = [c.strip() for c in categories.split(",")] if categories else []
    cat_list = [c for c in cat_list if c and c != "all"]
    if cat_list:
        stmt = stmt.where(Product.category.in_(cat_list))
    elif category and category != "all":
        stmt = stmt.where(Product.category == category)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Product.name).like(term),
                Product.barcode.like(f"%{q.strip()}%"),
                func.lower(Product.sku).like(term),
            )
        )
    stmt = stmt.order_by(Product.name.asc()).limit(limit)
    res = await session.execute(stmt)
    return res.scalars().all()


@products_router.get("/products/barcode/{barcode}", response_model=ProductOut)
async def get_by_barcode(
    barcode: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Product).where(Product.barcode == barcode.strip())
    product = (await session.execute(stmt)).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


@products_router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = await session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


@products_router.post("/products", response_model=ProductOut)
async def create_product(
    payload: ProductCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = Product(
        name=payload.name.strip(),
        barcode=payload.barcode.strip() if payload.barcode else None,
        sku=payload.sku.strip() if payload.sku else None,
        category=payload.category.strip() if payload.category else "General",
        price=float(payload.price or 0.0),
        cost=float(payload.cost or 0.0),
        stock=float(payload.stock or 0.0),
        unit=payload.unit or "und",
        tax_rate=float(payload.tax_rate if payload.tax_rate is not None else 19.0),
        supplier_id=payload.supplier_id,
        image_url=payload.image_url,
        is_service=bool(payload.is_service),
    )
    session.add(product)
    await session.commit()
    await session.refresh(product)
    return product


@products_router.put("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: str,
    payload: ProductUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = await session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(product, key, value)
    product.updated_at = utcnow()

    await session.commit()
    await session.refresh(product)
    return product


@products_router.delete("/products/{product_id}")
async def delete_product(
    product_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = await session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    await session.delete(product)
    await session.commit()
    return {"ok": True}


# ----------------- Categorías -----------------
@products_router.get("/categories", response_model=List[CategoryInfo])
async def list_categories(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    # Group products by category
    stmt = (
        select(
            Product.category,
            func.count(Product.id).label("count"),
            func.coalesce(func.sum(Product.stock), 0.0).label("stock"),
        )
        .group_by(Product.category)
    )
    res = (await session.execute(stmt)).all()

    # Get category metadata (emoji, pinned, order)
    meta_res = (await session.execute(select(CategoryMeta))).scalars().all()
    meta_map = {m.name: m for m in meta_res}

    items = []
    for row in res:
        c_name = row[0]
        if not c_name:
            continue
        meta = meta_map.get(c_name)
        items.append(
            CategoryInfo(
                name=c_name,
                count=row[1],
                stock=float(row[2]),
                emoji=meta.emoji if meta else None,
                pinned=meta.pinned if meta else False,
                order=meta.order if meta else 999,
            )
        )

    # Sort: pinned first (by order asc); non-pinned ties break by count desc only
    items.sort(key=lambda x: (not x.pinned, x.order if x.pinned else 0, -x.count))
    return items


@products_router.put("/categories/meta")
async def upsert_category_meta(
    payload: CategoryMetaUpsert,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None and k != "name"}
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para actualizar")

    meta = await session.get(CategoryMeta, payload.name)
    if meta:
        for key, value in updates.items():
            setattr(meta, key, value)
    else:
        meta = CategoryMeta(name=payload.name, **updates)
        session.add(meta)
    await session.commit()
    await session.refresh(meta)
    return {"name": meta.name, "emoji": meta.emoji, "pinned": meta.pinned, "order": meta.order}


# ----------------- Operaciones Masivas -----------------
@products_router.post("/products/bulk")
async def bulk_load_products(
    items: List[ProductCreate],
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    created = 0
    updated = 0
    for it in items:
        existing = None
        if it.barcode:
            stmt = select(Product).where(Product.barcode == it.barcode.strip())
            existing = (await session.execute(stmt)).scalar_one_or_none()
        if not existing:
            stmt = select(Product).where(Product.name == it.name.strip())
            existing = (await session.execute(stmt)).scalar_one_or_none()

        if existing:
            existing.price = float(it.price)
            existing.cost = float(it.cost)
            existing.category = it.category or existing.category
            existing.stock = existing.stock + float(it.stock)
            existing.updated_at = utcnow()
            updated += 1
        else:
            new_p = Product(
                name=it.name.strip(),
                barcode=it.barcode.strip() if it.barcode else None,
                sku=it.sku.strip() if it.sku else None,
                category=it.category.strip() if it.category else "General",
                price=float(it.price or 0.0),
                cost=float(it.cost or 0.0),
                stock=float(it.stock or 0.0),
                unit=it.unit or "und",
                tax_rate=float(it.tax_rate if it.tax_rate is not None else 19.0),
                supplier_id=it.supplier_id,
                is_service=bool(it.is_service),
            )
            session.add(new_p)
            created += 1

    await session.commit()
    return {"ok": True, "created": created, "updated": updated, "total": len(items)}


@products_router.post("/products/bulk-update")
async def bulk_update_products(
    payload: BulkUpdatePayload,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    stmt = select(Product)
    if payload.category and payload.category not in ("all", "Todos"):
        stmt = stmt.where(Product.category == payload.category)
    products = (await session.execute(stmt)).scalars().all()

    count = 0
    for p in products:
        if payload.percent_price is not None:
            p.price = round(p.price * (1 + payload.percent_price / 100.0), 2)
        if payload.percent_cost is not None:
            p.cost = round(p.cost * (1 + payload.percent_cost / 100.0), 2)
        if payload.set_tax is not None:
            p.tax_rate = float(payload.set_tax)
        if payload.add_stock is not None:
            p.stock = round(p.stock + payload.add_stock, 2)
        p.updated_at = utcnow()
        count += 1

    await session.commit()
    return {"ok": True, "updated": count}


# ----------------- Seed sample data -----------------
_SEED_PRODUCTS = [
    {"name": "Arroz Diana 500g", "barcode": "7702001010011", "category": "Granos", "price": 2500, "cost": 1800, "stock": 40, "unit": "und"},
    {"name": "Aceite Girasol 1L", "barcode": "7702001010028", "category": "Aceites", "price": 12500, "cost": 9800, "stock": 22, "unit": "und"},
    {"name": "Panela cuadrada 500g", "barcode": "7702001010035", "category": "Endulzantes", "price": 3800, "cost": 2600, "stock": 30, "unit": "und"},
    {"name": "Leche Alqueria 1L", "barcode": "7702001010042", "category": "Lácteos", "price": 4800, "cost": 3600, "stock": 25, "unit": "und"},
    {"name": "Huevos AA x30", "barcode": "7702001010059", "category": "Huevos", "price": 18500, "cost": 14000, "stock": 12, "unit": "und"},
    {"name": "Pan tajado Bimbo", "barcode": "7702001010066", "category": "Panadería", "price": 6900, "cost": 4900, "stock": 15, "unit": "und"},
    {"name": "Café Sello Rojo 250g", "barcode": "7702001010073", "category": "Café", "price": 9800, "cost": 7000, "stock": 20, "unit": "und"},
    {"name": "Frijol rojo 500g", "barcode": "7702001010080", "category": "Granos", "price": 5200, "cost": 3800, "stock": 18, "unit": "und"},
    {"name": "Coca-Cola 1.5L", "barcode": "7702001010097", "category": "Bebidas", "price": 5500, "cost": 4100, "stock": 30, "unit": "und"},
    {"name": "Jabón Rey 300g", "barcode": "7702001010103", "category": "Aseo", "price": 4200, "cost": 3000, "stock": 24, "unit": "und"},
    {"name": "Chocolatina Jet", "barcode": "7702001010110", "category": "Golosinas", "price": 1200, "cost": 800, "stock": 60, "unit": "und"},
    {"name": "Papas Margarita 105g", "barcode": "7702001010127", "category": "Snacks", "price": 4500, "cost": 3200, "stock": 3, "unit": "und"},
]

_SEED_CONTACTS = [
    {"kind": "supplier", "name": "Distribuidora La Cosecha", "document": "900123456-7", "phone": "3001112233", "city": "Bogotá"},
    {"kind": "supplier", "name": "Nutresa S.A.", "document": "890900608-9", "phone": "6045118111", "city": "Medellín"},
    {"kind": "customer", "name": "Consumidor Final", "document": "222222222222", "document_type": "NIT"},
    {"kind": "customer", "name": "María López", "document": "1020304050", "document_type": "CC", "phone": "3113334455"},
]


@products_router.post("/seed")
async def seed_data(
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    existing = (await session.execute(select(func.count(Product.id)))).scalar_one()
    if existing > 0:
        return {"ok": True, "seeded": False, "message": "Ya existen datos"}

    for p in _SEED_PRODUCTS:
        session.add(Product(**p))
    for c in _SEED_CONTACTS:
        session.add(Contact(**c))
    await session.commit()

    return {"ok": True, "seeded": True, "products": len(_SEED_PRODUCTS), "contacts": len(_SEED_CONTACTS)}
