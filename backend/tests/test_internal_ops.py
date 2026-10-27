"""Endpoints internos de operacion (F03, F10-F13, F15) y destinatarios por flujo.

HTTP contra el servidor vivo (BACKEND_TEST_URL) con INTERNAL_API_TOKEN; unitarios directo.
"""
import os
import sys
import uuid
from datetime import date

import pytest
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"
TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")
needs_token = pytest.mark.skipif(not TOKEN, reason="INTERNAL_API_TOKEN no definido")


def _h():
    return {"Authorization": f"Bearer {TOKEN}"}


def _get(path, **params):
    return requests.get(f"{API}/internal/{path}", params=params, headers=_h(), timeout=20)


# ---------- unitarios ----------
def test_short_name_keeps_only_first_name_and_initial():
    from routers.internal_ops import short_name

    assert short_name("Maria Perez Lopez") == "Maria P."
    assert short_name("Ana") == "Ana"
    assert short_name("  ") == "Sin nombre" and short_name(None) == "Sin nombre"


def test_parse_flexible_date_and_add_months():
    from routers.internal_ops import add_months, parse_flexible_date

    assert parse_flexible_date("2026-10-25") == date(2026, 10, 25)
    assert parse_flexible_date("25/10/2026") == date(2026, 10, 25)
    assert parse_flexible_date("2026-10-25T10:00:00Z") == date(2026, 10, 25)
    assert parse_flexible_date("pronto") is None and parse_flexible_date("31/02/2026") is None
    assert parse_flexible_date("") is None
    assert add_months(date(2025, 1, 31), 1) == date(2025, 2, 28)
    assert add_months(date(2025, 3, 15), 24) == date(2027, 3, 15)
    assert add_months(date(2025, 12, 31), 2) == date(2026, 2, 28)


# ---------- tenant de prueba ----------
@pytest.fixture(scope="module")
def tenant():
    sfx = uuid.uuid4().hex[:8]
    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"OPS-Test-{sfx}", "email": f"ops_admin_{sfx}@jrpos.co",
        "password": "opsl1234", "name": "Olga Ramirez",
    }, timeout=20)
    assert r.status_code == 200, r.text
    me = s.get(f"{API}/auth/me", timeout=15).json()
    return {"session": s, "id": me.get("tenant_id") or me.get("tenant", {}).get("id")}


@pytest.fixture(scope="module")
def other_tenant():
    sfx = uuid.uuid4().hex[:8]
    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"OPS-Other-{sfx}", "email": f"ops_other_{sfx}@jrpos.co",
        "password": "opsl1234", "name": "Otro Dueno",
    }, timeout=20)
    assert r.status_code == 200, r.text
    return s.get(f"{API}/auth/me", timeout=15).json().get("tenant_id") or None


# ---------- destinatarios ----------
@needs_token
def test_notification_targets_follow_opt_in_and_validate_flow(tenant):
    tid, s = tenant["id"], tenant["session"]
    assert _get("notification-targets", flow="F99").status_code == 422
    assert requests.get(f"{API}/internal/notification-targets?flow=F09", timeout=15).status_code == 401
    assert tid not in [t["tenant_id"] for t in _get("notification-targets", flow="F09").json()["tenants"]]
    assert s.put(f"{API}/settings/notifications", json={"opt_in": True, "channel": "email"}, timeout=15).status_code == 200
    rows = _get("notification-targets", flow="F14").json()["tenants"]
    row = next(t for t in rows if t["tenant_id"] == tid)
    assert row["notify"] == {"opt_in": True, "channel": "email"}
    assert row["accountant"] == {"configured": False, "opt_in": False}
    assert "accountant" not in next(t for t in _get("notification-targets", flow="F09").json()["tenants"] if t["tenant_id"] == tid)


# ---------- F03 ----------
@needs_token
def test_ticket_triage_and_open_list(tenant, other_tenant):
    tid, s = tenant["id"], tenant["session"]
    r = s.post(f"{API}/support/tickets", json={"subject": "Falla impresora", "message": "no imprime", "priority": "alta"}, timeout=15)
    assert r.status_code == 200, r.text
    ticket_id = r.json()["ticket_id"]

    body = {"tenant_id": tid, "urgency": "critica", "urgency_source": "ia", "suggested_note": "Pedir captura"}
    assert requests.put(f"{API}/internal/tickets/{ticket_id}/triage", json={**body, "tenant_id": other_tenant}, headers=_h(), timeout=15).status_code == 404
    assert requests.put(f"{API}/internal/tickets/{ticket_id}/triage", json={**body, "urgency": "enorme"}, headers=_h(), timeout=15).status_code == 422
    r = requests.put(f"{API}/internal/tickets/{ticket_id}/triage", json=body, headers=_h(), timeout=15)
    assert r.status_code == 200 and r.json() == {"ticket_id": ticket_id, "saved": True}

    def mine():
        return next((t for t in _get("tickets/open", older_than_hours=0).json()["tickets"] if t["ticket_id"] == ticket_id), None)

    assert mine()["urgency"] == "critica" and mine()["status"] == "abierto" and mine()["subject"] == "Falla impresora"
    requests.put(f"{API}/internal/tickets/{ticket_id}/triage", json={**body, "urgency": "baja"}, headers=_h(), timeout=15)  # idempotente
    assert mine()["urgency"] == "baja"
    assert ticket_id not in [t["ticket_id"] for t in _get("tickets/open", older_than_hours=24).json()["tickets"]]
    assert set(mine()) == {"ticket_id", "tenant_id", "status", "urgency", "subject", "age_hours"}  # sin cuerpo ni contacto


