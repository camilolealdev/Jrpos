import hashlib
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import CreditNote, Product, Sale, SaleItem, User

credit_notes_router = APIRouter(prefix="/api", tags=["credit_notes"])


class CreditNoteCreate(BaseModel):
    sale_id: str
    type: str = "credito"
    concept: str = "devolucion"
    amount: Optional[float] = None
    # Only relevant when type == "credito": re-ingresa el stock de la venta original.
    restock: bool = True


class CreditNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    sale_id: str
    sale_number: Optional[str] = None
    type: str
    concept: str
    amount: float
    cufe: str
    status: str
    created_at: datetime


# ----------------- Notas Crédito / Débito (simuladas DIAN) -----------------
@credit_notes_router.post("/credit-notes", response_model=CreditNoteOut)
async def create_credit_note(
    payload: CreditNoteCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    sale = await session.get(Sale, payload.sale_id)
    if not sale or sale.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    ntype = payload.type or "credito"
    sale_total = round(float(sale.total), 2)
    amount = round(payload.amount or sale_total, 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El monto de la nota debe ser mayor a 0")
    if amount > sale_total:
        raise HTTPException(
            status_code=400,
            detail=f"El monto de la nota ({amount}) no puede superar el total de la venta ({sale_total})",
        )

    prefix = "NC" if ntype == "credito" else "ND"

    # Todo lo siguiente ocurre en UNA sola transacción (un solo commit al final):
    # 1) crear la nota, 2) re-ingresar stock si aplica, 3) actualizar saldo de la venta si era a crédito.
    seq = (await session.execute(text("SELECT nextval('credit_notes_number_seq')"))).scalar_one()
    number = f"{prefix}-{seq:06d}"
    cufe = hashlib.sha256(f"{prefix}{sale.number}{amount}".encode()).hexdigest()

    note = CreditNote(
        tenant_id=tenant_id,
        number=number, sale_id=sale.id, sale_number=sale.number, type=ntype,
        concept=payload.concept or "devolucion", amount=amount, cufe=cufe, status="simulada",
    )
    session.add(note)

    # Devolución: re-ingresar stock de los items de la venta original.
    if ntype == "credito" and payload.restock:
        items = (await session.execute(select(SaleItem).where(SaleItem.sale_id == sale.id, SaleItem.tenant_id == tenant_id))).scalars().all()
        for it in items:
            await session.execute(
                update(Product).where(Product.id == it.product_id, Product.tenant_id == tenant_id).values(stock=Product.stock + it.qty)
            )

    # Si la venta era a crédito, bajar el saldo pendiente.
    if ntype == "credito" and sale.is_credit:
        new_bal = max(0.0, round(float(sale.balance_due) - amount, 2))
        sale.balance_due = new_bal
        sale.credit_status = "paid" if new_bal <= 0 else "partial"

    await session.commit()
    await session.refresh(note)
    return note


@credit_notes_router.get("/credit-notes", response_model=List[CreditNoteOut])
async def list_credit_notes(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(CreditNote).where(CreditNote.tenant_id == tenant_id).order_by(CreditNote.created_at.desc()).limit(300)
    return (await session.execute(stmt)).scalars().all()
