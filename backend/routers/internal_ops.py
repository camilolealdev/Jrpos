"""Endpoints internos de operacion por tienda (F03, F10-F13, F15) y destinatarios por flujo.

Mismas reglas que routers/internal.py: Bearer INTERNAL_API_TOKEN, listados entre
tenants con contexto de superadmin y datos de un tenant con el contexto RLS fijado
a ese tenant. Nunca telefonos, correos, documentos ni nombres completos. Contratos
en n8n/contracts/.
"""
import csv
import io
import re
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import _set_tenant_context
from db import get_session
from models_sql import (
    CashSession,
    Contact,
    NotificationPref,
    Product,
    Sale,
    SaleItem,
    SettingsCertificate,
    SettingsElectronic,
    PurchaseOrder,
    PurchaseOrderItem,
    SettingsTimeclockSchedule,
    StockMovement,
    SupportTicket,
    Tenant,
    Timeclock,
    User,
    utcnow,
)
from routers.internal import (
    BOGOTA,
    _aware,
    _live,
    _pref_fields,
    _prefs_by_tenant,
    _superadmin,
    bogota_today,
    verify_internal_token,
)

ops_router = APIRouter(prefix="/api/internal", tags=["internal"], dependencies=[Depends(verify_internal_token)])

NOTIFY_FLOWS = ("F09", "F11", "F12", "F13", "F14", "F15")


def short_name(full: Optional[str]) -> str:
    """'Maria Perez Lopez' -> 'Maria P.': lo minimo para que el dueno reconozca a la persona."""
    parts = (full or "").split()
    if not parts:
        return "Sin nombre"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[1][0].upper()}."


def parse_flexible_date(text: Optional[str]) -> Optional[date]:
    """Fecha de un campo de texto libre; None si no se puede interpretar."""
    raw = (text or "").strip()
    if not raw:
        return None
    for pattern, fmt in ((r"^\d{4}-\d{2}-\d{2}", "%Y-%m-%d"), (r"^\d{4}/\d{2}/\d{2}", "%Y/%m/%d"),
                         (r"^\d{2}/\d{2}/\d{4}$", "%d/%m/%Y"), (r"^\d{2}-\d{2}-\d{4}$", "%d-%m-%Y")):
        if re.match(pattern, raw):
            try:
                return datetime.strptime(raw[:10], fmt).date()
            except ValueError:
                return None
    return None


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)).day
    return date(year, month, min(d.day, last))


# ---------------- destinatarios por flujo ----------------
@ops_router.get("/notification-targets")
async def notification_targets(flow: str = Query(...), session: AsyncSession = Depends(get_session)):
    if flow not in NOTIFY_FLOWS:
        raise HTTPException(status_code=422, detail=f"flow debe ser uno de {', '.join(NOTIFY_FLOWS)}")
    await _superadmin(session)
    now = utcnow()
    prefs = await _prefs_by_tenant(session)
    ids = [tid for tid, p in prefs.items() if p.opt_in]
    if not ids:
        return {"tenants": []}
    tenants = (await session.execute(select(Tenant).where(Tenant.id.in_(ids)))).scalars().all()
    out = []
    for t in tenants:
        if not _live(t, now):
            continue
        row = {"tenant_id": t.id, "notify": {"opt_in": True, "channel": prefs[t.id].channel}}
        if flow == "F14":  # tercero: solo configurado Y con consentimiento del dueno
            pref = prefs[t.id]
            row["accountant"] = {"configured": bool(pref.accountant_email), "opt_in": bool(pref.accountant_opt_in and pref.accountant_email)}
        out.append(row)
    return {"tenants": out}


# ---------------- F03: soporte ----------------
TRIAGE_URGENCIES = ("baja", "media", "alta", "critica")
_TRIAGE_BLOCK = re.compile(r"\[IA-TRIAGE (\w+) (\w+)\](.*?)\[/IA-TRIAGE\]\s*", re.S)
_PRIORITY_TO_URGENCY = {"baja": "baja", "media": "media", "alta": "alta", "urgente": "critica"}


