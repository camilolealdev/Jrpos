"""Backend tests for core JRPOS features: bulk load, bulk update, expenses, held, electronic POS."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://jrpos-api.vercel.app').rstrip('/')
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@jrpos.com", "password": "jrpos2026"}


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    r = session.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return session


# ---------- Bulk load ----------
def test_bulk_create(s):
    payload = [
        {"name": "TEST_Sal Refisal 1kg", "barcode": "TESTBC-1001", "category": "TEST_Cond", "price": 1800, "cost": 1400, "stock": 5, "unit": "und", "tax_rate": 19},
        {"name": "TEST_Azucar 500g", "barcode": "TESTBC-1002", "category": "TEST_Cond", "price": 2500, "cost": 1900, "stock": 8, "unit": "und", "tax_rate": 5},
    ]
    r = s.post(f"{API}/products/bulk", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert data.get("total") == 2

    r2 = s.get(f"{API}/products", params={"q": "TEST_Sal"})
    assert r2.status_code == 200
    assert any(p["barcode"] == "TESTBC-1001" for p in r2.json())


# ---------- Bulk update ----------
def test_bulk_update_percent_price(s):
    r = s.post(f"{API}/products/bulk-update", json={"category": "TEST_Cond", "percent_price": 10})
    assert r.status_code == 200, r.text
    assert r.json().get("updated", 0) >= 1

    # 1800 -> 1980
    r2 = s.get(f"{API}/products", params={"q": "TEST_Sal Refisal"})
    prods = r2.json()
    sal = next((p for p in prods if p["barcode"] == "TESTBC-1001"), None)
    assert sal is not None
    assert round(sal["price"], 2) == 1980.0


# ---------- Expenses ----------
def test_expense_crud(s):
    r = s.post(f"{API}/expenses", json={"concept": "TEST_arriendo", "category": "TEST_Cat", "amount": 1000, "method": "efectivo"})
    assert r.status_code == 200, r.text
    eid = r.json()["id"]

    r2 = s.get(f"{API}/expenses")
    assert r2.status_code == 200
    d = r2.json()
    assert d["today"] >= 1000
    assert d["month"] >= 1000
    assert any(e["id"] == eid for e in d["expenses"])

    r3 = s.delete(f"{API}/expenses/{eid}")
    assert r3.status_code == 200
    assert r3.json().get("ok") is True


# ---------- Held ----------
def test_held_lifecycle(s):
    payload = {"label": "TEST_Mesa 9", "items": [{"product_id": "x", "name": "TEST", "qty": 2, "price": 1500}], "customer_name": "Cliente T"}
    r = s.post(f"{API}/held", json=payload)
    assert r.status_code == 200, r.text
    h = r.json()
    assert h["total"] == 3000
    hid = h["id"]

    r2 = s.get(f"{API}/held")
    assert any(x["id"] == hid for x in r2.json())

    r3 = s.delete(f"{API}/held/{hid}")
    assert r3.status_code == 200


# ---------- Electronic POS ----------
def test_electronic_settings(s):
    r = s.put(f"{API}/electronic/settings", json={
        "nit": "900123456-1", "razon_social": "TEST Tienda SAS",
        "resolucion": "RES-123", "prefijo": "FE", "rango_desde": 1, "rango_hasta": 1000, "fecha_resolucion": "2025-01-01"
    })
    assert r.status_code == 200
    r2 = s.get(f"{API}/electronic/settings")
    assert r2.status_code == 200
    assert r2.json()["nit"] == "900123456-1"


def test_electronic_invoice(s):
    # Need a sale
    sales = s.get(f"{API}/sales").json()
    if not sales:
        pytest.skip("No sales available")
    sid = sales[0]["id"]
    r = s.get(f"{API}/electronic/invoice/{sid}")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "cufe" in d and len(d["cufe"]) == 64
    assert d["status"] == "simulada"
    assert "<Invoice" in d["xml"]
    assert "SIMULACIÓN" in d["xml"]


# ---------- Regression ----------
def test_dashboard_summary(s):
    r = s.get(f"{API}/reports/summary")
    assert r.status_code == 200
    d = r.json()
    for k in ["total_sales", "sales_count", "products_count", "todays_sales"]:
        assert k in d


def test_credits_summary(s):
    r = s.get(f"{API}/credits/summary")
    assert r.status_code == 200
    assert "customers" in r.json()


# ---------- Cleanup ----------
def test_zz_cleanup(s):
    prods = s.get(f"{API}/products", params={"q": "TEST_"}).json()
    for p in prods:
        if p["name"].startswith("TEST_"):
            s.delete(f"{API}/products/{p['id']}")
