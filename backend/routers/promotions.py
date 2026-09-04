from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Promotion, User

promotions_router = APIRouter(prefix="/api", tags=["promotions"])


class PromotionCreate(BaseModel):
    name: Optional[str] = None
    type: str = "percent_all"
    value: float = 0.0
    category: Optional[str] = None
    active: bool = True
    start: Optional[str] = None
    end: Optional[str] = None


class PromotionUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    value: Optional[float] = None
    category: Optional[str] = None
    active: Optional[bool] = None
    start: Optional[str] = None
    end: Optional[str] = None


def _promo_dict(p: Promotion) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "type": p.type,
        "value": p.value,
        "category": p.category,
        "active": p.active,
        "start": p.start,
        "end": p.end,
        "created_at": p.created_at,
    }


@promotions_router.get("/promotions")
async def list_promotions(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Promotion).order_by(Promotion.created_at.desc()).limit(500)
    rows = (await session.execute(stmt)).scalars().all()
    return [_promo_dict(p) for p in rows]


@promotions_router.get("/promotions/active")
async def active_promotions(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    today = datetime.now(timezone.utc).date().isoformat()
    stmt = select(Promotion).where(
        Promotion.active == True,  # noqa: E712
        or_(Promotion.start.is_(None), Promotion.start == "", Promotion.start <= today),
        or_(Promotion.end.is_(None), Promotion.end == "", Promotion.end >= today),
    ).limit(500)
    rows = (await session.execute(stmt)).scalars().all()
    return [_promo_dict(p) for p in rows]


@promotions_router.post("/promotions")
async def create_promotion(
    payload: PromotionCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not payload.name or payload.value <= 0:
        raise HTTPException(status_code=400, detail="Nombre y valor > 0 requeridos")
    promo = Promotion(
        name=payload.name,
        type=payload.type or "percent_all",
        value=float(payload.value),
        category=payload.category,
        active=bool(payload.active),
        start=payload.start,
        end=payload.end,
    )
    session.add(promo)
    await session.commit()
    await session.refresh(promo)
    return _promo_dict(promo)


@promotions_router.put("/promotions/{pid}")
async def update_promotion(
    pid: str,
    payload: PromotionUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    promo = await session.get(Promotion, pid)
    if not promo:
        raise HTTPException(status_code=404, detail="No encontrada")
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(promo, key, value)
    await session.commit()
    await session.refresh(promo)
    return _promo_dict(promo)


@promotions_router.delete("/promotions/{pid}")
async def delete_promotion(
    pid: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    promo = await session.get(Promotion, pid)
    if promo:
        await session.delete(promo)
        await session.commit()
    return {"ok": True}
