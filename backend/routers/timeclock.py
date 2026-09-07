from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin
from db import get_session
from models_sql import SettingsTimeclockSchedule, Timeclock, User

timeclock_router = APIRouter(prefix="/api", tags=["timeclock"])


class MarkIn(BaseModel):
    type: str
    note: Optional[str] = None


class TimeclockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    user_name: str
    role: str
    type: str
    late: bool
    note: Optional[str] = None
    created_at: datetime


def _day_bounds(day: str) -> tuple[datetime, datetime]:
    y, m, d = (int(part) for part in day.split("-"))
    start = datetime(y, m, d, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


async def _get_schedule_values(session: AsyncSession) -> dict:
    row = await session.get(SettingsTimeclockSchedule, 1)
    if row:
        return {
            "entry_time": row.entry_time or "08:00",
            "tolerance_minutes": row.tolerance_minutes if row.tolerance_minutes is not None else 10,
        }
    return {"entry_time": "08:00", "tolerance_minutes": 10}


@timeclock_router.post("/timeclock/mark", response_model=TimeclockOut)
async def mark_timeclock(
    payload: MarkIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    mark_type = payload.type
    if mark_type not in ("in", "out"):
        raise HTTPException(status_code=400, detail="Tipo debe ser 'in' (entrada) u 'out' (salida)")

    today_str = datetime.now(timezone.utc).date().isoformat()
    today_start, today_end = _day_bounds(today_str)

    # No permitir dos marcas iguales seguidas en el mismo día
    last_stmt = (
        select(Timeclock)
        .where(
            Timeclock.user_id == user.id,
            Timeclock.created_at >= today_start,
            Timeclock.created_at < today_end,
        )
        .order_by(Timeclock.created_at.desc())
        .limit(1)
    )
    last = (await session.execute(last_stmt)).scalars().first()
    if last and last.type == mark_type:
        raise HTTPException(
            status_code=400,
            detail=f"Ya marcaste {'entrada' if mark_type == 'in' else 'salida'}; marca primero lo contrario",
        )

    # Salida requiere una entrada previa en el día
    if mark_type == "out" and (not last or last.type != "in"):
        raise HTTPException(status_code=400, detail="No puedes marcar salida sin haber marcado entrada hoy")

    now = datetime.now(timezone.utc)
    late = False
    if mark_type == "in":
        sched = await _get_schedule_values(session)
        try:
            hh, mm = sched["entry_time"].split(":")
            limit = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0) + timedelta(
                minutes=int(sched.get("tolerance_minutes", 0))
            )
            late = now > limit
        except Exception:
            late = False

    mark = Timeclock(
        user_id=user.id,
        user_name=user.name or user.email,
        role=user.role,
        type=mark_type,
        late=late,
        note=payload.note,
        created_at=now,
    )
    session.add(mark)
    await session.commit()
    await session.refresh(mark)
    return mark


@timeclock_router.get("/timeclock/today", response_model=List[TimeclockOut])
async def my_timeclock_today(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    today = datetime.now(timezone.utc).date().isoformat()
    start, end = _day_bounds(today)
    stmt = (
        select(Timeclock)
        .where(Timeclock.user_id == user.id, Timeclock.created_at >= start, Timeclock.created_at < end)
        .order_by(Timeclock.created_at.asc())
        .limit(50)
    )
    return (await session.execute(stmt)).scalars().all()


@timeclock_router.get("/timeclock/records")
async def timeclock_records(
    date: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    day = date or datetime.now(timezone.utc).date().isoformat()
    start, end = _day_bounds(day)
    stmt = (
        select(Timeclock)
        .where(Timeclock.created_at >= start, Timeclock.created_at < end)
        .order_by(Timeclock.created_at.asc())
        .limit(500)
    )
    marks = (await session.execute(stmt)).scalars().all()
    by_user: dict = {}
    for m in marks:
        by_user.setdefault(m.user_name, []).append(TimeclockOut.model_validate(m))
    return {"date": day, "employees": [{"name": k, "marks": v} for k, v in by_user.items()]}
