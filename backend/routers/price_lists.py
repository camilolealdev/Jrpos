from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models_sql import PriceList, PriceListItem, User
from permissions import require_permission
from pricing import resolve_price_list_overrides

price_lists_router = APIRouter(prefix="/api", tags=["price_lists"])


# ----------------- Schemas -----------------
class PriceListItemIn(BaseModel):
    product_id: str
    price: float


class PriceListItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    price: float


class PriceListCreate(BaseModel):
    name: str
    active: bool = True
    start: Optional[str] = None
    end: Optional[str] = None
    items: List[PriceListItemIn] = []


class PriceListUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    start: Optional[str] = None
    end: Optional[str] = None
    # Si viene (aunque sea []), remplaza todos los items existentes de la lista;
    # si se omite, los items actuales quedan intactos (igual patrón que held.py
    # no usa, pero sigue la convención de PromotionUpdate: exclude_unset).
    items: Optional[List[PriceListItemIn]] = None


class PriceListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    active: bool
    start: Optional[str] = None
    end: Optional[str] = None
    items: List[PriceListItemOut] = []
    created_at: datetime


async def _pl_out(session: AsyncSession, pl: PriceList) -> PriceListOut:
    items = (
        await session.execute(
            select(PriceListItem).where(PriceListItem.price_list_id == pl.id).order_by(PriceListItem.id)
        )
    ).scalars().all()
    return PriceListOut(
        id=pl.id,
        name=pl.name,
        active=pl.active,
        start=pl.start,
        end=pl.end,
        items=list(items),
        created_at=pl.created_at,
    )


# ----------------- Endpoints -----------------
@price_lists_router.get("/price-lists", response_model=List[PriceListOut])
async def list_price_lists(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("price_lists:read")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(PriceList).where(PriceList.tenant_id == tenant_id).order_by(PriceList.created_at.desc()).limit(500)
    rows = (await session.execute(stmt)).scalars().all()
    return [await _pl_out(session, p) for p in rows]


@price_lists_router.get("/price-lists/active", response_model=List[PriceListOut])
async def active_price_lists(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("price_lists:read")),
):
    """Listas dentro de su ventana de fecha hoy (igual criterio que
    promotions.py's /promotions/active): active=true y start/end (si existen)
    cubriendo la fecha actual. Sirve tanto para el uso "mayorista" (sin fechas,
    siempre dentro de ventana) como el "happy hour" (con start/end acotado)."""
    tenant_id = user.tenant_id or "tenant-default-001"
    today = datetime.now(timezone.utc).date().isoformat()
    stmt = select(PriceList).where(
        PriceList.tenant_id == tenant_id,
        PriceList.active == True,  # noqa: E712
        or_(PriceList.start.is_(None), PriceList.start == "", PriceList.start <= today),
        or_(PriceList.end.is_(None), PriceList.end == "", PriceList.end >= today),
    ).limit(500)
    rows = (await session.execute(stmt)).scalars().all()
    return [await _pl_out(session, p) for p in rows]


@price_lists_router.get("/price-lists/effective-prices")
async def effective_prices(
    contact_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("price_lists:read")),
):
    """Mapa {product_id: price} resuelto para un cliente concreto (Contact.price_list_id),
    respetando active/start/end de la lista asignada. El POS lo consulta al
    seleccionar un cliente para sobreescribir precios del carrito; si no hay
    contact_id, o el cliente no tiene lista vigente, devuelve {} y el caller debe
    seguir usando Product.price sin cambios."""
    tenant_id = user.tenant_id or "tenant-default-001"
    return await resolve_price_list_overrides(session, tenant_id, contact_id)


@price_lists_router.get("/price-lists/{pid}", response_model=PriceListOut)
async def get_price_list(
    pid: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("price_lists:read")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    pl = await session.get(PriceList, pid)
    if not pl or pl.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="No encontrada")
    return await _pl_out(session, pl)


@price_lists_router.post("/price-lists", response_model=PriceListOut)
async def create_price_list(
    payload: PriceListCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("price_lists:manage")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    if not payload.name:
        raise HTTPException(status_code=400, detail="Nombre requerido")
    pl = PriceList(
        tenant_id=tenant_id,
        name=payload.name,
        active=bool(payload.active),
        start=payload.start,
        end=payload.end,
    )
    session.add(pl)
    await session.flush()  # asigna pl.id antes de crear los items hijos

    for it in payload.items:
        session.add(PriceListItem(price_list_id=pl.id, product_id=it.product_id, price=float(it.price)))

    await session.commit()
    return await _pl_out(session, pl)


@price_lists_router.put("/price-lists/{pid}", response_model=PriceListOut)
async def update_price_list(
    pid: str,
    payload: PriceListUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("price_lists:manage")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    pl = await session.get(PriceList, pid)
    if not pl or pl.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="No encontrada")

    updates = payload.model_dump(exclude_unset=True, exclude={"items"})
    for key, value in updates.items():
        setattr(pl, key, value)

    if payload.items is not None:
        # Remplazo completo: más simple y predecible para el editor de filas del
        # frontend (borra-y-recrea) que reconciliar altas/bajas/cambios uno a uno.
        await session.execute(delete(PriceListItem).where(PriceListItem.price_list_id == pid))
        for it in payload.items:
            session.add(PriceListItem(price_list_id=pid, product_id=it.product_id, price=float(it.price)))

    await session.commit()
    return await _pl_out(session, pl)


@price_lists_router.delete("/price-lists/{pid}")
async def delete_price_list(
    pid: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("price_lists:manage")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    pl = await session.get(PriceList, pid)
    if pl and pl.tenant_id == tenant_id:
        await session.execute(delete(PriceListItem).where(PriceListItem.price_list_id == pid))
        await session.delete(pl)
        await session.commit()
    return {"ok": True}
