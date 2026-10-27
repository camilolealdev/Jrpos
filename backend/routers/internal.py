"""Capa interna /api/internal/* para los flujos de n8n.

Auth: Bearer INTERNAL_API_TOKEN (comparacion en tiempo constante). Sin el token
configurado el router responde 404 (no revela que existe). Los listados entre
tenants corren con contexto de superadmin y devuelven solo identificadores y
campos de negocio minimos; los datos de un tenant concreto se leen con el
contexto RLS fijado a ese tenant. Nunca se devuelven telefonos, correos ni
nombres de personas. Contratos: n8n/contracts/.
"""
import hmac
import json
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import _set_tenant_context
from db import get_session
from models_sql import (
    CashSession,
    NotificationPref,
    Product,
    Sale,
    SaleItem,
    Tenant,
    TenantAuditLog,
    TenantSubscription,
    utcnow,
)

BOGOTA = timezone(timedelta(hours=-5))  # sin horario de verano
LOW_STOCK_THRESHOLD = 5  # mismo criterio que /reports/summary hasta definir min_stock


def verify_internal_token(authorization: Optional[str] = Header(default=None)) -> None:
    expected = os.environ.get("INTERNAL_API_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=404, detail="Not Found")
    supplied = ""
    if authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    if not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


internal_router = APIRouter(prefix="/api/internal", tags=["internal"], dependencies=[Depends(verify_internal_token)])


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def bogota_today(now: Optional[datetime] = None) -> date:
    return _aware(now or utcnow()).astimezone(BOGOTA).date()


def days_left(trial_ends_at: datetime, now: Optional[datetime] = None) -> int:
    """Dias calendario (Bogota) entre hoy y la fecha de fin del trial. Negativo = vencido."""
    return (_aware(trial_ends_at).astimezone(BOGOTA).date() - bogota_today(now)).days


def bogota_day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=BOGOTA)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


async def _superadmin(session: AsyncSession) -> None:
    await _set_tenant_context(session, tenant_id=None, is_superadmin=True)


async def _prefs_by_tenant(session: AsyncSession) -> dict[str, NotificationPref]:
    rows = (await session.execute(select(NotificationPref))).scalars().all()
    return {r.tenant_id: r for r in rows}


def _opt_in(pref: Optional[NotificationPref], flow_flag: str) -> bool:
    return bool(pref and pref.opt_in and getattr(pref, flow_flag, False))


def _paywall_url() -> str:
    base = os.environ.get("APP_BASE_URL", "").strip() or (os.environ.get("FRONTEND_URL", "").split(",")[0].strip())
    return f"{base.rstrip('/')}/paywall" if base else ""


# ---------------- F01: ciclo de trial ----------------
@internal_router.get("/tenants/expiring")
async def tenants_expiring(
    days_ahead: int = Query(5, ge=0, le=60),
    days_back: int = Query(1, ge=0, le=30),
    session: AsyncSession = Depends(get_session),
):
    await _superadmin(session)
    now = utcnow()
    horizon = now + timedelta(days=days_ahead + 2)
    floor = now - timedelta(days=days_back + 2)
    tenants = (
        await session.execute(
            select(Tenant).where(
                Tenant.status.in_(("trial", "expired", "suspended")),
                Tenant.trial_ends_at <= horizon,
                Tenant.trial_ends_at >= floor,
            )
        )
    ).scalars().all()
    paying = set(
        (await session.execute(select(TenantSubscription.tenant_id).where(TenantSubscription.status == "active")))
        .scalars()
        .all()
    )
    prefs = await _prefs_by_tenant(session)
    out = []
    for t in tenants:
        left = days_left(t.trial_ends_at, now)
        if t.id in paying or left > days_ahead or left < -days_back:
            continue
        pref = prefs.get(t.id)
        out.append({
            "tenant_id": t.id,
            "status": t.status,
            "trial_ends_at": _aware(t.trial_ends_at).astimezone(BOGOTA).date().isoformat(),
            "days_left": left,
            "opt_in": _opt_in(pref, "trial_alerts"),
            "channel": pref.channel if pref else "whatsapp",
            "paywall_url": _paywall_url(),
        })
    return {"generated_at": now.isoformat(), "tenants": out}


class MarkExpiredIn(BaseModel):
    reason: str = Field(default="trial_ended", max_length=100)
    idempotency_key: Optional[str] = Field(default=None, max_length=100)