# ---------- F10 ----------
@needs_token
def test_closing_summary_scoped_to_tenant(tenant, other_tenant):
    tid, s = tenant["id"], tenant["session"]
    assert s.post(f"{API}/cash/open", json={"base": 1000}, timeout=15).status_code == 200
    # abierta: 409
    open_id = s.get(f"{API}/cash/current", timeout=15).json()
    sid = (open_id.get("id") or (open_id.get("session") or {}).get("id")) if isinstance(open_id, dict) else None
    assert sid
    assert _get(f"tenants/{tid}/cash-sessions/{sid}/closing-summary").status_code == 409
    r = s.post(f"{API}/cash/close", json={"counted": 1500}, timeout=15)
    assert r.status_code == 200, r.text
    r = _get(f"tenants/{tid}/cash-sessions/{sid}/closing-summary")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["difference"] == 500 and d["expected_amount"] == 1000 and d["counted_amount"] == 1500
    assert d["threshold"] is None and d["notify"]["opt_in"] is True
    assert "cashier" not in d and "user" not in str(d).lower()
    assert _get(f"tenants/{other_tenant}/cash-sessions/{sid}/closing-summary").status_code == 404


# ---------- F12 ----------
@needs_token
def test_top_debtors_masks_names_and_never_returns_phone(tenant):
    tid, s = tenant["id"], tenant["session"]
    c = s.post(f"{API}/contacts", json={"kind": "cliente", "name": "Maria Perez Lopez", "phone": "3001234567", "credit_limit": 0}, timeout=15)
    assert c.status_code == 200, c.text
    cid = c.json()["id"]
    p = s.post(f"{API}/products", json={"name": f"DEB_{uuid.uuid4().hex[:6]}", "price": 5000, "cost": 3000, "stock": 10, "tax_rate": 0, "unit": "und"}, timeout=15).json()
    sale = s.post(f"{API}/sales", json={
        "items": [{"product_id": p["id"], "name": p["name"], "qty": 2, "price": 5000, "tax_rate": 0}],
        "payment_method": "credito", "customer_id": cid,
    }, timeout=15)
    assert sale.status_code == 200, sale.text
    d = _get(f"tenants/{tid}/credits/top-debtors", limit=5).json()
    assert d["debtors_count"] == 1 and d["total_outstanding"] == 10000
    row = d["debtors"][0]
    assert row["display_name"] == "Maria P." and row["balance"] == 10000 and row["wa_me_link"] is None
    assert "3001234567" not in str(d) and "Perez" not in str(d)
    assert row["days_overdue"] == 0 and d["overdue_total"] == 0


# ---------- F13 ----------
@needs_token
def test_rotation_merma_counts_window_and_ignores_new_products(tenant):
    tid, s = tenant["id"], tenant["session"]
    p = s.post(f"{API}/products", json={"name": f"MER_{uuid.uuid4().hex[:6]}", "price": 5000, "cost": 2000, "stock": 10, "tax_rate": 0, "unit": "und"}, timeout=15).json()
    r = s.post(f"{API}/products/{p['id']}/merma", json={"qty": 3, "motivo": "vencido"}, timeout=15)
    assert r.status_code == 200, r.text
    d = _get(f"tenants/{tid}/inventory/rotation-merma", no_sales_days=90, merma_days=30).json()
    assert d["no_sales"]["count"] == 0  # productos recien creados no cuentan como sin rotacion
    prod = next(x for x in d["merma"]["products"] if x["name"] == p["name"])
    assert prod["window_value"] == 6000 and prod["avg_window_value"] == 0
    assert d["merma"]["total_value"] >= 6000


