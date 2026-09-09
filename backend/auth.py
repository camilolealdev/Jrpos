import os
import re
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models_sql import Branch, LoginAttempt, PlatformPlan, SettingsGeneral, Tenant, TenantSubscription, User, new_uuid, utcnow
from observability import logger, tenant_id_ctx, user_id_ctx

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
            logger.warning("Auth: usuario del token no existe")
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        # Capa 7: amarrar contexto de tenant/user para todos los logs del request
        tenant_id_ctx.set(user.tenant_id)
        user_id_ctx.set(user.id)
        # Bloqueo por trial vencido (superadmin y admins de tenants activos/suscritos pasan)
        if user.role != "superadmin_platform" and user.tenant_id:
            tenant = (await session.execute(select(Tenant).where(Tenant.id == user.tenant_id))).scalar_one_or_none()
            if tenant:
                expired = tenant.status == "trial" and tenant.trial_ends_at and tenant.trial_ends_at < utcnow()
                suspended = tenant.status in ("suspended", "cancelled")
                if expired or suspended:
                    raise HTTPException(
                        status_code=403,
                        detail="Trial vencido o cuenta suspendida. Activa tu plan para continuar.",
                    )
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
    # Solo el superadmin de plataforma. Un admin de tienda NUNCA debe ver
    # datos de otras tiendas (aislamiento multi-tenant).
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


class GoogleAuthRequest(BaseModel):
    credential: str
    business_name: str | None = None
    name: str | None = None
    phone: str | None = None
    business_type: str | None = None


auth_router = APIRouter(prefix="/api/auth")

LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15


