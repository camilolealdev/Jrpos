from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import CashPickup, CashSession, Sale, User, utcnow

cash_router = APIRouter(prefix="/api/cash", tags=["cash"])


# ----------------- Schemas -----------------
class CashOpenRequest(BaseModel):
    base: float = 0.0


class PickupIn(BaseModel):
    amount: float
    notes: Optional[str] = None


class CloseRequest(BaseModel):
    counted: float = 0.0


def _pickup_dict(p: CashPickup) -> dict:
    return {
        "id": p.id, "amount": p.amount, "notes": p.notes,
        "by": p.by, "created_at": p.created_at,
    }


def _session_dict(cs: CashSession, pickups: List[CashPickup]) -> dict:
    return {
        "id": cs.id, "user_id": cs.user_id, "opened_by": cs.opened_by,
        "opened_at": cs.opened_at, "base": cs.base, "status": cs.status,
        "closed_at": cs.closed_at, "counted": cs.counted, "expected": cs.expected,
        "diff": cs.diff, "sales_total": cs.sales_total, "sales_count": cs.sales_count,
        "pickups_total": cs.pickups_total, "pickups": [_pickup_dict(p) for p in pickups],
    }


async def _get_open_session(session: AsyncSession, user_id: str) -> Optional[CashSession]:
    stmt = select(CashSession).where(CashSession.user_id == user_id, CashSession.status == "open")
    return (await session.execute(stmt)).scalar_one_or_none()


async def _get_pickups(session: AsyncSession, cash_session_id: str) -> List[CashPickup]:
    stmt = select(CashPickup).where(CashPickup.cash_session_id == cash_session_id)
    return (await session.execute(stmt)).scalars().all()


async def _session_totals(session: AsyncSession, cash_session: CashSession) -> dict:
    """Ventas en efectivo desde la apertura + recogidas."""
    sales_stmt = select(Sale).where(
        Sale.payment_method == "efectivo",
        Sale.created_at >= cash_session.opened_at,
    )
    cash_sales = (await session.execute(sales_stmt)).scalars().all()
    sales_total = sum(float(s.total) for s in cash_sales)

    pickups = await _get_pickups(session, cash_session.id)
    pickups_total = sum(float(p.amount) for p in pickups)

    expected = round(cash_session.base + sales_total - pickups_total, 2)
    return {
        "sales_total": round(sales_total, 2),
        "sales_count": len(cash_sales),
        "pickups_total": round(pickups_total, 2),
        "expected": expected,
    }


# ----------------- Endpoints -----------------
@cash_router.post("/open")
async def open_cash(
    payload: CashOpenRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    existing = await _get_open_session(session, user.id)
    if existing:
        raise HTTPException(status_code=400, detail="Ya tienes una caja abierta. Ciérrala primero.")
    base = float(payload.base or 0)
    if base < 0:
        raise HTTPException(status_code=400, detail="La base no puede ser negativa")

    cs = CashSession(user_id=user.id, opened_by=user.name, base=base, status="open")
    session.add(cs)
    try:
        await session.commit()
    except IntegrityError:
        # Carrera: otra petición abrió una caja entre el chequeo y el commit.
        # El índice único parcial ix_cash_sessions_one_open_per_user evita el
        # duplicado a nivel de DB — lo convertimos en un 400 limpio en vez de
        # dejar que se propague el error crudo de la base de datos.
        await session.rollback()
        raise HTTPException(status_code=400, detail="Ya tienes una caja abierta. Ciérrala primero.")
    await session.refresh(cs)
    return _session_dict(cs, [])


@cash_router.get("/current")
async def current_cash(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    cs = await _get_open_session(session, user.id)
    if not cs:
        return {"open": False}
    totals = await _session_totals(session, cs)
    pickups = await _get_pickups(session, cs.id)
    return {
        "open": True,
        "session": _session_dict(cs, pickups),
        **totals,
    }


@cash_router.post("/pickup")
async def cash_pickup(
    payload: PickupIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    cs = await _get_open_session(session, user.id)
    if not cs:
        raise HTTPException(status_code=400, detail="No tienes caja abierta")
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

    pickup = CashPickup(cash_session_id=cs.id, amount=amount, notes=payload.notes, by=user.name)
    session.add(pickup)
    await session.commit()
    await session.refresh(pickup)
    return _pickup_dict(pickup)


@cash_router.post("/close")
async def close_cash(
    payload: CloseRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    cs = await _get_open_session(session, user.id)
    if not cs:
        raise HTTPException(status_code=400, detail="No tienes caja abierta")
    counted = float(payload.counted or 0)
    totals = await _session_totals(session, cs)
    diff = round(counted - totals["expected"], 2)

    cs.status = "closed"
    cs.closed_at = utcnow()
    cs.counted = counted
    cs.expected = totals["expected"]
    cs.diff = diff
    cs.sales_total = totals["sales_total"]
    cs.sales_count = totals["sales_count"]
    cs.pickups_total = totals["pickups_total"]

    await session.commit()
    await session.refresh(cs)
    pickups = await _get_pickups(session, cs.id)
    return _session_dict(cs, pickups)


@cash_router.get("/history")
async def cash_history(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(CashSession).where(CashSession.status == "closed")
    if user.role != "admin":
        stmt = stmt.where(CashSession.user_id == user.id)
    stmt = stmt.order_by(CashSession.closed_at.desc()).limit(100)
    sessions = (await session.execute(stmt)).scalars().all()

    result = []
    for cs in sessions:
        pickups = await _get_pickups(session, cs.id)
        result.append(_session_dict(cs, pickups))
    return result
