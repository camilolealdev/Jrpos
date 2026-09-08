from datetime import datetime
from typing import Any, Dict, List, Optional
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
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
    denominations: Optional[str] = None
    close_notes: Optional[str] = None


def _pickup_dict(p: CashPickup) -> dict:
    return {
        "id": p.id,
        "amount": p.amount,
        "notes": p.notes,
        "by": p.by,
        "created_at": p.created_at,
    }


def _session_dict(cs: CashSession, pickups: List[CashPickup]) -> dict:
    return {
        "id": cs.id,
        "tenant_id": cs.tenant_id,
        "user_id": cs.user_id,
        "opened_by": cs.opened_by,
        "opened_at": cs.opened_at,
        "base": cs.base,
        "status": cs.status,
        "closed_at": cs.closed_at,
        "counted": cs.counted,
        "expected": cs.expected,
        "diff": cs.diff,
        "sales_total": cs.sales_total,
        "sales_count": cs.sales_count,
        "pickups_total": cs.pickups_total,
        "denominations": cs.denominations,
        "close_notes": cs.close_notes,
        "pickups": [_pickup_dict(p) for p in pickups],
    }


async def _get_open_session(session: AsyncSession, user_id: str, tenant_id: Optional[str] = None) -> Optional[CashSession]:
    tenant_key = tenant_id or "tenant-default-001"
    stmt = select(CashSession).where(
        CashSession.user_id == user_id,
        CashSession.status == "open",
        CashSession.tenant_id == tenant_key,
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _get_pickups(session: AsyncSession, cash_session_id: str) -> List[CashPickup]:
    stmt = select(CashPickup).where(CashPickup.cash_session_id == cash_session_id).order_by(CashPickup.created_at.asc())
    return (await session.execute(stmt)).scalars().all()


async def _session_totals(session: AsyncSession, cash_session: CashSession) -> dict:
    """Ventas en efectivo desde la apertura + recogidas (scoping por tenant)."""
    tenant_key = cash_session.tenant_id or "tenant-default-001"
    sales_stmt = select(Sale).where(
        Sale.tenant_id == tenant_key,
        Sale.payment_method == "efectivo",
        Sale.created_at >= cash_session.opened_at,
    )
    if cash_session.closed_at:
        sales_stmt = sales_stmt.where(Sale.created_at <= cash_session.closed_at)

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
    tenant_id = user.tenant_id or "tenant-default-001"
    existing = await _get_open_session(session, user.id, tenant_id)
    if existing:
        raise HTTPException(status_code=400, detail="Ya tienes una caja abierta. Ciérrala primero.")
    base = float(payload.base or 0)
    if base < 0:
        raise HTTPException(status_code=400, detail="La base no puede ser negativa")

    cs = CashSession(
        tenant_id=tenant_id,
        user_id=user.id,
        opened_by=user.name,
        base=base,
        status="open",
    )
    session.add(cs)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Ya tienes una caja abierta. Ciérrala primero.")
    await session.refresh(cs)
    return _session_dict(cs, [])


@cash_router.get("/current")
async def current_cash(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    cs = await _get_open_session(session, user.id, tenant_id)
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
    tenant_id = user.tenant_id or "tenant-default-001"
    cs = await _get_open_session(session, user.id, tenant_id)
    if not cs:
        raise HTTPException(status_code=400, detail="No tienes caja abierta")
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

    pickup = CashPickup(
        tenant_id=tenant_id,
        cash_session_id=cs.id,
        amount=amount,
        notes=payload.notes,
        by=user.name,
    )
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
    tenant_id = user.tenant_id or "tenant-default-001"
    cs = await _get_open_session(session, user.id, tenant_id)
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
    cs.denominations = payload.denominations
    cs.close_notes = payload.close_notes

    # Pre-calculate and persist immutable Z-Report snapshot
    sales_stmt = select(Sale).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= cs.opened_at,
        Sale.created_at <= cs.closed_at,
    )
    all_sales = (await session.execute(sales_stmt)).scalars().all()
    by_method: Dict[str, Dict[str, Any]] = {}
    total_gross = 0.0
    total_tax = 0.0
    total_discount = 0.0
    for s in all_sales:
        m = s.payment_method or "otro"
        if m not in by_method:
            by_method[m] = {"total": 0.0, "count": 0}
        by_method[m]["total"] = round(by_method[m]["total"] + float(s.total), 2)
        by_method[m]["count"] += 1
        total_gross += float(s.subtotal or s.total)
        total_tax += float(s.tax_total or 0.0)
        total_discount += float(s.discount or 0.0)

    pickups = await _get_pickups(session, cs.id)
    pickups_total = sum(float(p.amount) for p in pickups)
    parsed_denominations = {}
    if cs.denominations:
        try:
            parsed_denominations = json.loads(cs.denominations)
        except Exception:
            pass

    snapshot = {
        "report_type": "Reporte Z / Arqueo de Cierre (Inmutable)",
        "session_id": cs.id,
        "tenant_id": cs.tenant_id,
        "cashier": cs.opened_by,
        "opened_at": cs.opened_at.isoformat() if cs.opened_at else None,
        "closed_at": cs.closed_at.isoformat() if cs.closed_at else None,
        "status": "closed",
        "base_initial": cs.base,
        "by_payment_method": by_method,
        "totals": {
            "gross_sales": round(total_gross, 2),
            "tax_collected": round(total_tax, 2),
            "discounts": round(total_discount, 2),
            "net_sales": round(sum(v["total"] for v in by_method.values()), 2),
            "sales_count": len(all_sales),
        },
        "cash_flow": {
            "base": cs.base,
            "cash_sales": by_method.get("efectivo", {}).get("total", 0.0),
            "pickups_total": round(pickups_total, 2),
            "expected_cash": totals["expected"],
            "counted_cash": counted,
            "diff": diff,
            "diff_label": "SOBRANTE" if diff > 0 else ("FALTANTE" if diff < 0 else "CUADRADA"),
        },
        "denominations": parsed_denominations,
        "pickups": [_pickup_dict(p) for p in pickups],
        "close_notes": cs.close_notes,
    }
    cs.z_report_snapshot = json.dumps(snapshot)

    await session.commit()
    await session.refresh(cs)
    return _session_dict(cs, pickups)


@cash_router.get("/history")
async def cash_history(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(CashSession).where(
        CashSession.status == "closed",
        CashSession.tenant_id == tenant_id,
    )
    if user.role != "admin":
        stmt = stmt.where(CashSession.user_id == user.id)
    stmt = stmt.order_by(CashSession.closed_at.desc()).limit(100)
    sessions = (await session.execute(stmt)).scalars().all()

    result = []
    for cs in sessions:
        pickups = await _get_pickups(session, cs.id)
        result.append(_session_dict(cs, pickups))
    return result


@cash_router.get("/session/{session_id}/z-report")
async def get_z_report(
    session_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """
    Genera el Reporte Z / Arqueo Detallado de Cierre para auditoría fiscal y operativa.
    """
    tenant_id = user.tenant_id or "tenant-default-001"
    cs = await session.get(CashSession, session_id)
    if not cs or cs.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Sesión de caja no encontrada")

    if cs.z_report_snapshot:
        try:
            return json.loads(cs.z_report_snapshot)
        except Exception:
            pass

    # Obtener todas las ventas del periodo
    end_time = cs.closed_at or utcnow()
    sales_stmt = select(Sale).where(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= cs.opened_at,
        Sale.created_at <= end_time,
    )
    all_sales = (await session.execute(sales_stmt)).scalars().all()

    # Desglose por método de pago
    by_method: Dict[str, Dict[str, Any]] = {}
    total_gross = 0.0
    total_tax = 0.0
    total_discount = 0.0

    for s in all_sales:
        m = s.payment_method or "otro"
        if m not in by_method:
            by_method[m] = {"total": 0.0, "count": 0}
        by_method[m]["total"] = round(by_method[m]["total"] + float(s.total), 2)
        by_method[m]["count"] += 1
        total_gross += float(s.subtotal or s.total)
        total_tax += float(s.tax_total or 0.0)
        total_discount += float(s.discount or 0.0)

    pickups = await _get_pickups(session, cs.id)
    pickups_total = sum(float(p.amount) for p in pickups)

    # Denominaciones deserializadas si existen
    parsed_denominations = {}
    if cs.denominations:
        try:
            parsed_denominations = json.loads(cs.denominations)
        except Exception:
            pass

    return {
        "report_type": "Reporte Z / Arqueo de Cierre",
        "session_id": cs.id,
        "tenant_id": cs.tenant_id,
        "cashier": cs.opened_by,
        "opened_at": cs.opened_at.isoformat() if hasattr(cs.opened_at, 'isoformat') else str(cs.opened_at),
        "closed_at": cs.closed_at.isoformat() if hasattr(cs.closed_at, 'isoformat') and cs.closed_at else str(cs.closed_at),
        "status": cs.status,
        "base_initial": cs.base,
        "by_payment_method": by_method,
        "totals": {
            "gross_sales": round(total_gross, 2),
            "tax_collected": round(total_tax, 2),
            "discounts": round(total_discount, 2),
            "net_sales": round(sum(v["total"] for v in by_method.values()), 2),
            "sales_count": len(all_sales),
        },
        "cash_flow": {
            "base": cs.base,
            "cash_sales": by_method.get("efectivo", {}).get("total", 0.0),
            "pickups_total": round(pickups_total, 2),
            "expected_cash": cs.expected if cs.expected is not None else round(cs.base + by_method.get("efectivo", {}).get("total", 0.0) - pickups_total, 2),
            "counted_cash": cs.counted,
            "diff": cs.diff,
            "diff_label": "SOBRANTE" if (cs.diff or 0) > 0 else ("FALTANTE" if (cs.diff or 0) < 0 else "CUADRADA"),
        },
        "denominations": parsed_denominations,
        "pickups": [_pickup_dict(p) for p in pickups],
        "close_notes": cs.close_notes,
    }