class TriageIn(BaseModel):
    tenant_id: str = Field(max_length=36)
    urgency: str
    urgency_source: str = Field(default="ia", pattern="^(ia|prioridad)$")
    suggested_note: Optional[str] = Field(default=None, max_length=600)


@ops_router.put("/tickets/{ticket_id}/triage")
async def ticket_triage(ticket_id: str, payload: TriageIn, session: AsyncSession = Depends(get_session)):
    if payload.urgency not in TRIAGE_URGENCIES:
        raise HTTPException(status_code=422, detail=f"urgency debe ser una de {', '.join(TRIAGE_URGENCIES)}")
    await _superadmin(session)
    ticket = (
        await session.execute(
            select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.tenant_id == payload.tenant_id)
        )
    ).scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Not Found")
    # el triage vive en un bloque propio de admin_notes: no pisa las notas del superadmin ni cambia el estado
    rest = _TRIAGE_BLOCK.sub("", ticket.admin_notes or "").strip()
    note = (payload.suggested_note or "").strip()
    block = f"[IA-TRIAGE {payload.urgency} {payload.urgency_source}]{note}[/IA-TRIAGE]"
    ticket.admin_notes = f"{block}\n{rest}".strip()
    await session.commit()
    return {"ticket_id": ticket.id, "saved": True}


