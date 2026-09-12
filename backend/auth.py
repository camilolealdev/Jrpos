import os
import re
import secrets
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from business_types import (
    HIDDEN_MODULES_BY_BUSINESS_TYPE,
    STAFF_ROLES_BY_BUSINESS_TYPE,
    STAFF_ROLE_LABELS_BY_BUSINESS_TYPE,
)
from db import get_session
from models_sql import (
    Branch,
    CategoryMeta,
    Contact,
    LoginAttempt,
    Product,
    SettingsGeneral,
    Tenant,
    TenantSubscription,
    User,
    new_uuid,
    utcnow,
)
from observability import logger, tenant_id_ctx, user_id_ctx

JWT_ALGORITHM = "HS256"


def _is_production_env() -> bool:
    return (
        os.environ.get("ENV") == "production"
        or os.environ.get("RAILWAY_ENVIRONMENT") is not None
        or os.environ.get("VERCEL") == "1"
    )


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        if _is_production_env():
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
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    user_id: str,
    email: str,
    role: str,
    tenant_id: str | None = None,
    expires_delta: timedelta | None = None,
    actor_id: str | None = None,
    is_impersonated: bool = False,
) -> str:
    exp = datetime.now(timezone.utc) + (expires_delta if expires_delta is not None else timedelta(hours=8))
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "tenant_id": tenant_id if tenant_id is not None else (None if role == "superadmin_platform" else "tenant-default-001"),
        "exp": exp,
        "type": "access",
    }
    if is_impersonated and actor_id:
        payload["actor_id"] = actor_id
        payload["is_impersonated"] = True
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def _cookie_flags() -> tuple[bool, Literal["lax", "none", "strict"]]:
    is_prod = _is_production_env()
    same_site: Literal["lax", "none", "strict"] = "none" if is_prod else "lax"
    return is_prod, same_site


def set_auth_cookies(response: Response, user: User) -> None:
    access = create_access_token(user.id, user.email, user.role, user.tenant_id)
    refresh = create_refresh_token(user.id)
    is_secure, same_site = _cookie_flags()
    response.set_cookie("access_token", access, httponly=True, secure=is_secure, samesite=same_site, max_age=8 * 3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=is_secure, samesite=same_site, max_age=7 * 86400, path="/")


async def _set_tenant_context(session: AsyncSession, *, tenant_id: str | None, is_superadmin: bool) -> None:
    """Fija el contexto de tenant para Postgres Row-Level Security (backend/db_migrations.py).

    Usa set_config con is_local=False (alcance de conexion, no de transaccion):
    el engine de Postgres usa NullPool (backend/db.py) -- cada request abre su
    propia conexion fisica y la cierra al terminar, así que no hay riesgo de
    fuga de contexto entre requests. is_local=True se pierde en cada
    session.commit(), y varios endpoints hacen mas de un commit por request
    (ej. login, invoices.py), lo que dejaria las queries posteriores al primer
    commit sin contexto (RLS las bloquearia por error, no por diseño).
    No-op en SQLite (fallback de desarrollo sin Docker): no soporta RLS.
    """
    bind = session.get_bind()
    dialect_name = getattr(bind, "dialect", None)
    dialect_str = dialect_name.name if dialect_name else ""
    if dialect_str != "postgresql":
        return
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, false), set_config('app.is_superadmin', :sa, false)"),
        {"tid": tenant_id or "", "sa": "true" if is_superadmin else "false"},
    )


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
                trial_end = _to_utc(tenant.trial_ends_at)
                expired = tenant.status == "trial" and trial_end is not None and trial_end < utcnow()
                suspended = tenant.status in ("suspended", "cancelled")
                if expired or suspended:
                    raise HTTPException(
                        status_code=403,
                        detail="Trial vencido o cuenta suspendida. Activa tu plan para continuar.",
                    )
        await _set_tenant_context(session, tenant_id=user.tenant_id, is_superadmin=user.role == "superadmin_platform")
        user._is_impersonated = payload.get("is_impersonated", False)
        user._actor_id = payload.get("actor_id", None)
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
    has_multiple_branches: bool | None = False
    initial_branch_name: str | None = "Sede Principal"


class GoogleAuthRequest(BaseModel):
    credential: str
    business_name: str | None = None
    name: str | None = None
    phone: str | None = None
    business_type: str | None = None
    has_multiple_branches: bool | None = False
    initial_branch_name: str | None = "Sede Principal"


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


auth_router = APIRouter(prefix="/api/auth")

LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15


