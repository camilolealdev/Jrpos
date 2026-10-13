"""Regresiones de inventario / importación de facturas / OCR.

Cubre: recarga masiva de productos existentes (NameError admin.id), unicidad de
barcode por tenant (409), idempotencia de /invoices/import, que el import no
pise precios ni la presentación del producto, y los topes del OCR.

Los tests HTTP siguen la convención del resto de la suite (servidor vivo en
BACKEND_TEST_URL + admin sembrado); los unitarios importan los módulos directo.
"""
import os
import sys
import uuid

import pytest
import requests

# los tests unitarios importan módulos del backend directamente (la suite corre desde backend/)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {
    "email": os.environ.get("ADMIN_EMAIL", "admin@jrpos.co"),
    "password": os.environ.get("ADMIN_PASSWORD", "testpass123"),
}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def _uid() -> str:
    return uuid.uuid4().hex[:10]


def _create_product(s, **over):
    body = {"name": f"TEST_Inv_{_uid()}", "price": 5000, "cost": 3000, "stock": 10}
    body.update(over)
    r = s.post(f"{API}/products", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _get_product(s, pid):
    r = s.get(f"{API}/products/{pid}")
    assert r.status_code == 200, r.text
    return r.json()


# ---------- 1. bulk reimport de un producto existente con stock ----------
def test_bulk_reimport_existing_product_with_stock(admin_session):
    code = f"77{_uid()}"
    p = _create_product(admin_session, barcode=code, stock=10)
    r = admin_session.post(f"{API}/products/bulk", json=[
        {"name": p["name"], "barcode": code, "price": 5000, "cost": 3000, "stock": 5},
    ])
    assert r.status_code == 200, r.text  # antes: 500 por NameError (admin)
    assert r.json()["updated"] == 1
    assert _get_product(admin_session, p["id"])["stock"] == 15


# ---------- 2. barcode único por tenant ----------
def test_create_duplicate_barcode_returns_409(admin_session):
    code = f"78{_uid()}"
    _create_product(admin_session, barcode=code)
    r = admin_session.post(f"{API}/products", json={"name": f"TEST_Dup_{_uid()}", "price": 1, "barcode": code})
    assert r.status_code == 409, r.text


def test_update_to_taken_barcode_returns_409_but_own_barcode_ok(admin_session):
    code_a, code_b = f"79{_uid()}", f"80{_uid()}"
    a = _create_product(admin_session, barcode=code_a)
    b = _create_product(admin_session, barcode=code_b)
    r = admin_session.put(f"{API}/products/{b['id']}", json={"barcode": code_a})
    assert r.status_code == 409, r.text
    # re-guardar el propio barcode (mismo valor) no es conflicto
    r = admin_session.put(f"{API}/products/{a['id']}", json={"barcode": code_a, "price": 5100})
    assert r.status_code == 200, r.text


def test_blank_barcodes_do_not_collide(admin_session):
    _create_product(admin_session, barcode="   ")
    r = admin_session.post(f"{API}/products", json={"name": f"TEST_Blank_{_uid()}", "price": 1, "barcode": ""})
    assert r.status_code == 200, r.text


def test_barcode_lookup_finds_product(admin_session):
    code = f"81{_uid()}"
    p = _create_product(admin_session, barcode=code)
    r = admin_session.get(f"{API}/products/barcode/{code}")
    assert r.status_code == 200 and r.json()["id"] == p["id"]


# ---------- 3. import de factura: idempotencia y no pisar datos ----------
def _import_payload(p, number, **item_over):
    item = {"name": p["name"], "barcode": p["barcode"], "quantity": 4, "unit_price": 2000}
    item.update(item_over)
    return {"supplier_name": f"Proveedor {number}", "supplier_nit": "900123456", "invoice_number": number, "items": [item]}


def test_import_same_invoice_twice_is_idempotent(admin_session):
    p = _create_product(admin_session, barcode=f"82{_uid()}", stock=10)
    payload = _import_payload(p, f"FV-{_uid()}")
    r1 = admin_session.post(f"{API}/invoices/import", json=payload)
    assert r1.status_code == 200 and r1.json()["updated"] == 1, r1.text
    assert _get_product(admin_session, p["id"])["stock"] == 14

    r2 = admin_session.post(f"{API}/invoices/import", json=payload)
    assert r2.status_code == 200, r2.text
    assert r2.json()["duplicate"] is True
    assert r2.json()["invoice_id"] == r1.json()["invoice_id"]
    assert _get_product(admin_session, p["id"])["stock"] == 14  # no se duplicó


def test_import_same_number_different_supplier_is_not_duplicate(admin_session):
    p = _create_product(admin_session, barcode=f"83{_uid()}", stock=0)
    number = f"FV-{_uid()}"
    a = _import_payload(p, number)
    b = _import_payload(p, number)
    b["supplier_nit"] = "800999888"
    assert admin_session.post(f"{API}/invoices/import", json=a).json().get("duplicate") is None
    assert admin_session.post(f"{API}/invoices/import", json=b).json().get("duplicate") is None
    assert _get_product(admin_session, p["id"])["stock"] == 8


def test_import_does_not_overwrite_price_or_package_without_explicit_data(admin_session):
    p = _create_product(admin_session, barcode=f"84{_uid()}", price=7777, cost=3000, stock=0, units_per_package=12)
    r = admin_session.post(f"{API}/invoices/import", json=_import_payload(p, f"FV-{_uid()}"))
    assert r.status_code == 200, r.text
    after = _get_product(admin_session, p["id"])
    assert after["price"] == 7777  # antes: costo x 1.3
    assert after["units_per_package"] == 12  # antes: se reiniciaba a 1


def test_import_applies_explicit_selling_price(admin_session):
    p = _create_product(admin_session, barcode=f"85{_uid()}", price=7777, stock=0)
    r = admin_session.post(f"{API}/invoices/import", json=_import_payload(p, f"FV-{_uid()}", selling_price=9100))
    assert r.status_code == 200, r.text
    assert _get_product(admin_session, p["id"])["price"] == 9100


# ---------- 4. OCR / Gemini: modelo retirado ----------
def test_resolve_gemini_model_replaces_retired_models(monkeypatch):
    from routers.invoices import _resolve_gemini_model

    monkeypatch.delenv("GEMINI_OCR_MODEL", raising=False)
    for retired in ("gemini-1.5-flash", "gemini-1.5-pro", "gemini-3-flash-preview", "", None):
        assert _resolve_gemini_model(retired) == "gemini-2.5-flash"
    assert _resolve_gemini_model("gemini-2.5-pro") == "gemini-2.5-pro"
    monkeypatch.setenv("GEMINI_OCR_MODEL", "gemini-flash-latest")
    assert _resolve_gemini_model("gemini-1.5-flash") == "gemini-flash-latest"
