"""Capa /api/internal/* (n8n) y preferencias de aviso.

Los tests HTTP siguen la convencion de la suite (servidor vivo en BACKEND_TEST_URL).
Requieren INTERNAL_API_TOKEN en el entorno del test igual que en el servidor;
sin el, se omiten. Los unitarios importan los modulos directo.
"""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"
TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")
needs_token = pytest.mark.skipif(not TOKEN, reason="INTERNAL_API_TOKEN no definido")


def _h(token=TOKEN):
    return {"Authorization": f"Bearer {token}"}


# ---------- unitarios ----------
def test_days_left_uses_bogota_calendar_days():
    from routers.internal import days_left

    now = datetime(2026, 10, 14, 3, 0, tzinfo=timezone.utc)  # 13 oct 22:00 en Bogota
    assert days_left(datetime(2026, 10, 18, 12, 0, tzinfo=timezone.utc), now) == 5
    assert days_left(datetime(2026, 10, 13, 12, 0, tzinfo=timezone.utc), now) == 0
    assert days_left(datetime(2026, 10, 12, 23, 0, tzinfo=timezone.utc), now) == -1
    assert days_left(datetime(2026, 10, 18, 12, 0), now) == 5  # naive se trata como UTC


def test_bogota_day_bounds_are_utc_plus_five():
    from datetime import date
    from routers.internal import bogota_day_bounds

    start, end = bogota_day_bounds(date(2026, 10, 13))
    assert start == datetime(2026, 10, 13, 5, 0, tzinfo=timezone.utc)
    assert end - start == timedelta(days=1)


# ---------- auth ----------
@needs_token
def test_internal_requires_bearer_token():
    assert requests.get(f"{API}/internal/tenants/expiring", timeout=15).status_code == 401
    assert requests.get(f"{API}/internal/tenants/expiring", headers=_h("incorrecto"), timeout=15).status_code == 401
    assert requests.get(f"{API}/internal/tenants/expiring", headers=_h(), timeout=15).status_code == 200


@needs_token
def test_internal_unknown_tenant_is_404():
    r = requests.post(f"{API}/internal/tenants/{uuid.uuid4()}/mark-expired", json={}, headers=_h(), timeout=15)
    assert r.status_code == 404
    r = requests.get(f"{API}/internal/tenants/{uuid.uuid4()}/daily-digest", headers=_h(), timeout=15)
    assert r.status_code == 404


# ---------- flujo completo con un tenant nuevo ----------
@pytest.fixture(scope="module")
def tenant():
    suffix = uuid.uuid4().hex[:8]
    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"INT-Test-{suffix}",
        "email": f"int_admin_{suffix}@jrpos.co",
        "password": "intl1234",
        "name": "INT Admin",
    }, timeout=20)
    assert r.status_code == 200, r.text
    me = s.get(f"{API}/auth/me", timeout=15).json()
    return {"session": s, "id": me.get("tenant_id") or me.get("tenant", {}).get("id")}


def test_prefs_default_is_opted_out(tenant):
    r = tenant["session"].get(f"{API}/settings/notifications", timeout=15)
    assert r.status_code == 200
    assert r.json()["opt_in"] is False


def test_prefs_reject_bad_channel(tenant):
    r = tenant["session"].put(f"{API}/settings/notifications", json={"opt_in": True, "channel": "sms"}, timeout=15)
    assert r.status_code == 422


@needs_token
def test_trial_flow_respects_opt_in(tenant):
    tid = tenant["id"]
    assert tid
    # sin opt-in: aparece en expiring pero con opt_in false, y no en digest-recipients
    r = requests.get(f"{API}/internal/tenants/expiring", params={"days_ahead": 60}, headers=_h(), timeout=15)
    row = next((t for t in r.json()["tenants"] if t["tenant_id"] == tid), None)
    assert row is not None and row["opt_in"] is False and row["status"] == "trial"
    assert 13 <= row["days_left"] <= 16
    assert "phone" not in row and "email" not in row
    r = requests.get(f"{API}/internal/tenants/digest-recipients", headers=_h(), timeout=15)
    assert tid not in [t["tenant_id"] for t in r.json()["tenants"]]

    # el dueno da su consentimiento
    r = tenant["session"].put(f"{API}/settings/notifications", json={"opt_in": True, "channel": "email"}, timeout=15)
    assert r.status_code == 200 and r.json()["consented_at"]
    r = requests.get(f"{API}/internal/tenants/expiring", params={"days_ahead": 60}, headers=_h(), timeout=15)
    row = next(t for t in r.json()["tenants"] if t["tenant_id"] == tid)
    assert row["opt_in"] is True and row["channel"] == "email"
    r = requests.get(f"{API}/internal/tenants/digest-recipients", headers=_h(), timeout=15)
    assert tid in [t["tenant_id"] for t in r.json()["tenants"]]

    # apagar el reporte diario lo saca de los destinatarios sin tocar trial_alerts
    tenant["session"].put(f"{API}/settings/notifications", json={"opt_in": True, "channel": "email", "daily_digest": False}, timeout=15)
    r = requests.get(f"{API}/internal/tenants/digest-recipients", headers=_h(), timeout=15)
    assert tid not in [t["tenant_id"] for t in r.json()["tenants"]]


@needs_token
def test_mark_expired_does_not_touch_live_trial(tenant):
    r = requests.post(f"{API}/internal/tenants/{tenant['id']}/mark-expired", json={"reason": "t"}, headers=_h(), timeout=15)
    assert r.status_code == 200
    assert r.json() == {"tenant_id": tenant["id"], "status": "trial", "changed": False}


@needs_token
def test_daily_digest_is_scoped_to_one_tenant(tenant):
    tid = tenant["id"]
    s = tenant["session"]
    p = s.post(f"{API}/products", json={"name": f"INT_{uuid.uuid4().hex[:6]}", "price": 1000, "cost": 600, "stock": 3, "tax_rate": 0, "unit": "und"}, timeout=15)
    assert p.status_code == 200, p.text
    prod = p.json()
    sale = s.post(f"{API}/sales", json={
        "items": [{"product_id": prod["id"], "name": prod["name"], "qty": 2, "price": 1000, "tax_rate": 0}],
        "payment_method": "efectivo",
    }, timeout=15)
    assert sale.status_code == 200, sale.text
    r = requests.get(f"{API}/internal/tenants/{tid}/daily-digest", headers=_h(), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["tenant_id"] == tid and d["sales_count"] == 1 and d["sales_total"] > 0
    assert d["low_stock_count"] >= 1  # stock 3 -> 1 tras la venta, bajo el umbral
    assert d["cash"] is None
    # un tenant no ve las ventas del otro: el admin sembrado tiene mas ventas historicas
    assert set(d) >= {"date", "currency", "margin_pct", "credits_pending_total"}
    r = requests.get(f"{API}/internal/tenants/{tid}/daily-digest", params={"date": "no-es-fecha"}, headers=_h(), timeout=15)
    assert r.status_code == 422