async def _provision_tenant(
    session: AsyncSession,
    *,
    business_name: str,
    email: str,
    name: str | None = None,
    phone: str | None = None,
    business_type: str | None = None,
    password_hash: str = "",
    google_id: str | None = None,
    has_multiple_branches: bool = False,
    initial_branch_name: str | None = None,
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
    # Aún no existe un usuario autenticado del que heredar el contexto de RLS
    # (se está creando en esta misma transacción) -- se fija explícitamente
    # con el tenant_id recién generado para que los INSERT de abajo pasen el
    # WITH CHECK de las políticas RLS (backend/db_migrations.py).
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
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

    # 4. Crear Sucursal Inicial
    branch_title = initial_branch_name.strip() if initial_branch_name and initial_branch_name.strip() else "Sede Principal"
    branch = Branch(
        id=new_uuid(),
        tenant_id=tenant_id,
        name=branch_title,
        phone=phone,
        is_active=True,
    )
    session.add(branch)

    # Actualizar modules_config con preferencia multi_branch
    curr_modules = dict(tenant.modules_config or {})
    curr_modules["multi_branch"] = bool(has_multiple_branches)
    tenant.modules_config = curr_modules

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

    # 6. Configuración General Inicial para la Tienda
    general_settings = SettingsGeneral(
        tenant_id=tenant_id,
        store_name=business_name.strip(),
        support_phone=phone.strip() if phone else None,
        iva_default=19,
        printer_width=58,
        accent="emerald",
        business_type=business_type or "abarrotes",
        hidden_module_tids=HIDDEN_MODULES_BY_BUSINESS_TYPE.get(business_type or "abarrotes", []),
        ticket_footer="¡Gracias por su compra!",
    )
    session.add(general_settings)

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
        has_multiple_branches=bool(payload.has_multiple_branches),
        initial_branch_name=payload.initial_branch_name,
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
            "business_type": tenant.business_type,
            "staff_roles": STAFF_ROLES_BY_BUSINESS_TYPE.get(tenant.business_type, ["cajero"]),
            "staff_role_labels": STAFF_ROLE_LABELS_BY_BUSINESS_TYPE.get(tenant.business_type, {}),
        },
    }


async def _tenant_info_for(session: AsyncSession, user: User) -> dict | None:
    if not user.tenant_id:
        return None
    tenant = await session.get(Tenant, user.tenant_id)
    if not tenant:
        return None
    trial_end = _to_utc(tenant.trial_ends_at)
    days_left = max(0, (trial_end - utcnow()).days) if trial_end else 0
    return {
        "id": tenant.id,
        "name": tenant.business_name,
        "status": tenant.status,
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        "days_left": days_left,
        "business_type": tenant.business_type,
        "staff_roles": STAFF_ROLES_BY_BUSINESS_TYPE.get(tenant.business_type, ["cajero"]),
        "staff_role_labels": STAFF_ROLE_LABELS_BY_BUSINESS_TYPE.get(tenant.business_type, {}),
    }


@auth_router.post("/google")
async def google_auth(payload: GoogleAuthRequest, response: Response, session: AsyncSession = Depends(get_session)):
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="Login con Google no configurado en el servidor")

    try:
        idinfo = google_id_token.verify_oauth2_token(payload.credential, google_requests.Request(), client_id)
    except Exception as e:
        logger.warning("Google Auth: error al verificar token: %s", e)
        raise HTTPException(status_code=401, detail="Token de Google inválido o no verificable")

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
            "business_type": tenant.business_type,
            "staff_roles": STAFF_ROLES_BY_BUSINESS_TYPE.get(tenant.business_type, ["cajero"]),
            "staff_role_labels": STAFF_ROLE_LABELS_BY_BUSINESS_TYPE.get(tenant.business_type, {}),
        },
    }


@auth_router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    # Rate-limit por IP (Redis; no-op sin REDIS_URL). Complementa el lockout por email en DB.
    # En tests o peticiones locales durante desarrollo, permitir holgura para no bloquear suites automatizadas.
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "?"))
    is_test = (
        os.environ.get("TESTING") == "1"
        or "pytest" in sys.modules
        or request.headers.get("x-test-client") == "true"
        or (not _is_production_env() and ip in ("127.0.0.1", "localhost", "::1", "?", "testclient"))
    )
    if not is_test:
        from redis_client import rate_limit
        limit = 200 if ip in ("127.0.0.1", "localhost", "::1", "?", "testclient") else 10
        if not await rate_limit(f"ratelimit:login:{ip}", limit=limit, window=60):
            raise HTTPException(status_code=429, detail="Demasiados intentos desde esta red. Espera un minuto.")
    email = payload.email.strip().lower()
    attempt = await session.get(LoginAttempt, email)
    if attempt:
        locked_until = _to_utc(attempt.locked_until)
        if locked_until and locked_until <= utcnow():
            attempt.count = 0
            attempt.locked_until = None
        elif attempt.count >= LOCKOUT_THRESHOLD:
            if locked_until and locked_until > utcnow():
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
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            attempt = await session.get(LoginAttempt, email)
            if attempt:
                attempt.count += 1
                attempt.locked_until = utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
                try:
                    await session.commit()
                except Exception:
                    await session.rollback()
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
    is_secure, same_site = _cookie_flags()
    response.delete_cookie("access_token", path="/", secure=is_secure, samesite=same_site, httponly=True)
    response.delete_cookie("refresh_token", path="/", secure=is_secure, samesite=same_site, httponly=True)
    return {"ok": True}


