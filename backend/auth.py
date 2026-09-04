import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models_sql import LoginAttempt, User, new_uuid, utcnow

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        if os.environ.get("ENV") == "production":
            raise RuntimeError("FATAL: JWT_SECRET environment variable must be set in production.")
        return "jrpos-dev-secret-key-change-in-production-min-32-chars-ok"
    return secret


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8), "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def _cookie_flags() -> tuple[bool, str]:
    is_prod = os.environ.get("ENV") == "production" or os.environ.get("RAILWAY_ENVIRONMENT") is not None or os.environ.get("VERCEL") == "1"
    # secure=True y samesite=none para Vercel/Railway cross-origin; samesite=lax para localhost
    return is_prod, ("none" if is_prod else "lax")


def set_auth_cookies(response: Response, user: User) -> None:
    access = create_access_token(user.id, user.email, user.role)
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
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return user


class LoginRequest(BaseModel):
    email: str
    password: str


auth_router = APIRouter(prefix="/api/auth")

LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15


@auth_router.post("/login")
async def login(payload: LoginRequest, response: Response, session: AsyncSession = Depends(get_session)):
    email = payload.email.strip().lower()
    # Bloqueo por CUENTA (el IP del ingress rota entre réplicas del balanceador)
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
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@auth_router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


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
    access = create_access_token(user.id, user.email, user.role)
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
        # Migración: si ya hay un admin con otro correo, actualizarlo al nuevo
        old_admin = (await session.execute(select(User).where(User.role == "admin"))).scalars().first()
        if old_admin:
            old_admin.email = admin_email
            old_admin.password_hash = hash_password(admin_password)
        else:
            session.add(User(
                id=new_uuid(), email=admin_email, password_hash=hash_password(admin_password),
                name="Administrador", role="admin",
            ))
    elif not verify_password(admin_password, existing.password_hash):
        existing.password_hash = hash_password(admin_password)

    await session.commit()
