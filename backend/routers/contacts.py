from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Contact, Sale, User

contacts_router = APIRouter(prefix="/api", tags=["contacts"])


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: Optional[str] = None
    kind: str
    name: str
    document: Optional[str] = None
    document_type: Optional[str] = "CC"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    credit_limit: Optional[float] = 0.0
    current_debt: Optional[float] = 0.0
    notes: Optional[str] = None


class ContactCreate(BaseModel):
    kind: str
    name: str
    document: Optional[str] = None
    document_type: Optional[str] = "CC"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    credit_limit: Optional[float] = 0.0
    notes: Optional[str] = None


@contacts_router.post("/contacts", response_model=ContactOut)
async def create_contact(
    payload: ContactCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    contact = Contact(tenant_id=tenant_id, **payload.model_dump())
    session.add(contact)
    await session.commit()
    return contact


@contacts_router.get("/contacts", response_model=List[ContactOut])
async def list_contacts(
    kind: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(Contact).where(Contact.tenant_id == tenant_id)
    if kind:
        stmt = stmt.where(Contact.kind == kind)
    stmt = stmt.limit(1000)
    res = await session.execute(stmt)
    contacts = res.scalars().all()

    # Deuda vigente por cliente a partir de las ventas a crédito sin saldar
    # (usado por el POS para el aviso/bloqueo de cupo de crédito).
    debt_rows = (
        await session.execute(
            select(Sale.customer_id, func.sum(Sale.balance_due))
            .where(Sale.tenant_id == tenant_id, Sale.is_credit == True, Sale.credit_status != "paid")  # noqa: E712
            .group_by(Sale.customer_id)
        )
    ).all()
    debt_by_customer = {row[0]: float(row[1] or 0) for row in debt_rows}
    for c in contacts:
        c.current_debt = debt_by_customer.get(c.id, 0.0)
    return contacts


@contacts_router.put("/contacts/{contact_id}", response_model=ContactOut)
async def update_contact(
    contact_id: str,
    payload: ContactCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    contact = (await session.execute(stmt)).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    for key, value in payload.model_dump().items():
        setattr(contact, key, value)
    await session.commit()
    return contact


@contacts_router.delete("/contacts/{contact_id}")
async def delete_contact(
    contact_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    contact = (await session.execute(stmt)).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    await session.delete(contact)
    await session.commit()
    return {"ok": True}

