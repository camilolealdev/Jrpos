from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import hash_password, require_admin, validate_password_strength
from business_types import STAFF_ROLES_BY_BUSINESS_TYPE
from db import get_session
from models_sql import LoginAttempt, Tenant, User
from entitlements import check_trial_staff_limit, check_user_limit
from permissions import (
    PERMISSIONS_CATALOG,
    get_effective_permissions_list,
    get_role_permissions,
)

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
    validate_password_strength(payload.password, email=email)

    await check_user_limit(session, tenant_id)
    await check_trial_staff_limit(session, tenant_id)

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
    user = await session.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    validate_password_strength(payload.new_password, email=user.email)
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


# ----------------- Editor de permisos por empleado -----------------
class PermissionsPayload(BaseModel):
    # None o [] = restablecer a los permisos del rol
    permissions: Optional[List[str]] = None


@users_router.get("/users/{user_id}/permissions")
async def get_user_permissions(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    user = await session.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role in ("admin", "superadmin_platform"):
        return {
            "catalog": [{"id": k, "description": v} for k, v in PERMISSIONS_CATALOG.items()],
            "role": user.role,
            "role_permissions": sorted(PERMISSIONS_CATALOG.keys()),
            "override": None,
            "effective": sorted(PERMISSIONS_CATALOG.keys()),
            "editable": False,
        }
    return {
        "catalog": [{"id": k, "description": v} for k, v in PERMISSIONS_CATALOG.items()],
        "role": user.role,
        "role_permissions": get_role_permissions(user.role),
        "override": (user.permissions_override or []) if isinstance(user.permissions_override, list) else [],
        "effective": get_effective_permissions_list(user),
        "editable": True,
    }


@users_router.put("/users/{user_id}/permissions")
async def set_user_permissions(
    user_id: str,
    payload: PermissionsPayload,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Los permisos del administrador no se pueden restringir")
    user = await session.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role in ("admin", "superadmin_platform"):
        raise HTTPException(status_code=400, detail="Los administradores siempre tienen acceso total")
    if not payload.permissions:
        user.permissions_override = None
    else:
        invalid = [p for p in payload.permissions if p not in PERMISSIONS_CATALOG]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Permisos desconocidos: {', '.join(invalid)}")
        user.permissions_override = sorted(set(payload.permissions))
    await session.commit()
    return {
        "ok": True,
        "override": user.permissions_override,
        "effective": get_effective_permissions_list(user),
    }
