import uuid
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin
from db import get_session
from models_sql import CategoryMeta, Product, User, utcnow

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


class CategoryMetaIn(BaseModel):
    name: str
    emoji: Optional[str] = None
    pinned: bool = False
    order: int = 0


class BulkUpdatePayload(BaseModel):
    category: Optional[str] = None  # None = all
    price_pct: Optional[float] = None
    cost_pct: Optional[float] = None
    set_tax_rate: Optional[float] = None
    add_stock: Optional[float] = None


# ----------------- Endpoints -----------------
@products_router.get("/products", response_model=List[ProductOut])
async def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = Query(default=200, le=1000),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Product)
    if category and category != "all" and category != "Todos":
        stmt = stmt.where(Product.category == category)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Product.name).like(term),
                Product.barcode.like(f"%{q.strip()}%"),
                func.lower(Product.sku).like(term),
                func.lower(Product.category).like(term),
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
        c_name = row[0] or "General"
        meta = meta_map.get(c_name)
        items.append(
            CategoryInfo(
                name=c_name,
                count=row[1],
                stock=float(row[2]),
                emoji=meta.emoji if meta else None,
                pinned=meta.pinned if meta else False,
                order=meta.order if meta else 0,
            )
        )

    # Sort: pinned first (by order asc), then non-pinned by count desc
    items.sort(key=lambda x: (not x.pinned, x.order, -x.count))
    return items


@products_router.get("/categories/meta", response_model=List[CategoryMetaIn])
async def get_categories_meta(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(CategoryMeta).order_by(CategoryMeta.order.asc(), CategoryMeta.name.asc())
    res = (await session.execute(stmt)).scalars().all()
    return [CategoryMetaIn(name=m.name, emoji=m.emoji, pinned=m.pinned, order=m.order) for m in res]


@products_router.put("/categories/meta")
async def update_categories_meta(
    payload: List[CategoryMetaIn],
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    for item in payload:
        meta = await session.get(CategoryMeta, item.name)
        if meta:
            meta.emoji = item.emoji
            meta.pinned = item.pinned
            meta.order = item.order
        else:
            meta = CategoryMeta(name=item.name, emoji=item.emoji, pinned=item.pinned, order=item.order)
            session.add(meta)
    await session.commit()
    return {"ok": True}


# ----------------- Servicios & Operaciones Masivas -----------------
@products_router.get("/services", response_model=List[ProductOut])
async def list_services(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Product).where(Product.is_service == True).order_by(Product.name.asc())
    res = (await session.execute(stmt)).scalars().all()
    return res


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
            existing.price = float(it.price or existing.price)
            existing.cost = float(it.cost or existing.cost)
            existing.stock = float(it.stock if it.stock is not None else existing.stock)
            existing.category = it.category or existing.category
            existing.tax_rate = float(it.tax_rate if it.tax_rate is not None else existing.tax_rate)
            existing.unit = it.unit or existing.unit
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
        if payload.price_pct is not None:
            p.price = round(p.price * (1 + payload.price_pct / 100.0), 2)
        if payload.cost_pct is not None:
            p.cost = round(p.cost * (1 + payload.cost_pct / 100.0), 2)
        if payload.set_tax_rate is not None:
            p.tax_rate = float(payload.set_tax_rate)
        if payload.add_stock is not None:
            p.stock = round(p.stock + payload.add_stock, 2)
        p.updated_at = utcnow()
        count += 1

    await session.commit()
    return {"ok": True, "affected": count}