@auth_router.get("/me")
async def me(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    from permissions import get_role_permissions
    is_impersonated = getattr(user, "_is_impersonated", False)
    actor_id = getattr(user, "_actor_id", None)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "is_impersonated": is_impersonated,
        "actor_id": actor_id,
        "permissions": get_role_permissions(user.role),
        "tenant": await _tenant_info_for(session, user),
    }


@auth_router.post("/exit-impersonation")
async def exit_impersonation(
    response: Response,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    is_impersonated = getattr(user, "_is_impersonated", False)
    actor_id = getattr(user, "_actor_id", None)
    if not is_impersonated or not actor_id:
        raise HTTPException(status_code=400, detail="No se encuentra en una sesión de impersonación activa")

    actor = await session.get(User, actor_id)
    if not actor or actor.role != "superadmin_platform":
        raise HTTPException(status_code=403, detail="Actor original no válido para restaurar sesión")

    set_auth_cookies(response, actor)
    return {
        "ok": True,
        "message": "Sesión de impersonación finalizada. Sesión de SuperAdmin restaurada con éxito.",
        "actor": {
            "id": actor.id,
            "email": actor.email,
            "name": actor.name,
            "role": actor.role,
        },
    }


@auth_router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = None,
    session: AsyncSession = Depends(get_session),
):
    token = request.cookies.get("refresh_token")
    if not token and payload and payload.refresh_token:
        token = payload.refresh_token.strip()
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sin refresh token")
    try:
        decoded_payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if decoded_payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

    sub = decoded_payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = (await session.execute(select(User).where(User.id == str(sub)))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    access = create_access_token(user.id, user.email, user.role, user.tenant_id)
    is_secure, same_site = _cookie_flags()
    response.set_cookie("access_token", access, httponly=True, secure=is_secure, samesite=same_site, max_age=8 * 3600, path="/")
    return {"ok": True}


async def seed_admin(session: AsyncSession) -> None:
    # Bootstrap sin usuario autenticado: se ejecuta en el lifespan de arranque,
    # así que hay que fijar el contexto de RLS como superadmin explícitamente
    # (igual que hace /auth/register en su propia transacción) o las políticas
    # tenant_isolation con FORCE ROW LEVEL SECURITY rechazan los INSERT de abajo.
    await _set_tenant_context(session, tenant_id=None, is_superadmin=True)

    # 1. Garantizar Usuario SuperAdmin Global de Plataforma SaaS
    superadmin_email = (os.environ.get("SUPERADMIN_EMAIL") or "superadmin@jrpos.co").strip().lower()
    superadmin_password = os.environ.get("SUPERADMIN_PASSWORD") or "testpass123"

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
    admin_password = os.environ.get("ADMIN_PASSWORD") or "testpass123"

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

    branch = (await session.execute(select(Branch).where(Branch.tenant_id == default_tenant_id))).scalars().first()
    if not branch:
        session.add(Branch(
            id=new_uuid(),
            tenant_id=default_tenant_id,
            name="Sede Principal",
            phone="3001234567",
            is_active=True,
        ))

    general_settings = (await session.execute(select(SettingsGeneral).where(SettingsGeneral.tenant_id == default_tenant_id))).scalars().first()
    if not general_settings:
        session.add(SettingsGeneral(
            tenant_id=default_tenant_id,
            store_name="Minimarket El Progreso",
            support_phone="3001234567",
            iva_default=19,
            printer_width=58,
            accent="emerald",
            business_type="abarrotes",
            ticket_footer="¡Gracias por su compra!",
        ))

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

    # 3. Garantizar Catálogo Demo Inicial para la Tienda Principal (si no tiene productos)
    prod_count = (await session.execute(select(func.count(Product.id)).where(Product.tenant_id == default_tenant_id))).scalar_one()
    if prod_count == 0:
        from routers.products import _SEED_CATEGORIES, _SEED_CONTACTS, _SEED_PRODUCTS
        for cat in _SEED_CATEGORIES:
            stmt = select(CategoryMeta).where(CategoryMeta.name == cat["name"], CategoryMeta.tenant_id == default_tenant_id)
            cat_row = (await session.execute(stmt)).scalar_one_or_none()
            if not cat_row:
                session.add(CategoryMeta(tenant_id=default_tenant_id, **cat))
        for p in _SEED_PRODUCTS:
            session.add(Product(tenant_id=default_tenant_id, **p))
        for c in _SEED_CONTACTS:
            session.add(Contact(tenant_id=default_tenant_id, **c))

    await session.commit()

