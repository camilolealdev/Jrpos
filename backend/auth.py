import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models_sql import Branch, LoginAttempt, PlatformPlan, SettingsGeneral, Tenant, TenantSubscription, User, new_uuid, utcnow

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        if os.environ.get("ENV") == "production":
            raise RuntimeError("FATAL: JWT_SECRET environment variable must be set in production.")
        return "jrpos-dev-secret-key-change-in-production-min-32-chars-ok"
    return secret


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^\w\s-]", "", value).strip().lower()
    return re.sub(r"[-\s]+", "-", value) or "tienda"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str, tenant_id: str | None = None) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "tenant_id": tenant_id or "tenant-default-001",
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def _cookie_flags() -> tuple[bool, str]:
    is_prod = os.environ.get("ENV") == "production" or os.environ.get("RAILWAY_ENVIRONMENT") is not None or os.environ.get("VERCEL") == "1"
    return is_prod, ("none" if is_prod else "lax")


def set_auth_cookies(response: Response, user: User) -> None:
    access = create_access_token(user.id, user.email, user.role, user.tenant_id)
    refresh = create_refresh_token(user.id)
    is_secure, same_site = _cookie_flags()
    response.set_cookie("access_token", access, httponly=True, secure=is_secure, samesite=same_site, max_age=8 * 3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=is_secure, samesite=same_site, max_age=7 * 86400, path="/")