async def _provision_tenant(
    session: AsyncSession,
    *,
    business_name: str,
    email: str,
    name: str,
    phone: str | None,
    business_type: str | None,
    password_hash: str,
    google_id: str | None = None,
) -> tuple[User, Tenant]:
    # 1. Generar slug único para el tenant
    base_slug = slugify(business_name)
    slug = base_slug
    counter = 1
    while (await session.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none():
        slug = f"{base_slug}-{counter}"
        counter += 1

    # 2. Crear Tenant con 30 días de prueba gratuita
    tenant_id = new_uuid()
    trial_days = int(os.environ.get("TRIAL_DAYS", "365"))
    trial_ends = utcnow() + timedelta(days=trial_days)
    tenant = Tenant(
        id=tenant_id,
        slug=slug,
        business_name=business_name.strip(),
        phone=phone.strip() if phone else None,
        email=email,
        business_type=business_type or "abarrotes",
        status="trial",
        trial_ends_at=trial_ends,
    )
    session.add(tenant)

    # 3. Crear Usuario Administrador de la Tienda
    user_id = new_uuid()
    owner_name = name.strip() if name else (business_name.strip() or "Propietario")
    user = User(
        id=user_id,
        tenant_id=tenant_id,
        email=email,
        password_hash=password_hash,
        name=owner_name,
        role="admin",
        google_id=google_id,
    )
    session.add(user)

    # 4. Crear Sucursal Principal
    branch = Branch(
        id=new_uuid(),
        tenant_id=tenant_id,
        name="Sede Principal",
        phone=phone,
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
    return user, tenant


@auth_router.post("/register-tenant")
async def register_tenant(payload: TenantRegisterRequest, response: Response, session: AsyncSession = Depends(get_session)):
    email = payload.email.strip().lower()
    existing_user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Ya existe una cuenta registrada con este correo electrónico")

    user, tenant = await _provision_tenant(
        session,
        business_name=payload.business_name,
        email=email,
        name=payload.name,
        phone=payload.phone,
        business_type=payload.business_type,
        password_hash=hash_password(payload.password),
    )
    set_auth_cookies(response, user)

    return {
        "ok": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "tenant_id": tenant.id,
        },
        "tenant": {
            "id": tenant.id,
            "name": tenant.business_name,
            "slug": tenant.slug,
            "status": tenant.status,
            "trial_ends_at": tenant.trial_ends_at.isoformat(),
        },
    }


async def _tenant_info_for(session: AsyncSession, user: User) -> dict | None:
    if not user.tenant_id:
        return None
    tenant = await session.get(Tenant, user.tenant_id)
    if not tenant:
        return None
    trial_end = tenant.trial_ends_at
    if trial_end and trial_end.tzinfo is None:
        # SQLite (y algunos drivers) devuelven datetimes naive; trátalos como UTC
        # para evitar TypeError al restar contra utcnow() (aware).
        trial_end = trial_end.replace(tzinfo=timezone.utc)
    days_left = max(0, (trial_end - utcnow()).days) if trial_end else 0
    return {
        "id": tenant.id,
        "name": tenant.business_name,
        "status": tenant.status,
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        "days_left": days_left,
    }


@auth_router.post("/google")
async def google_auth(payload: GoogleAuthRequest, response: Response, session: AsyncSession = Depends(get_session)):
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="Login con Google no configurado en el servidor")

    try:
        idinfo = google_id_token.verify_oauth2_token(payload.credential, google_requests.Request(), client_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Token de Google inválido")

    if not idinfo.get("email_verified"):
        raise HTTPException(status_code=401, detail="El correo de Google no está verificado")

    email = idinfo["email"].strip().lower()
    google_sub = idinfo["sub"]

    user = (await session.execute(select(User).where(User.google_id == google_sub))).scalar_one_or_none()
    if not user:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user and not user.google_id:
            user.google_id = google_sub
            await session.commit()

    if user:
        set_auth_cookies(response, user)
        return {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "tenant": await _tenant_info_for(session, user),
        }

    if not payload.business_name:
        return {
            "needs_onboarding": True,
            "google": {
                "email": email,
                "name": idinfo.get("name"),
                "picture": idinfo.get("picture"),
            },
        }

    new_user, tenant = await _provision_tenant(
        session,
        business_name=payload.business_name,
        email=email,
        name=payload.name or idinfo.get("name") or payload.business_name,
        phone=payload.phone,
        business_type=payload.business_type,
        password_hash=hash_password(secrets.token_hex(32)),
        google_id=google_sub,
    )
    set_auth_cookies(response, new_user)

    return {
        "ok": True,
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role,
            "tenant_id": tenant.id,
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
async def login(payload: LoginRequest, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    # Rate-limit por IP (Redis; no-op sin REDIS_URL). Complementa el lockout por email en DB.
    from redis_client import rate_limit
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "?"))
    if not await rate_limit(f"ratelimit:login:{ip}", limit=10, window=60):
        raise HTTPException(status_code=429, detail="Demasiados intentos desde esta red. Espera un minuto.")
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

    set_auth_cookies(response, user)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "tenant": await _tenant_info_for(session, user),
    }


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@auth_router.get("/me")
async def me(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "tenant": await _tenant_info_for(session, user),
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
    # 1. Garantizar Usuario SuperAdmin Global de Plataforma SaaS
    superadmin_email = (os.environ.get("SUPERADMIN_EMAIL") or "superadmin@jrpos.co").strip().lower()
    superadmin_password = os.environ.get("SUPERADMIN_PASSWORD") or "superadmin123"

    super_user = (await session.execute(select(User).where(User.email == superadmin_email))).scalar_one_or_none()
    if super_user is None:
        session.add(User(
            id=new_uuid(),
            tenant_id=None,
            email=superadmin_email,
            password_hash=hash_password(superadmin_password),
            name="SuperAdmin Plataforma",
            role="superadmin_platform",
        ))
    else:
        super_user.role = "superadmin_platform"
        if not verify_password(superadmin_password, super_user.password_hash):
            super_user.password_hash = hash_password(superadmin_password)

    # 2. Garantizar Tenant por defecto y Usuario Administrador de Tienda
    admin_email = (os.environ.get("ADMIN_EMAIL") or "admin@jrpos.co").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD") or "admin123"

    default_tenant_id = "tenant-default-001"
    tenant = await session.get(Tenant, default_tenant_id)
    if not tenant:
        trial_ends = utcnow() + timedelta(days=365)
        tenant = Tenant(
            id=default_tenant_id,
            slug="tienda-principal",
            business_name="Minimarket El Progreso",
            email=admin_email,
            phone="3001234567",
            business_type="abarrotes",
            status="active",
            trial_ends_at=trial_ends,
        )
        session.add(tenant)
        await session.flush()

    existing = (await session.execute(select(User).where(User.email == admin_email))).scalar_one_or_none()
    if existing is None:
        old_admin = (await session.execute(select(User).where(User.role == "admin"))).scalars().first()
        if old_admin:
            old_admin.email = admin_email
            old_admin.password_hash = hash_password(admin_password)
            old_admin.tenant_id = old_admin.tenant_id or default_tenant_id
        else:
            session.add(User(
                id=new_uuid(),
                tenant_id=default_tenant_id,
                email=admin_email,
                password_hash=hash_password(admin_password),
                name="Administrador",
                role="admin",
            ))
    elif not verify_password(admin_password, existing.password_hash):
        existing.password_hash = hash_password(admin_password)
        if not existing.tenant_id:
            existing.tenant_id = default_tenant_id

    await session.commit()
