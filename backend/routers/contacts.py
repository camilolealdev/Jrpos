from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Contact, User

contacts_router = APIRouter(prefix="/api", tags=["contacts"])


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
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
    contact = Contact(**payload.model_dump())
    session.add(contact)
    await session.commit()
    await session.refresh(contact)
    return contact


@contacts_router.get("/contacts", response_model=List[ContactOut])
async def list_contacts(
    kind: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Contact)
    if kind:
        stmt = stmt.where(Contact.kind == kind)
    stmt = stmt.limit(1000)
    res = await session.execute(stmt)
    return res.scalars().all()


@contacts_router.put("/contacts/{contact_id}", response_model=ContactOut)
async def update_contact(
    contact_id: str,
    payload: ContactCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    contact = await session.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    for key, value in payload.model_dump().items():
        setattr(contact, key, value)
    await session.commit()
    await session.refresh(contact)
    return contact


@contacts_router.delete("/contacts/{contact_id}")
async def delete_contact(
    contact_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    contact = await session.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    await session.delete(contact)
    await session.commit()
    return {"ok": True}