async def get_current_user(request: Request, session: AsyncSession = Depends(get_session)) -> User:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
        user = (await session.execute(select(User).where(User.id == payload["sub"]))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("admin", "superadmin_platform"):
        raise HTTPException(status_code=403, detail="Solo administradores")
    return user


async def require_superadmin(user: User = Depends(get_current_user)) -> User:
    if user.role != "superadmin_platform":
        raise HTTPException(status_code=403, detail="Acceso exclusivo de SuperAdmin de Plataforma")
    return user


async def require_manager(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("admin", "supervisor", "superadmin_platform"):
        raise HTTPException(status_code=403, detail="Permiso denegado: requiere rol administrativo")
    return user


class LoginRequest(BaseModel):
    email: str
    password: str


class TenantRegisterRequest(BaseModel):
    business_name: str
    email: EmailStr
    password: str
    name: str | None = None
    phone: str | None = None
    business_type: str | None = "abarrotes"


auth_router = APIRouter(prefix="/api/auth")

LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15


@auth_router.post("/register-tenant")
async def register_tenant(payload: TenantRegisterRequest, response: Response, session: AsyncSession = Depends(get_session)):
    email = payload.email.strip().lower()
    existing_user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Ya existe una cuenta registrada con este correo electrónico")

    # 1. Generar slug único para el tenant
    base_slug = slugify(payload.business_name)
    slug = base_slug
    counter = 1
    while (await session.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none():
        slug = f"{base_slug}-{counter}"
        counter += 1

    # 2. Crear Tenant con 30 días de prueba gratuita
    tenant_id = new_uuid()
    trial_ends = utcnow() + timedelta(days=30)
    tenant = Tenant(
        id=tenant_id,
        slug=slug,
        business_name=payload.business_name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        email=email,
        business_type=payload.business_type or "abarrotes",
        status="trial",
        trial_ends_at=trial_ends,
    )
    session.add(tenant)

    # 3. Crear Usuario Administrador de la Tienda
    user_id = new_uuid()
    owner_name = payload.name.strip() if payload.name else (payload.business_name.strip() or "Propietario")
    user = User(
        id=user_id,
        tenant_id=tenant_id,
        email=email,
        password_hash=hash_password(payload.password),
        name=owner_name,
        role="admin",
    )
    session.add(user)

    # 4. Crear Sucursal Principal
    branch = Branch(
        id=new_uuid(),
        tenant_id=tenant_id,
        name="Sede Principal",
        phone=payload.phone,
        is_active=True,
    )
    session.add(branch)

    # 5. Suscripción Trial al Plan Pro
    sub = TenantSubscription(
        id=new_uuid(),
        tenant_id=tenant_id,
        plan_id="pro",
        status="trial",
        current_period_start=utcnow(),
        current_period_end=trial_ends,
        amount_cop=0.0,
        payment_gateway="manual",
    )
    session.add(sub)

    await session.commit()
    set_auth_cookies(response, user)

    return {
        "ok": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "tenant_id": tenant_id,
        },
        "tenant": {
            "id": tenant.id,
            "name": tenant.business_name,
            "slug": tenant.slug,
            "status": tenant.status,
            "trial_ends_at": tenant.trial_ends_at.isoformat(),
        },
    }


@auth_router.post("/login")
async def login(payload: LoginRequest, response: Response, session: AsyncSession = Depends(get_session)):
    email = payload.email.strip().lower()
    attempt = await session.get(LoginAttempt, email)
    if attempt and attempt.count >= LOCKOUT_THRESHOLD:
        if attempt.locked_until and attempt.locked_until > utcnow():
            raise HTTPException(
                status_code=429,
                detail="Cuenta bloqueada temporalmente por demasiados intentos. Espera 15 minutos.",
                headers={"Retry-After": "900"},
            )

    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        if attempt is None:
            attempt = LoginAttempt(identifier=email, count=0)
            session.add(attempt)
        attempt.count += 1
        attempt.locked_until = utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
        await session.commit()
        if attempt.count >= LOCKOUT_THRESHOLD:
            raise HTTPException(
                status_code=429,
                detail="Cuenta bloqueada temporalmente por demasiados intentos. Espera 15 minutos.",
                headers={"Retry-After": "900"},
            )
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    if attempt is not None:
        await session.delete(attempt)
        await session.commit()

    tenant_info = None
    if user.tenant_id:
        tenant = await session.get(Tenant, user.tenant_id)
        if tenant:
            days_left = max(0, (tenant.trial_ends_at - utcnow()).days) if tenant.trial_ends_at else 0
            tenant_info = {
                "id": tenant.id,
                "name": tenant.business_name,
                "status": tenant.status,
                "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
                "days_left": days_left,
            }

    set_auth_cookies(response, user)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "tenant": tenant_info,
    }


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@auth_router.get("/me")
async def me(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    tenant_info = None
    if user.tenant_id:
        tenant = await session.get(Tenant, user.tenant_id)
        if tenant:
            days_left = max(0, (tenant.trial_ends_at - utcnow()).days) if tenant.trial_ends_at else 0
            tenant_info = {
                "id": tenant.id,
                "name": tenant.business_name,
                "status": tenant.status,
                "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
                "days_left": days_left,
            }

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "tenant": tenant_info,
    }


@auth_router.post("/refresh")
async def refresh(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Sin refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = (await session.execute(select(User).where(User.id == payload["sub"]))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    access = create_access_token(user.id, user.email, user.role, user.tenant_id)
    is_secure, same_site = _cookie_flags()
    response.set_cookie("access_token", access, httponly=True, secure=is_secure, samesite=same_site, max_age=8 * 3600, path="/")
    return {"ok": True}


async def seed_admin(session: AsyncSession) -> None:
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        return

    existing = (await session.execute(select(User).where(User.email == admin_email))).scalar_one_or_none()
    if existing is None:
        old_admin = (await session.execute(select(User).where(User.role == "admin"))).scalars().first()
        if old_admin:
            old_admin.email = admin_email
            old_admin.password_hash = hash_password(admin_password)
            old_admin.tenant_id = old_admin.tenant_id or "tenant-default-001"
        else:
            session.add(User(
                id=new_uuid(),
                tenant_id="tenant-default-001",
                email=admin_email,
                password_hash=hash_password(admin_password),
                name="Administrador",
                role="admin",
            ))
    elif not verify_password(admin_password, existing.password_hash):
        existing.password_hash = hash_password(admin_password)
        if not existing.tenant_id:
            existing.tenant_id = "tenant-default-001"

    await session.commit()
