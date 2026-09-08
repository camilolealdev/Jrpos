from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Product, PurchaseOrder, PurchaseOrderItem, User, utcnow

purchase_orders_router = APIRouter(prefix="/api", tags=["purchase-orders"])


class PurchaseOrderItemIn(BaseModel):
    name: str
    barcode: Optional[str] = None
    qty: float = 1.0
    cost: float = 0.0
    price: Optional[float] = None


class PurchaseOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    barcode: Optional[str] = None
    qty: float
    cost: float
    price: Optional[float] = None


class PurchaseOrderCreate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    items: List[PurchaseOrderItemIn] = []


class PurchaseOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    items: List[PurchaseOrderItemOut] = []
    total: float
    status: str
    created_at: datetime
    received_at: Optional[datetime] = None


async def _po_out(session: AsyncSession, po: PurchaseOrder) -> PurchaseOrderOut:
    items = (
        await session.execute(
            select(PurchaseOrderItem).where(
                PurchaseOrderItem.purchase_order_id == po.id,
                PurchaseOrderItem.tenant_id == po.tenant_id,
            )
        )
    ).scalars().all()
    return PurchaseOrderOut(
        id=po.id, number=po.number, supplier_id=po.supplier_id, supplier_name=po.supplier_name,
        items=items, total=po.total, status=po.status, created_at=po.created_at, received_at=po.received_at,
    )


@purchase_orders_router.post("/purchase-orders", response_model=PurchaseOrderOut)
async def create_purchase_order(
    payload: PurchaseOrderCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    if not payload.items:
        raise HTTPException(status_code=400, detail="Agrega al menos un ítem")

    total = round(sum(float(i.qty) * float(i.cost) for i in payload.items), 2)
    seq = (await session.execute(text("SELECT nextval('purchase_orders_number_seq')"))).scalar_one()
    number = f"OC-{seq:06d}"

    po = PurchaseOrder(
        tenant_id=tenant_id,
        number=number, supplier_id=payload.supplier_id, supplier_name=payload.supplier_name,
        total=total, status="enviada",
    )
    session.add(po)
    await session.flush()

    for it in payload.items:
        session.add(PurchaseOrderItem(
            tenant_id=tenant_id,
            purchase_order_id=po.id, name=it.name, barcode=it.barcode,
            qty=it.qty, cost=it.cost, price=it.price,
        ))

    await session.commit()
    return await _po_out(session, po)


@purchase_orders_router.get("/purchase-orders", response_model=List[PurchaseOrderOut])
async def list_purchase_orders(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant_id).order_by(PurchaseOrder.created_at.desc()).limit(300)
    pos = (await session.execute(stmt)).scalars().all()
    return [await _po_out(session, po) for po in pos]


@purchase_orders_router.post("/purchase-orders/{oid}/receive")
async def receive_purchase_order(
    oid: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    po = await session.get(PurchaseOrder, oid)
    if not po or po.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="No encontrada")
    if po.status == "recibida":
        raise HTTPException(status_code=400, detail="Ya fue recibida")

    items = (
        await session.execute(
            select(PurchaseOrderItem).where(
                PurchaseOrderItem.purchase_order_id == po.id,
                PurchaseOrderItem.tenant_id == tenant_id,
            )
        )
    ).scalars().all()

    for it in items:
        existing = None
        if it.barcode:
            existing = (
                await session.execute(select(Product).where(Product.barcode == it.barcode, Product.tenant_id == tenant_id))
            ).scalar_one_or_none()
        if not existing:
            existing = (
                await session.execute(select(Product).where(Product.name == it.name, Product.tenant_id == tenant_id))
            ).scalar_one_or_none()

        if existing:
            existing.stock = float(existing.stock) + float(it.qty)
            existing.cost = float(it.cost)
            existing.updated_at = utcnow()
        else:
            session.add(Product(
                tenant_id=tenant_id,
                name=it.name, barcode=it.barcode,
                cost=float(it.cost), price=round(float(it.cost) * 1.3, 2),
                stock=float(it.qty),
            ))

    po.status = "recibida"
    po.received_at = utcnow()
    await session.commit()
    return {"ok": True}