@internal_router.post("/tenants/{tenant_id}/mark-expired")
async def tenant_mark_expired(tenant_id: str, payload: MarkExpiredIn, session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Not Found")
    changed = False
    if tenant.status == "trial" and _aware(tenant.trial_ends_at) <= utcnow():
        tenant.status = "expired"
        session.add(TenantAuditLog(
            tenant_id=tenant.id,
            user_name="n8n",
            action="mark_expired",
            entity_type="tenant",
            entity_id=tenant.id,
            details=json.dumps({"reason": payload.reason, "idempotency_key": payload.idempotency_key}),
        ))
        await session.commit()
        changed = True
    return {"tenant_id": tenant.id, "status": tenant.status, "changed": changed}


# ---------------- F02: reporte diario ----------------
@internal_router.get("/tenants/digest-recipients")
async def digest_recipients(session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    now = utcnow()
    prefs = await _prefs_by_tenant(session)
    ids = [tid for tid, p in prefs.items() if _opt_in(p, "daily_digest")]
    if not ids:
        return {"tenants": []}
    tenants = (await session.execute(select(Tenant).where(Tenant.id.in_(ids)))).scalars().all()
    out = []
    for t in tenants:
        vigente = t.status == "active" or (t.status == "trial" and _aware(t.trial_ends_at) > now)
        if vigente:
            out.append({"tenant_id": t.id, "opt_in": True, "channel": prefs[t.id].channel})
    return {"tenants": out}


@internal_router.get("/tenants/{tenant_id}/daily-digest")
async def daily_digest(
    tenant_id: str,
    date_: Optional[str] = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_session),
):
    await _superadmin(session)
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    now = utcnow()
    if not tenant or not (tenant.status == "active" or (tenant.status == "trial" and _aware(tenant.trial_ends_at) > now)):
        raise HTTPException(status_code=404, detail="Not Found")
    try:
        day = date.fromisoformat(date_) if date_ else bogota_today(now)
    except ValueError:
        raise HTTPException(status_code=422, detail="date debe ser YYYY-MM-DD")
    start, end = bogota_day_bounds(day)

    # a partir de aqui solo se leen datos de este tenant
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    sales_total, sales_count = (
        await session.execute(
            select(func.coalesce(func.sum(Sale.total), 0.0), func.count()).where(
                Sale.tenant_id == tenant_id, Sale.created_at >= start, Sale.created_at < end
            )
        )
    ).one()
    cogs = (
        await session.execute(
            select(func.coalesce(func.sum(SaleItem.qty * Product.cost), 0.0))
            .select_from(SaleItem)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .join(Product, (SaleItem.product_id == Product.id) & (Product.tenant_id == tenant_id), isouter=True)
            .where(SaleItem.tenant_id == tenant_id, Sale.created_at >= start, Sale.created_at < end)
        )
    ).scalar_one()
    sales_total = float(sales_total or 0.0)
    margin_pct = round(max(0.0, sales_total - float(cogs or 0.0)) / sales_total * 100, 1) if sales_total > 0 else 0.0

    cash_row = (
        await session.execute(
            select(
                func.coalesce(func.sum(CashSession.expected), 0.0),
                func.coalesce(func.sum(CashSession.counted), 0.0),
                func.coalesce(func.sum(CashSession.diff), 0.0),
                func.count(),
            ).where(
                CashSession.tenant_id == tenant_id,
                CashSession.status == "closed",
                CashSession.closed_at >= start,
                CashSession.closed_at < end,
            )
        )
    ).one()
    cash = (
        {"expected": float(cash_row[0]), "counted": float(cash_row[1]), "difference": float(cash_row[2])}
        if cash_row[3]
        else None
    )
    credits_pending = (
        await session.execute(
            select(func.coalesce(func.sum(Sale.balance_due), 0.0)).where(
                Sale.tenant_id == tenant_id, Sale.is_credit == True, Sale.credit_status != "paid"  # noqa: E712
            )
        )
    ).scalar_one()
    low_stock = (
        await session.execute(
            select(func.count()).select_from(Product).where(
                Product.tenant_id == tenant_id, Product.is_service == False, Product.stock <= LOW_STOCK_THRESHOLD  # noqa: E712
            )
        )
    ).scalar_one()
    return {
        "tenant_id": tenant_id,
        "date": day.isoformat(),
        "currency": "COP",
        "sales_total": sales_total,
        "sales_count": int(sales_count),
        "margin_pct": margin_pct,
        "cash": cash,
        "credits_pending_total": float(credits_pending or 0.0),
        "low_stock_count": int(low_stock),
    }


# ---------------- F07 / F08: onboarding, renovacion, reactivacion ----------------
# opt_in es el unico interruptor de estos mensajes de ciclo de vida
# (onboarding, renovacion, inactividad); trial_alerts y daily_digest solo
# gobiernan F01 y F02.
def _live(t: Tenant, now: datetime) -> bool:
    return t.status == "active" or (t.status == "trial" and _aware(t.trial_ends_at) > now)


def _pref_fields(pref: Optional[NotificationPref]) -> dict:
    return {"opt_in": bool(pref and pref.opt_in), "channel": pref.channel if pref else "whatsapp"}


@internal_router.get("/tenants/renewals")
async def tenants_renewals(days_ahead: int = Query(5, ge=0, le=30), session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    now = utcnow()
    today = bogota_today(now)
    subs = (await session.execute(select(TenantSubscription).where(TenantSubscription.status == "active"))).scalars().all()
    latest: dict[str, TenantSubscription] = {}
    for sub in subs:  # una sola suscripcion por tenant: la de vencimiento mas lejano
        cur = latest.get(sub.tenant_id)
        if cur is None or _aware(sub.current_period_end) > _aware(cur.current_period_end):
            latest[sub.tenant_id] = sub
    if not latest:
        return {"tenants": []}
    tenants = {t.id: t for t in (await session.execute(select(Tenant).where(Tenant.id.in_(list(latest))))).scalars().all()}
    prefs = await _prefs_by_tenant(session)
    out = []
    for tid, sub in latest.items():
        tenant = tenants.get(tid)
        if not tenant or tenant.status != "active":
            continue
        end_day = _aware(sub.current_period_end).astimezone(BOGOTA).date()
        left = (end_day - today).days
        if left < 0 or left > days_ahead:
            continue
        out.append({
            "tenant_id": tid,
            "status": tenant.status,
            "plan": sub.plan_id,
            "current_period_end": end_day.isoformat(),
            "days_left": left,
            **_pref_fields(prefs.get(tid)),
            "payment_url": _paywall_url(),
        })
    return {"tenants": out}


@internal_router.get("/tenants/inactive")
async def tenants_inactive(days: int = Query(7, ge=0, le=365), session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    now = utcnow()
    today = bogota_today(now)
    tenants = (await session.execute(select(Tenant).where(Tenant.status.in_(("active", "trial"))))).scalars().all()
    last_sale = {
        tid: ts
        for tid, ts in (
            await session.execute(select(Sale.tenant_id, func.max(Sale.created_at)).group_by(Sale.tenant_id))
        ).all()
    }
    prefs = await _prefs_by_tenant(session)
    out = []
    for t in tenants:
        if not _live(t, now):
            continue
        ref = last_sale.get(t.id) or t.created_at
        idle = (today - _aware(ref).astimezone(BOGOTA).date()).days
        if idle < days:
            continue
        out.append({"tenant_id": t.id, "status": t.status, "days_without_sales": idle, **_pref_fields(prefs.get(t.id))})
    return {"tenants": out}


@internal_router.get("/tenants/onboarding")
async def tenants_onboarding(days: int = Query(8, ge=1, le=60), session: AsyncSession = Depends(get_session)):
    """Reconciliacion de F07: tenants registrados en los ultimos `days` dias (por si se perdio el evento)."""
    await _superadmin(session)
    now = utcnow()
    tenants = (
        await session.execute(select(Tenant).where(Tenant.created_at >= now - timedelta(days=days + 1)))
    ).scalars().all()
    prefs = await _prefs_by_tenant(session)
    cutoff = bogota_today(now) - timedelta(days=days)
    out = []
    for t in tenants:
        registered = _aware(t.created_at).astimezone(BOGOTA).date()
        if registered < cutoff or not _live(t, now):
            continue
        out.append({"tenant_id": t.id, "status": t.status, "registered_at": registered.isoformat(), **_pref_fields(prefs.get(t.id))})
    return {"tenants": out}


@internal_router.get("/tenants/{tenant_id}/activity")
async def tenant_activity(tenant_id: str, session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Not Found")
    pref = (await session.execute(select(NotificationPref).where(NotificationPref.tenant_id == tenant_id))).scalar_one_or_none()
    status = tenant.status
    # a partir de aqui solo se leen datos de este tenant
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    products_count = (
        await session.execute(
            select(func.count()).select_from(Product).where(Product.tenant_id == tenant_id, Product.is_service == False)  # noqa: E712
        )
    ).scalar_one()
    sales_count, last_sale_at = (
        await session.execute(
            select(func.count(), func.max(Sale.created_at)).where(Sale.tenant_id == tenant_id, Sale.created_at >= tenant.created_at)
        )
    ).one()
    return {
        "tenant_id": tenant_id,
        "status": status,
        "products_count": int(products_count),
        "sales_count": int(sales_count),
        "last_sale_at": _aware(last_sale_at).isoformat() if last_sale_at else None,
        **_pref_fields(pref),
    }


# ---------------- Preferencias de aviso del dueno (opt-in) ----------------
from auth import require_admin  # noqa: E402
from models_sql import User  # noqa: E402

notification_prefs_router = APIRouter(prefix="/api/settings/notifications", tags=["settings"])


class NotificationPrefsIn(BaseModel):
    opt_in: bool
    channel: str = Field(default="whatsapp", pattern="^(whatsapp|email)$")
    trial_alerts: bool = True
    daily_digest: bool = True
    cash_diff_threshold: Optional[float] = Field(default=None, ge=0)
    accountant_email: Optional[str] = Field(default=None, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    accountant_opt_in: bool = False


def _prefs_out(p: Optional[NotificationPref]) -> dict:
    if not p:
        return {"opt_in": False, "channel": "whatsapp", "trial_alerts": True, "daily_digest": True, "consented_at": None,
                "cash_diff_threshold": None, "accountant_email": None, "accountant_opt_in": False, "accountant_consented_at": None}
    return {
        "opt_in": p.opt_in,
        "channel": p.channel,
        "trial_alerts": p.trial_alerts,
        "daily_digest": p.daily_digest,
        "consented_at": p.consented_at.isoformat() if p.consented_at else None,
        "cash_diff_threshold": p.cash_diff_threshold,
        "accountant_email": p.accountant_email,
        "accountant_opt_in": p.accountant_opt_in,
        "accountant_consented_at": p.accountant_consented_at.isoformat() if p.accountant_consented_at else None,
    }


@notification_prefs_router.get("")
async def get_notification_prefs(session: AsyncSession = Depends(get_session), user: User = Depends(require_admin)):
    pref = (await session.execute(select(NotificationPref).where(NotificationPref.tenant_id == user.tenant_id))).scalar_one_or_none()
    return _prefs_out(pref)


@notification_prefs_router.put("")
async def put_notification_prefs(
    payload: NotificationPrefsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    pref = (await session.execute(select(NotificationPref).where(NotificationPref.tenant_id == user.tenant_id))).scalar_one_or_none()
    if not pref:
        pref = NotificationPref(tenant_id=user.tenant_id)
        session.add(pref)
    if payload.opt_in and not pref.opt_in:
        pref.consented_at = utcnow()
    pref.opt_in = payload.opt_in
    pref.channel = payload.channel
    pref.trial_alerts = payload.trial_alerts
    pref.daily_digest = payload.daily_digest
    pref.cash_diff_threshold = payload.cash_diff_threshold
    # el consentimiento para el contador es explicito y ligado a ese correo: sin correo no hay consentimiento,
    # y cambiar el correo exige volver a consentir (se registra la fecha de nuevo)
    new_email = (payload.accountant_email or "").strip().lower() or None
    if payload.accountant_opt_in and not new_email:
        raise HTTPException(status_code=422, detail="Indica el correo del contador para autorizar el envio")
    if payload.accountant_opt_in and (not pref.accountant_opt_in or new_email != pref.accountant_email):
        pref.accountant_consented_at = utcnow()
    if not payload.accountant_opt_in:
        pref.accountant_consented_at = None
    pref.accountant_email = new_email
    pref.accountant_opt_in = bool(payload.accountant_opt_in and new_email)
    await session.commit()
    return _prefs_out(pref)
