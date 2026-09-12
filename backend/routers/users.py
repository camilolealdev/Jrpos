from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import hash_password, require_admin
from business_types import STAFF_ROLES_BY_BUSINESS_TYPE
from db import get_session
from models_sql import LoginAttempt, Tenant, User
from entitlements import check_user_limit

users_router = APIRouter(prefix="/api", tags=["users"])


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "cajero"


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str


@users_router.get("/users", response_model=List[UserOut])
async def list_users(
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    stmt = select(User).where(User.tenant_id == tenant_id)
    res = await session.execute(stmt)
    return res.scalars().all()


@users_router.post("/users", response_model=UserOut)
async def create_user(
    payload: UserCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    email = payload.email.strip().lower()
    existing = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    await check_user_limit(session, tenant_id)

    tenant = await session.get(Tenant, tenant_id)
    staff_roles = STAFF_ROLES_BY_BUSINESS_TYPE.get(tenant.business_type if tenant else None, ["cajero"])
    allowed_roles = {"admin", "supervisor", "contador", *staff_roles}
    user = User(
        tenant_id=tenant_id,
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        role=payload.role if payload.role in allowed_roles else staff_roles[0],
    )
    session.add(user)
    await session.commit()
    return user


class ResetPasswordIn(BaseModel):
    new_password: str


@users_router.put("/users/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    payload: ResetPasswordIn,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    if len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")
    user = await session.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.password_hash = hash_password(payload.new_password)
    attempt = await session.get(LoginAttempt, user.email)
    if attempt:
        await session.delete(attempt)
    await session.commit()
    return {"ok": True}


@users_router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    user = await session.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await session.delete(user)
    await session.commit()
    return {"ok": True}
