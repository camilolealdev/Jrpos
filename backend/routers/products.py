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
from pricing import compute_unit_pricing

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
    margin_percent: Optional[float] = None
    units_per_package: float = 1.0
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
    # Utilidad variable por producto: si vienen package_cost/units_per_package/margin_percent,
    # el precio/costo unitario se recalcula a partir de ellos (ver pricing.compute_unit_pricing),
    # ignorando price/cost enviados directamente — así siempre coincide lo mostrado en el
    # formulario con lo que queda guardado.
    package_cost: Optional[float] = None
    units_per_package: Optional[float] = None
    margin_percent: Optional[float] = None


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
    package_cost: Optional[float] = None
    units_per_package: Optional[float] = None
    margin_percent: Optional[float] = None


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


@products_router.get("/products/lookup-external/{barcode}")
async def lookup_external_barcode(
    barcode: str,
    user: User = Depends(get_current_user),
):
    """
    Consulta bases de datos de catálogo global (Open Food Facts / Open Beauty / etc.)
    para autocompletar nombre, marca, categoría e imagen de un producto por su código de barras.
    """
    clean_code = barcode.strip()
    if not clean_code:
        return {"found": False, "barcode": barcode}

    import httpx

    # 1. Consulta Open Food Facts (alimentos, bebidas, abarrotes, golosinas)
    try:
        url = f"https://world.openfoodfacts.org/api/v0/product/{clean_code}.json"
        async with httpx.AsyncClient(timeout=4.0, headers={"User-Agent": "Jrpos - Retail POS - Support/1.0"}) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == 1 and "product" in data:
                    prod = data["product"]
                    name = (
                        prod.get("product_name_es")
                        or prod.get("product_name")
                        or prod.get("generic_name_es")
                        or prod.get("generic_name")
                        or ""
                    )
                    brands = prod.get("brands") or ""
                    if brands and brands.lower() not in name.lower() and name:
                        name = f"{brands} {name}".strip()
                    elif not name and brands:
                        name = brands

                    quantity = prod.get("quantity") or ""
                    if quantity and quantity not in name and name:
                        name = f"{name} {quantity}".strip()

                    categories_tags = prod.get("categories_tags", [])
                    category = "General"
                    if categories_tags:
                        raw_cat = categories_tags[0].replace("en:", "").replace("es:", "").replace("-", " ")
                        category = raw_cat.strip().capitalize()

                    image_url = prod.get("image_front_small_url") or prod.get("image_url") or ""

                    if name:
                        return {
                            "found": True,
                            "barcode": clean_code,
                            "name": name,
                            "brand": brands,
                            "category": category,
                            "image_url": image_url,
                            "source": "Open Food Facts",
                        }
    except Exception:
        pass

    # 2. Consulta Open Beauty Facts (aseo, cuidado personal, cosméticos)
    try:
        url = f"https://world.openbeautyfacts.org/api/v0/product/{clean_code}.json"
        async with httpx.AsyncClient(timeout=3.0, headers={"User-Agent": "Jrpos - Retail POS - Support/1.0"}) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == 1 and "product" in data:
                    prod = data["product"]
                    name = prod.get("product_name_es") or prod.get("product_name") or ""
                    brands = prod.get("brands") or ""
                    if brands and brands.lower() not in name.lower() and name:
                        name = f"{brands} {name}".strip()
                    image_url = prod.get("image_front_small_url") or prod.get("image_url") or ""
                    if name:
                        return {
                            "found": True,
                            "barcode": clean_code,
                            "name": name,
                            "brand": brands,
                            "category": "Aseo y Cuidado Personal",
                            "image_url": image_url,
                            "source": "Open Beauty Facts",
                        }
    except Exception:
        pass

    return {"found": False, "barcode": clean_code}


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
    # El precio que llega en el payload siempre gana (el usuario lo pudo digitar a mano en el
    # formulario, aunque haya usado la calculadora de utilidad primero) — el % solo se usa si
    # no hay un precio explícito.
    unit_cost, unit_price = compute_unit_pricing(
        payload.package_cost, payload.units_per_package, payload.margin_percent,
        fallback_cost=float(payload.cost or 0.0), fallback_price=float(payload.price or 0.0),
        explicit_price=float(payload.price) if payload.price else None,
    )
    product = Product(
        name=payload.name.strip(),
        barcode=payload.barcode.strip() if payload.barcode else None,
        sku=payload.sku.strip() if payload.sku else None,
        category=payload.category.strip() if payload.category else "General",
        price=unit_price,
        cost=unit_cost,
        stock=float(payload.stock or 0.0),
        unit=payload.unit or "und",
        tax_rate=float(payload.tax_rate if payload.tax_rate is not None else 19.0),
        supplier_id=payload.supplier_id,
        image_url=payload.image_url,
        is_service=bool(payload.is_service),
        margin_percent=payload.margin_percent,
        units_per_package=payload.units_per_package or 1.0,
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
    package_cost = data.pop("package_cost", None)
    units_per_package = data.pop("units_per_package", None)
    margin_percent = data.pop("margin_percent", None)
    # ¿El request trajo un precio explícito? (el formulario siempre lo manda, calculado o
    # digitado a mano) — si sí, gana sobre el % de utilidad, igual que en create_product.
    price_sent = data.get("price")

    for key, value in data.items():
        setattr(product, key, value)

    if package_cost is not None or margin_percent is not None:
        unit_cost, unit_price = compute_unit_pricing(
            package_cost, units_per_package or product.units_per_package, margin_percent,
            fallback_cost=product.cost, fallback_price=product.price,
            explicit_price=float(price_sent) if price_sent else None,
        )
        product.cost = unit_cost
        product.price = unit_price
    if margin_percent is not None:
        product.margin_percent = margin_percent
    if units_per_package is not None:
        product.units_per_package = units_per_package

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

        unit_cost, unit_price = compute_unit_pricing(
            it.package_cost, it.units_per_package, it.margin_percent,
            fallback_cost=float(it.cost or 0.0), fallback_price=float(it.price or 0.0),
            explicit_price=float(it.price) if it.price else None,
        )

        if existing:
            existing.price = unit_price
            existing.cost = unit_cost
            existing.category = it.category or existing.category
            existing.stock = existing.stock + float(it.stock)
            if it.margin_percent is not None:
                existing.margin_percent = it.margin_percent
            if it.units_per_package is not None:
                existing.units_per_package = it.units_per_package
            existing.updated_at = utcnow()
            updated += 1
        else:
            new_p = Product(
                name=it.name.strip(),
                barcode=it.barcode.strip() if it.barcode else None,
                sku=it.sku.strip() if it.sku else None,
                category=it.category.strip() if it.category else "General",
                price=unit_price,
                cost=unit_cost,
                stock=float(it.stock or 0.0),
                unit=it.unit or "und",
                tax_rate=float(it.tax_rate if it.tax_rate is not None else 19.0),
                supplier_id=it.supplier_id,
                is_service=bool(it.is_service),
                margin_percent=it.margin_percent,
                units_per_package=it.units_per_package or 1.0,
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
    {"name": "Arroz Diana 500g", "barcode": "7702001010011", "category": "Granos", "price": 2500, "cost": 1800, "stock": 40, "unit": "und", "tax_rate": 0.0},
    {"name": "Aceite Girasol 1L", "barcode": "7702001010028", "category": "Aceites", "price": 12500, "cost": 9800, "stock": 22, "unit": "und", "tax_rate": 19.0},
    {"name": "Panela cuadrada 500g", "barcode": "7702001010035", "category": "Endulzantes", "price": 3800, "cost": 2600, "stock": 30, "unit": "und", "tax_rate": 0.0},
    {"name": "Leche Alqueria 1L", "barcode": "7702001010042", "category": "Lácteos", "price": 4800, "cost": 3600, "stock": 25, "unit": "und", "tax_rate": 0.0},
    {"name": "Huevos AA x30", "barcode": "7702001010059", "category": "Huevos", "price": 18500, "cost": 14000, "stock": 12, "unit": "und", "tax_rate": 0.0},
    {"name": "Pan tajado Bimbo", "barcode": "7702001010066", "category": "Panadería", "price": 6900, "cost": 4900, "stock": 15, "unit": "und", "tax_rate": 0.0},
    {"name": "Café Sello Rojo 250g", "barcode": "7702001010073", "category": "Café", "price": 9800, "cost": 7000, "stock": 20, "unit": "und", "tax_rate": 19.0},
    {"name": "Frijol rojo 500g", "barcode": "7702001010080", "category": "Granos", "price": 5200, "cost": 3800, "stock": 18, "unit": "und", "tax_rate": 0.0},
    {"name": "Coca-Cola 1.5L", "barcode": "7702001010097", "category": "Bebidas", "price": 5500, "cost": 4100, "stock": 30, "unit": "und", "tax_rate": 19.0},
    {"name": "Jabón Rey 300g", "barcode": "7702001010103", "category": "Aseo", "price": 4200, "cost": 3000, "stock": 24, "unit": "und", "tax_rate": 19.0},
    {"name": "Chocolatina Jet", "barcode": "7702001010110", "category": "Golosinas", "price": 1200, "cost": 800, "stock": 60, "unit": "und", "tax_rate": 19.0},
    {"name": "Papas Margarita 105g", "barcode": "7702001010127", "category": "Snacks", "price": 4500, "cost": 3200, "stock": 20, "unit": "und", "tax_rate": 19.0},
]

_SEED_CONTACTS = [
    {"kind": "supplier", "name": "Distribuidora La Cosecha", "document": "900123456-7", "document_type": "NIT", "phone": "3001112233", "city": "Bogotá", "notes": "Distribuidor mayorista de granos y abarrotes"},
    {"kind": "supplier", "name": "Nutresa S.A.", "document": "890900608-9", "document_type": "NIT", "phone": "6045118111", "city": "Medellín", "notes": "Galletas, chocolates, café y cárnicos"},
    {"kind": "supplier", "name": "Alquería Colombia", "document": "860002130-1", "document_type": "NIT", "phone": "3108889900", "city": "Cajicá", "notes": "Lácteos y derivados"},
    {"kind": "customer", "name": "Consumidor Final", "document": "222222222222", "document_type": "NIT", "city": "Colombia", "notes": "Cliente estándar ventas POS"},
    {"kind": "customer", "name": "María López", "document": "1020304050", "document_type": "CC", "phone": "3113334455", "city": "Bogotá", "notes": "Cliente frecuente crédito/fiado"},
    {"kind": "customer", "name": "Carlos Rodríguez", "document": "1030405060", "document_type": "CC", "phone": "3124445566", "city": "Medellín", "notes": "Cliente mostrador"},
]

_SEED_CATEGORIES = [
    {"name": "Granos", "emoji": "🍚", "pinned": True, "order": 1},
    {"name": "Lácteos", "emoji": "🥛", "pinned": True, "order": 2},
    {"name": "Bebidas", "emoji": "🥤", "pinned": True, "order": 3},
    {"name": "Panadería", "emoji": "🍞", "pinned": True, "order": 4},
    {"name": "Huevos", "emoji": "🥚", "pinned": True, "order": 5},
    {"name": "Café", "emoji": "☕", "pinned": True, "order": 6},
    {"name": "Aceites", "emoji": "🌻", "pinned": True, "order": 7},
    {"name": "Snacks", "emoji": "🥔", "pinned": True, "order": 8},
    {"name": "Golosinas", "emoji": "🍫", "pinned": True, "order": 9},
    {"name": "Aseo", "emoji": "🧼", "pinned": True, "order": 10},
    {"name": "Endulzantes", "emoji": "🍯", "pinned": False, "order": 11},
]


class SeedOptionsIn(BaseModel):
    force: bool = False


@products_router.post("/seed")
async def seed_data(
    payload: Optional[SeedOptionsIn] = None,
    force: bool = Query(False),
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    force_mode = force or (payload.force if payload else False)
    existing_count = (await session.execute(select(func.count(Product.id)))).scalar_one()

    # Si ya existen productos y no es forzado, informar
    if existing_count > 0 and not force_mode:
        return {
            "ok": True,
            "seeded": False,
            "message": f"El sistema ya cuenta con {existing_count} producto(s). Usa el modo 'Forzar Carga' o 'Regenerar' si deseas reponer los productos demo.",
            "existing_products": existing_count,
        }

    # Cargar / reponer productos demo sin duplicar barcodes
    existing_barcodes = set((await session.execute(select(Product.barcode).where(Product.barcode.isnot(None)))).scalars().all())
    existing_names = set((await session.execute(select(Product.name))).scalars().all())
    
    products_added = 0
    for p in _SEED_PRODUCTS:
        if p.get("barcode") not in existing_barcodes and p.get("name") not in existing_names:
            session.add(Product(**p))
            products_added += 1

    # Cargar contactos demo sin duplicar documentos
    existing_docs = set((await session.execute(select(Contact.document).where(Contact.document.isnot(None)))).scalars().all())
    contacts_added = 0
    for c in _SEED_CONTACTS:
        if c.get("document") not in existing_docs:
            session.add(Contact(**c))
            contacts_added += 1

    # Cargar categorías con emojis
    for cat in _SEED_CATEGORIES:
        cat_row = await session.get(CategoryMeta, cat["name"])
        if not cat_row:
            session.add(CategoryMeta(**cat))

    await session.commit()

    total_products = (await session.execute(select(func.count(Product.id)))).scalar_one()
    total_contacts = (await session.execute(select(func.count(Contact.id)))).scalar_one()

    return {
        "ok": True,
        "seeded": True,
        "products": products_added,
        "contacts": contacts_added,
        "total_products": total_products,
        "total_contacts": total_contacts,
        "message": f"Datos demo listos: +{products_added} productos y +{contacts_added} contactos incorporados.",
    }