# ---------- F11 ----------
@needs_token
def test_fiscal_deadlines_normalizes_text_dates(tenant):
    tid, s = tenant["id"], tenant["session"]
    assert _get(f"tenants/{tid}/fiscal-deadlines").json()["items"] == []
    r = s.put(f"{API}/electronic/settings", json={"fecha_resolucion": "31/01/2025", "rango_desde": 1, "rango_hasta": 100}, timeout=15)
    assert r.status_code == 200, r.text
    items = _get(f"tenants/{tid}/fiscal-deadlines").json()["items"]
    res = next(i for i in items if i["kind"] == "resolucion_dian")
    assert res["expires_on"] == "2027-01-31"
    assert all(i["kind"] != "rango_numeracion" for i in items)
    s.put(f"{API}/electronic/settings", json={"fecha_resolucion": "pronto"}, timeout=15)
    items = _get(f"tenants/{tid}/fiscal-deadlines").json()["items"]
    assert next(i for i in items if i["kind"] == "resolucion_dian")["expires_on"] is None


# ---------- F15 ----------
@needs_token
def test_late_today_reports_first_punch_with_masked_name(tenant):
    tid, s = tenant["id"], tenant["session"]
    r = s.put(f"{API}/timeclock/schedule", json={"entry_time": "00:01", "exit_time": "23:59", "tolerance_minutes": 0}, timeout=15)
    assert r.status_code == 200, r.text
    assert s.post(f"{API}/timeclock/mark", json={"type": "in"}, timeout=15).status_code == 200
    d = _get(f"tenants/{tid}/timeclock/late-today").json()
    assert d["grace_minutes"] == 0 and len(d["late"]) == 1
    row = d["late"][0]
    assert row["employee_label"] == "Olga R." and row["scheduled_start"] == "00:01" and row["minutes_late"] >= 1
    assert "Ramirez" not in str(d)


@needs_token
def test_ops_endpoints_require_token():
    for path in ("tickets/open", f"tenants/{uuid.uuid4()}/fiscal-deadlines", f"tenants/{uuid.uuid4()}/timeclock/late-today"):
        assert requests.get(f"{API}/internal/{path}", timeout=15).status_code == 401


# ---------- F09: stock minimo y borradores ----------
@needs_token
def test_low_stock_and_idempotent_drafts(tenant, other_tenant):
    tid, s = tenant["id"], tenant["session"]
    sup = s.post(f"{API}/contacts", json={"kind": "proveedor", "name": "Distribuidora Andina"}, timeout=15).json()
    sfx = uuid.uuid4().hex[:6]
    low = s.post(f"{API}/products", json={"name": f"LOW_{sfx}", "price": 5000, "cost": 3000, "stock": 3, "min_stock": 5, "tax_rate": 0, "unit": "und", "supplier_id": sup["id"]}, timeout=15)
    assert low.status_code == 200, low.text
    low = low.json()
    assert low["min_stock"] == 5
    s.post(f"{API}/products", json={"name": f"OK_{sfx}", "price": 5000, "cost": 3000, "stock": 1, "tax_rate": 0, "unit": "und"}, timeout=15)  # sin min_stock: nunca avisa
    assert s.post(f"{API}/products", json={"name": f"BAD_{sfx}", "price": 1, "min_stock": -1}, timeout=15).status_code == 422

    items = _get(f"tenants/{tid}/low-stock").json()["items"]
    row = next(i for i in items if i["product_id"] == low["id"])
    assert row["suggested_qty"] == 7 and row["supplier_name"] == "Distribuidora Andina" and row["unit_cost"] == 3000
    assert all(not i["name"].startswith("OK_") for i in items)

    key = f"F09:{tid}:{sfx}"
    body = {"idempotency_key": key, "source": "n8n-F09", "orders": [
        {"supplier_id": sup["id"], "supplier_name": "Distribuidora Andina", "lines": [{"product_id": low["id"], "qty": 7, "unit_cost": 3000}]}]}
    url = f"{API}/internal/tenants/{tid}/purchase-orders/draft"
    r1 = requests.post(url, json=body, headers=_h(), timeout=20)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["created"] is True and d1["orders"][0]["status"] == "borrador" and d1["orders"][0]["total_estimate"] == 21000
    r2 = requests.post(url, json=body, headers=_h(), timeout=20).json()
    assert r2["created"] is False and r2["orders"][0]["id"] == d1["orders"][0]["id"]

    po_id = d1["orders"][0]["id"]
    listed = next(o for o in s.get(f"{API}/purchase-orders", timeout=15).json() if o["id"] == po_id)
    assert listed["status"] == "borrador" and listed["items"][0]["name"] == low["name"]
    assert s.post(f"{API}/purchase-orders/{po_id}/receive", timeout=15).status_code == 400  # un borrador no se recibe
    assert s.post(f"{API}/purchase-orders/{po_id}/approve", timeout=15).json()["status"] == "enviada"
    assert s.post(f"{API}/purchase-orders/{po_id}/approve", timeout=15).status_code == 400

    foreign = {**body, "idempotency_key": key + "x", "orders": [{"supplier_id": None, "lines": [{"product_id": str(uuid.uuid4()), "qty": 1}]}]}
    assert requests.post(url, json=foreign, headers=_h(), timeout=20).status_code == 422
    assert requests.post(f"{API}/internal/tenants/{other_tenant}/purchase-orders/draft", json=foreign, headers=_h(), timeout=20).status_code == 422
    assert requests.post(f"{API}/internal/tenants/{uuid.uuid4()}/purchase-orders/draft", json=body, headers=_h(), timeout=20).status_code == 404


