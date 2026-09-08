from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import HeldSale, HeldSaleItem, User

held_router = APIRouter(prefix="/api", tags=["held"])


# ----------------- Schemas -----------------
class HeldSaleItemIn(BaseModel):
    product_id: str
    name: str
    barcode: Optional[str] = None
    qty: float
    price: float
    tax_rate: Optional[float] = 19.0


class HeldSaleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_id: str
    name: str
    barcode: Optional[str] = None
    qty: float
    price: float
    tax_rate: Optional[float] = 19.0


class HeldSaleCreate(BaseModel):
    label: str
    items: List[HeldSaleItemIn]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None


class HeldSaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    label: str
    items: List[HeldSaleItemOut]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    total: float
    created_at: datetime


async def _held_out(session: AsyncSession, h: HeldSale) -> HeldSaleOut:
    items = (
        await session.execute(
            select(HeldSaleItem).where(HeldSaleItem.held_sale_id == h.id, HeldSaleItem.tenant_id == h.tenant_id)
        )
    ).scalars().all()
    return HeldSaleOut(
        id=h.id, label=h.label, items=items, customer_id=h.customer_id,
        customer_name=h.customer_name, total=h.total, created_at=h.created_at,
    )


# ----------------- Endpoints -----------------
@held_router.post("/held", response_model=HeldSaleOut)
async def hold_sale(
    payload: HeldSaleCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    total = sum(float(it.qty) * float(it.price) for it in payload.items)
    h = HeldSale(
        tenant_id=tenant_id,
        label=payload.label, customer_id=payload.customer_id,
        customer_name=payload.customer_name, total=round(total, 2),
    )
    session.add(h)
    await session.flush()  # assigns h.id

    for it in payload.items:
        session.add(HeldSaleItem(
            tenant_id=tenant_id,
            held_sale_id=h.id, product_id=it.product_id, name=it.name,
            barcode=it.barcode, qty=it.qty, price=it.price, tax_rate=it.tax_rate,
        ))

    await session.commit()
    return await _held_out(session, h)


@held_router.get("/held", response_model=List[HeldSaleOut])
async def list_held(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    # Orden ascendente (más antigua primero) — igual que el original, para
    # que la primera cuenta retenida sea la primera en aparecer en la lista.
    stmt = select(HeldSale).where(HeldSale.tenant_id == tenant_id).order_by(HeldSale.created_at.asc()).limit(100)
    held = (await session.execute(stmt)).scalars().all()
    return [await _held_out(session, h) for h in held]


@held_router.delete("/held/{held_id}")
async def delete_held(
    held_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    h = await session.get(HeldSale, held_id)
    if not h or h.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    await session.execute(delete(HeldSaleItem).where(HeldSaleItem.held_sale_id == held_id, HeldSaleItem.tenant_id == tenant_id))
    await session.delete(h)
    await session.commit()
    return {"ok": True}
