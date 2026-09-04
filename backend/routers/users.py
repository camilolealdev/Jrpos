from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import hash_password, require_admin
from db import get_session
from models_sql import User

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
    res = await session.execute(select(User))
    return res.scalars().all()


@users_router.post("/users", response_model=UserOut)
async def create_user(
    payload: UserCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    email = payload.email.strip().lower()
    existing = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        role=payload.role if payload.role in ("admin", "cajero") else "cajero",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@users_router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await session.delete(user)
    await session.commit()
    return {"ok": True}