# ---------- F10: umbral propio ----------
@needs_token
def test_closing_summary_uses_tenant_threshold(tenant):
    tid, s = tenant["id"], tenant["session"]
    r = s.put(f"{API}/settings/notifications", json={"opt_in": True, "channel": "email", "cash_diff_threshold": 15000}, timeout=15)
    assert r.status_code == 200 and r.json()["cash_diff_threshold"] == 15000
    assert s.put(f"{API}/settings/notifications", json={"opt_in": True, "cash_diff_threshold": -5}, timeout=15).status_code == 422
    assert s.post(f"{API}/cash/open", json={"base": 500}, timeout=15).status_code == 200
    cur = s.get(f"{API}/cash/current", timeout=15).json()
    sid = cur.get("id") or (cur.get("session") or {}).get("id")
    assert s.post(f"{API}/cash/close", json={"counted": 500}, timeout=15).status_code == 200
    assert _get(f"tenants/{tid}/cash-sessions/{sid}/closing-summary").json()["threshold"] == 15000


# ---------- F14: contador con consentimiento ----------
@needs_token
def test_accountant_consent_gates_contact_and_export(tenant):
    tid, s = tenant["id"], tenant["session"]
    put = lambda **kw: s.put(f"{API}/settings/notifications", json={"opt_in": True, "channel": "email", **kw}, timeout=15)  # noqa: E731
    period = date.today().strftime("%Y-%m")

    assert put().status_code == 200  # sin contador
    assert _get(f"tenants/{tid}/accountant-contact").status_code == 404
    assert _get(f"tenants/{tid}/accounting-export", period=period).status_code == 404
    assert put(accountant_opt_in=True).status_code == 422  # consentir exige correo
    assert put(accountant_email="no-es-correo").status_code == 422

    r = put(accountant_email="Contador@Ejemplo.co", accountant_opt_in=True)
    assert r.status_code == 200 and r.json()["accountant_email"] == "contador@ejemplo.co" and r.json()["accountant_consented_at"]
    c = _get(f"tenants/{tid}/accountant-contact").json()
    assert c == {"tenant_id": tid, "accountant_email": "contador@ejemplo.co", "accountant_opt_in": True}
    row = next(t for t in _get("notification-targets", flow="F14").json()["tenants"] if t["tenant_id"] == tid)
    assert row["accountant"] == {"configured": True, "opt_in": True}

    p = s.post(f"{API}/products", json={"name": f"EXP_{uuid.uuid4().hex[:6]}", "price": 4000, "cost": 2000, "stock": 5, "tax_rate": 19, "unit": "und"}, timeout=15).json()
    sale = s.post(f"{API}/sales", json={"items": [{"product_id": p["id"], "name": p["name"], "qty": 1, "price": 4000, "tax_rate": 19}], "payment_method": "efectivo"}, timeout=15).json()
    ex = _get(f"tenants/{tid}/accounting-export", period=period)
    assert ex.status_code == 200 and ex.headers["content-type"].startswith("text/csv")
    assert f"export-contable-{period}.csv" in ex.headers["content-disposition"]
    lines = ex.text.strip().splitlines()
    assert lines[0].startswith("numero,fecha,cliente") and any(sale["number"] in ln for ln in lines[1:])
    assert "cajero" not in ex.text.lower() and int(ex.headers["x-row-count"]) == len(lines) - 1
    assert _get(f"tenants/{tid}/accounting-export", period="2026-13").status_code == 422

    # retirar el consentimiento corta el acceso de inmediato
    assert put(accountant_email="contador@ejemplo.co", accountant_opt_in=False).status_code == 200
    assert _get(f"tenants/{tid}/accountant-contact").status_code == 404
    assert _get(f"tenants/{tid}/accounting-export", period=period).status_code == 404
    row = next(t for t in _get("notification-targets", flow="F14").json()["tenants"] if t["tenant_id"] == tid)
    assert row["accountant"] == {"configured": True, "opt_in": False}
    # cambiar el correo con consentimiento previo exige volver a consentir
    put(accountant_email="uno@ejemplo.co", accountant_opt_in=True)
    first = s.get(f"{API}/settings/notifications", timeout=15).json()["accountant_consented_at"]
    put(accountant_email="dos@ejemplo.co", accountant_opt_in=True)
    assert s.get(f"{API}/settings/notifications", timeout=15).json()["accountant_consented_at"] >= first