@ops_router.get("/tickets/open")
async def tickets_open(older_than_hours: float = Query(24, ge=0, le=720), session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    now = utcnow()
    rows = (
        await session.execute(
            select(SupportTicket)
            .where(SupportTicket.status == "abierto", SupportTicket.created_at <= now - timedelta(hours=older_than_hours))
            .order_by(SupportTicket.created_at.asc())
            .limit(200)
        )
    ).scalars().all()
    out = []
    for t in rows:
        m = _TRIAGE_BLOCK.search(t.admin_notes or "")
        out.append({
            "ticket_id": t.id,
            "tenant_id": t.tenant_id,
            "status": t.status,
            "urgency": m.group(1) if m else _PRIORITY_TO_URGENCY.get(t.priority),
            "subject": (t.subject or "")[:120],
            "age_hours": round((now - _aware(t.created_at)).total_seconds() / 3600, 1),
        })
    return {"tickets": out}


# ---------------- F10: descuadre de caja ----------------
@ops_router.get("/tenants/{tenant_id}/cash-sessions/{session_id}/closing-summary")
async def closing_summary(tenant_id: str, session_id: str, session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    pref = (await session.execute(select(NotificationPref).where(NotificationPref.tenant_id == tenant_id))).scalar_one_or_none()
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    cs = (
        await session.execute(select(CashSession).where(CashSession.id == session_id, CashSession.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(status_code=404, detail="Not Found")
    if cs.status != "closed" or cs.closed_at is None:
        raise HTTPException(status_code=409, detail="La sesion de caja sigue abierta")
    return {
        "tenant_id": tenant_id,
        "session_id": cs.id,
        "register_name": "Caja",  # el modelo no tiene nombre de caja; nunca el del cajero
        "closed_at_local": _aware(cs.closed_at).astimezone(BOGOTA).strftime("%Y-%m-%d %H:%M"),
        "expected_amount": float(cs.expected or 0.0),
        "counted_amount": float(cs.counted or 0.0),
        "difference": float(cs.diff or 0.0),
        "threshold": pref.cash_diff_threshold if pref and pref.cash_diff_threshold else None,  # None: n8n usa cash_diff_threshold_default
        "currency": "COP",
        "notify": _pref_fields(pref),
    }


# ---------------- F12: cartera ----------------
OVERDUE_AFTER_DAYS = 30  # el fiado no tiene fecha de vencimiento; se asume 30 dias desde la venta


@ops_router.get("/tenants/{tenant_id}/credits/top-debtors")
async def top_debtors(tenant_id: str, limit: int = Query(5, ge=1, le=20), session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    today = bogota_today()
    rows = (
        await session.execute(
            select(Sale.customer_id, func.sum(Sale.balance_due), func.min(Sale.created_at))
            .where(Sale.tenant_id == tenant_id, Sale.is_credit == True, Sale.credit_status != "paid", Sale.balance_due > 0)  # noqa: E712
            .group_by(Sale.customer_id)
        )
    ).all()
    overdue_cut = utcnow() - timedelta(days=OVERDUE_AFTER_DAYS)
    overdue_total = (
        await session.execute(
            select(func.coalesce(func.sum(Sale.balance_due), 0.0)).where(
                Sale.tenant_id == tenant_id, Sale.is_credit == True, Sale.credit_status != "paid",  # noqa: E712
                Sale.balance_due > 0, Sale.created_at < overdue_cut,
            )
        )
    ).scalar_one()
    names = {
        c.id: c.name
        for c in (await session.execute(select(Contact).where(Contact.tenant_id == tenant_id))).scalars().all()
    }
    ranked = sorted(rows, key=lambda r: float(r[1] or 0), reverse=True)
    debtors = []
    for cid, balance, oldest in ranked[:limit]:
        age = (today - _aware(oldest).astimezone(BOGOTA).date()).days
        debtors.append({
            "customer_id": cid,
            "display_name": short_name(names.get(cid)) if cid else "Cliente sin registrar",
            "balance": round(float(balance or 0), 2),
            "days_overdue": max(0, age - OVERDUE_AFTER_DAYS),
            "wa_me_link": None,  # lleva el telefono del deudor: no sale de la BD
        })
    return {
        "tenant_id": tenant_id,
        "total_outstanding": round(sum(float(r[1] or 0) for r in rows), 2),
        "debtors_count": len(rows),
        "overdue_total": round(float(overdue_total or 0), 2),
        "debtors": debtors,
    }


# ---------------- F13: rotacion y merma ----------------
@ops_router.get("/tenants/{tenant_id}/inventory/rotation-merma")
async def rotation_merma(
    tenant_id: str,
    no_sales_days: int = Query(90, ge=7, le=730),
    merma_days: int = Query(30, ge=7, le=180),
    session: AsyncSession = Depends(get_session),
):
    await _superadmin(session)
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    now = utcnow()
    cutoff = now - timedelta(days=no_sales_days)
    sold_recently = set(
        (
            await session.execute(
                select(SaleItem.product_id).join(Sale, Sale.id == SaleItem.sale_id)
                .where(SaleItem.tenant_id == tenant_id, Sale.tenant_id == tenant_id, Sale.created_at >= cutoff)
                .distinct()
            )
        ).scalars().all()
    )
    products = (
        await session.execute(
            select(Product).where(
                Product.tenant_id == tenant_id, Product.is_service == False, Product.stock > 0, Product.created_at < cutoff  # noqa: E712
            )
        )
    ).scalars().all()
    idle = [p for p in products if p.id not in sold_recently]
    value = lambda p: float(p.stock or 0) * float(p.cost or 0)  # noqa: E731
    idle.sort(key=value, reverse=True)

    async def merma_by_product(start: datetime, end: datetime) -> dict[str, float]:
        rows = (
            await session.execute(
                select(StockMovement.product_id, func.coalesce(func.sum(func.abs(StockMovement.qty) * Product.cost), 0.0))
                .select_from(StockMovement)
                .join(Product, (StockMovement.product_id == Product.id) & (Product.tenant_id == tenant_id), isouter=True)
                .where(StockMovement.tenant_id == tenant_id, StockMovement.type == "merma",
                       StockMovement.created_at >= start, StockMovement.created_at < end)
                .group_by(StockMovement.product_id)
            )
        ).all()
        return {pid: float(v or 0) for pid, v in rows}

    window_start = now - timedelta(days=merma_days)
    current = await merma_by_product(window_start, now + timedelta(seconds=1))
    history = await merma_by_product(window_start - timedelta(days=merma_days * 3), window_start)
    names = {p.id: p.name for p in (await session.execute(select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(list(current) or [""])))).scalars().all()}
    merma_products = sorted(
        (
            {"name": names.get(pid, "Producto eliminado"), "window_value": round(v, 2), "avg_window_value": round(history.get(pid, 0.0) / 3, 2)}
            for pid, v in current.items() if v > 0
        ),
        key=lambda x: x["window_value"], reverse=True,
    )[:10]
    return {
        "tenant_id": tenant_id,
        "no_sales": {
            "days": no_sales_days,
            "count": len(idle),
            "stock_value": round(sum(value(p) for p in idle), 2),
            "top": [{"name": p.name, "stock_value": round(value(p), 2)} for p in idle[:5]],
        },
        "merma": {
            "window_days": merma_days,
            "total_value": round(sum(current.values()), 2),
            "products": merma_products,
        },
    }


# ---------------- F11: vencimientos fiscales ----------------
RESOLUTION_VALID_MONTHS = 24  # supuesto: la numeracion DIAN se habilita por 24 meses desde la fecha de la resolucion


@ops_router.get("/tenants/{tenant_id}/fiscal-deadlines")
async def fiscal_deadlines(tenant_id: str, session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    cert = (await session.execute(select(SettingsCertificate).where(SettingsCertificate.tenant_id == tenant_id))).scalars().first()
    elec = (await session.execute(select(SettingsElectronic).where(SettingsElectronic.tenant_id == tenant_id))).scalars().first()
    items = []
    if cert and (cert.expires or "").strip():
        d = parse_flexible_date(cert.expires)
        items.append({"kind": "certificado_digital", "label": "Certificado digital", "expires_on": d.isoformat() if d else None})
    if elec and (elec.fecha_resolucion or "").strip():
        d = parse_flexible_date(elec.fecha_resolucion)
        items.append({
            "kind": "resolucion_dian",
            "label": "Resolucion DIAN",
            "expires_on": add_months(d, RESOLUTION_VALID_MONTHS).isoformat() if d else None,
        })
    # rango_numeracion: sin fecha estimable no se informa (un aviso vacio a diario seria ruido)
    return {"tenant_id": tenant_id, "items": items}


# ---------------- F15: asistencia ----------------
@ops_router.get("/tenants/{tenant_id}/timeclock/late-today")
async def late_today(tenant_id: str, session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    sched = (await session.execute(select(SettingsTimeclockSchedule).where(SettingsTimeclockSchedule.tenant_id == tenant_id))).scalars().first()
    entry_time = (sched.entry_time if sched else "08:00") or "08:00"
    grace = int(sched.tolerance_minutes) if sched else None
    today = bogota_today()
    start = datetime(today.year, today.month, today.day, tzinfo=BOGOTA)
    punches = (
        await session.execute(
            select(Timeclock).where(
                Timeclock.tenant_id == tenant_id, Timeclock.type == "in",
                Timeclock.created_at >= start, Timeclock.created_at < start + timedelta(days=1),
            ).order_by(Timeclock.created_at.asc())
        )
    ).scalars().all()
    hh, mm = (int(x) for x in entry_time.split(":"))
    scheduled = start.replace(hour=hh, minute=mm)
    seen, late = set(), []
    for p in punches:
        if p.user_id in seen:  # solo la primera entrada del dia
            continue
        seen.add(p.user_id)
        local = _aware(p.created_at).astimezone(BOGOTA)
        minutes = int((local - scheduled).total_seconds() // 60)
        if minutes > (grace or 0):
            late.append({
                "employee_label": short_name(p.user_name),
                "scheduled_start": entry_time,
                "clock_in": local.strftime("%H:%M"),
                "minutes_late": minutes,
            })
    return {"tenant_id": tenant_id, "date": today.isoformat(), "grace_minutes": grace, "late": late}


# ---------------- F09: stock bajo y borradores de orden de compra ----------------
@ops_router.get("/tenants/{tenant_id}/low-stock")
async def low_stock(tenant_id: str, session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    products = (
        await session.execute(
            select(Product).where(
                Product.tenant_id == tenant_id, Product.is_service == False,  # noqa: E712
                Product.min_stock.is_not(None), Product.stock <= Product.min_stock,
            ).order_by(Product.name.asc()).limit(500)
        )
    ).scalars().all()
    supplier_ids = {p.supplier_id for p in products if p.supplier_id}
    suppliers = {
        c.id: c.name
        for c in (await session.execute(select(Contact).where(Contact.tenant_id == tenant_id, Contact.id.in_(list(supplier_ids) or [""])))).scalars().all()
    }
    items = []
    for p in products:
        stock, minimum = float(p.stock or 0), float(p.min_stock or 0)
        items.append({
            "product_id": p.id,
            "name": p.name,
            "stock": stock,
            "min_stock": minimum,
            "suggested_qty": max(1.0, 2 * minimum - stock),  # reponer hasta el doble del minimo
            "supplier_id": p.supplier_id if p.supplier_id in suppliers else None,
            "supplier_name": suppliers.get(p.supplier_id),
            "unit_cost": float(p.cost or 0),
        })
    return {"tenant_id": tenant_id, "items": items}


class DraftLine(BaseModel):
    product_id: str = Field(max_length=36)
    qty: float = Field(gt=0, le=1_000_000)
    unit_cost: float = Field(default=0.0, ge=0)


class DraftOrder(BaseModel):
    supplier_id: Optional[str] = Field(default=None, max_length=36)
    supplier_name: Optional[str] = Field(default=None, max_length=255)
    lines: list[DraftLine] = Field(min_length=1, max_length=200)


class DraftIn(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=80)
    source: Optional[str] = Field(default=None, max_length=40)
    orders: list[DraftOrder] = Field(min_length=1, max_length=50)


@ops_router.post("/tenants/{tenant_id}/purchase-orders/draft")
async def purchase_order_drafts(tenant_id: str, payload: DraftIn, session: AsyncSession = Depends(get_session)):
    """Un borrador por proveedor, idempotente por (tenant, clave, proveedor). Nunca nace 'enviada'."""
    await _superadmin(session)
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Not Found")
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    wanted = {l.product_id for o in payload.orders for l in o.lines}
    products = {
        p.id: p
        for p in (await session.execute(select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(list(wanted))))).scalars().all()
    }
    if wanted - set(products):
        raise HTTPException(status_code=422, detail="Hay productos que no pertenecen a la tienda")
    out, created_any = [], False
    for order in payload.orders:
        key = f"{payload.idempotency_key}:{order.supplier_id or 'sin-proveedor'}"[:100]
        existing = (
            await session.execute(select(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.idempotency_key == key))
        ).scalar_one_or_none()
        if existing:
            count = len((await session.execute(select(PurchaseOrderItem.id).where(PurchaseOrderItem.purchase_order_id == existing.id, PurchaseOrderItem.tenant_id == tenant_id))).all())
            out.append({"id": existing.id, "supplier_name": existing.supplier_name, "lines_count": count, "total_estimate": float(existing.total), "status": existing.status})
            continue
        total = round(sum(l.qty * l.unit_cost for l in order.lines), 2)
        seq = (await session.execute(text("SELECT nextval('purchase_orders_number_seq')"))).scalar_one()
        po = PurchaseOrder(
            tenant_id=tenant_id, number=f"OC-{seq:06d}", supplier_id=order.supplier_id, supplier_name=order.supplier_name,
            total=total, status="borrador", idempotency_key=key,
        )
        session.add(po)
        await session.flush()
        for l in order.lines:
            prod = products[l.product_id]
            session.add(PurchaseOrderItem(
                tenant_id=tenant_id, purchase_order_id=po.id, name=prod.name, barcode=prod.barcode, qty=l.qty, cost=l.unit_cost, price=prod.price,
            ))
        created_any = True
        out.append({"id": po.id, "supplier_name": po.supplier_name, "lines_count": len(order.lines), "total_estimate": total, "status": "borrador"})
    await session.commit()
    return {"tenant_id": tenant_id, "created": created_any, "orders": out}


# ---------------- F14: cierre contable mensual ----------------
@ops_router.get("/tenants/{tenant_id}/accountant-contact")
async def accountant_contact(tenant_id: str, session: AsyncSession = Depends(get_session)):
    await _superadmin(session)
    pref = (await session.execute(select(NotificationPref).where(NotificationPref.tenant_id == tenant_id))).scalar_one_or_none()
    if not pref or not (pref.opt_in and pref.accountant_opt_in and pref.accountant_email):
        raise HTTPException(status_code=404, detail="Not Found")  # sin consentimiento no se revela ni que existe
    return {"tenant_id": tenant_id, "accountant_email": pref.accountant_email, "accountant_opt_in": True}


EXPORT_ROW_LIMIT = 20000


@ops_router.get("/tenants/{tenant_id}/accounting-export")
async def accounting_export_month(
    tenant_id: str,
    period: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    format: str = Query("csv", pattern="^csv$"),
    session: AsyncSession = Depends(get_session),
):
    await _superadmin(session)
    pref = (await session.execute(select(NotificationPref).where(NotificationPref.tenant_id == tenant_id))).scalar_one_or_none()
    if not pref or not (pref.opt_in and pref.accountant_opt_in and pref.accountant_email):
        raise HTTPException(status_code=404, detail="Not Found")
    year, month = int(period[:4]), int(period[5:])
    start = datetime(year, month, 1, tzinfo=BOGOTA)
    end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=BOGOTA)
    await _set_tenant_context(session, tenant_id=tenant_id, is_superadmin=False)
    sales = (
        await session.execute(
            select(Sale).where(Sale.tenant_id == tenant_id, Sale.created_at >= start, Sale.created_at < end)
            .order_by(Sale.created_at.asc()).limit(EXPORT_ROW_LIMIT + 1)
        )
    ).scalars().all()
    truncated = len(sales) > EXPORT_ROW_LIMIT
    sales = sales[:EXPORT_ROW_LIMIT]
    items_by_sale: dict[str, list[SaleItem]] = {}
    ids = [s.id for s in sales]
    for i in range(0, len(ids), 1000):
        for it in (await session.execute(select(SaleItem).where(SaleItem.tenant_id == tenant_id, SaleItem.sale_id.in_(ids[i:i + 1000])))).scalars().all():
            items_by_sale.setdefault(it.sale_id, []).append(it)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["numero", "fecha", "cliente", "metodo_pago", "subtotal", "iva_total", "base_iva_0", "iva_5", "iva_19", "descuento", "total", "items"])
    for s in sales:
        its = items_by_sale.get(s.id, [])
        w.writerow([
            s.number, _aware(s.created_at).astimezone(BOGOTA).strftime("%Y-%m-%d %H:%M"), s.customer_name or "Cliente General", s.payment_method,
            s.subtotal, s.tax_total,
            round(sum(i.qty * i.price for i in its if i.tax_rate == 0), 2),
            round(sum(i.qty * i.price * 0.05 for i in its if i.tax_rate == 5), 2),
            round(sum(i.qty * i.price * 0.19 for i in its if i.tax_rate == 19), 2),
            s.discount, s.total, len(its),
        ])
    return Response(
        content=buf.getvalue(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="export-contable-{period}.csv"', "X-Row-Count": str(len(sales)), "X-Truncated": "true" if truncated else "false"},
    )
