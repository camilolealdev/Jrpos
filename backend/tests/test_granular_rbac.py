"""Pruebas automatizadas de Autorización Granular (RBAC)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("BACKEND_TEST_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {
    "email": os.environ.get("ADMIN_EMAIL", "admin@jrpos.co"),
    "password": os.environ.get("ADMIN_PASSWORD", "testpass123"),
}
CAJERO = {"email": "cajero_rbac@jrpos.co", "password": "cajero123"}
MESERO = {"email": "mesero_rbac@jrpos.co", "password": "mesero123"}


@pytest.fixture(scope="module")
def rbac_tenant():
    import uuid
    uid = uuid.uuid4().hex[:6]
    admin_email = f"admin_rbac_{uid}@tienda.co"
    pwd = "testpass123"

    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"Tienda RBAC {uid}",
        "email": admin_email,
        "password": pwd,
        "name": "Admin RBAC",
        "has_multiple_branches": False,
    })
    assert r.status_code == 200, r.text
    tenant_id = r.json()["tenant"]["id"]

    return {
        "admin_session": s,
        "tenant_id": tenant_id,
        "admin_email": admin_email,
        "password": pwd,
    }


@pytest.fixture(scope="module")
def admin_session(rbac_tenant):
    return rbac_tenant["admin_session"]


@pytest.fixture(scope="module")
def cajero_session(rbac_tenant):
    admin_s = rbac_tenant["admin_session"]
    uid = uuid.uuid4().hex[:6]
    cajero_email = f"cajero_{uid}@tienda.co"
    cajero_pwd = "cajero123"

    r = admin_s.post(f"{API}/users", json={
        "name": "Cajero RBAC",
        "email": cajero_email,
        "password": cajero_pwd,
        "role": "cajero",
    })
    assert r.status_code == 200, r.text

    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": cajero_email, "password": cajero_pwd})
    assert r.status_code == 200, f"Cajero login failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def mesero_session(rbac_tenant):
    admin_s = rbac_tenant["admin_session"]
    uid = uuid.uuid4().hex[:6]
    mesero_email = f"mesero_{uid}@tienda.co"
    mesero_pwd = "mesero123"

    r = admin_s.post(f"{API}/users", json={
        "name": "Mesero RBAC",
        "email": mesero_email,
        "password": mesero_pwd,
        "role": "mesero",
    })
    assert r.status_code == 200, r.text

    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": mesero_email, "password": mesero_pwd})
    assert r.status_code == 200, f"Mesero login failed: {r.text}"
    return s


def test_auth_me_returns_granular_permissions(cajero_session, admin_session):
    r_cajero = cajero_session.get(f"{API}/auth/me")
    assert r_cajero.status_code == 200
    data_cajero = r_cajero.json()
    assert "permissions" in data_cajero
    assert "sales:create" in data_cajero["permissions"]
    assert "products:create" not in data_cajero["permissions"]
    assert data_cajero["is_impersonated"] is False

    r_admin = admin_session.get(f"{API}/auth/me")
    assert r_admin.status_code == 200
    data_admin = r_admin.json()
    assert "products:create" in data_admin["permissions"]
    assert "settings:manage" in data_admin["permissions"]


def test_cajero_cannot_create_product(cajero_session):
    r = cajero_session.post(f"{API}/products", json={
        "name": "Intento Ilegal Cajero",
        "price": 5000,
        "cost": 3000,
    })
    assert r.status_code == 403
    assert "products:create" in r.json().get("detail", "")


def test_cajero_cannot_delete_product(cajero_session, admin_session):
    # Admin crea producto de prueba
    prod = admin_session.post(f"{API}/products", json={
        "name": "Producto Prueba Delete",
        "price": 1000,
        "cost": 500,
    }).json()
    pid = prod["id"]

    # Cajero intenta borrarlo -> 403
    r = cajero_session.delete(f"{API}/products/{pid}")
    assert r.status_code == 403
    assert "products:delete" in r.json().get("detail", "")

    # Cleanup con admin
    del_r = admin_session.delete(f"{API}/products/{pid}")
    assert del_r.status_code == 200


def test_cajero_cannot_create_or_delete_expense(cajero_session, admin_session):
    # Cajero intenta crear gasto -> 403
    r = cajero_session.post(f"{API}/expenses", json={
        "concept": "Gasto no autorizado",
        "amount": 25000,
        "method": "efectivo",
    })
    assert r.status_code == 403
    assert "expenses:create" in r.json().get("detail", "")

    # Admin crea gasto
    exp = admin_session.post(f"{API}/expenses", json={
        "concept": "Gasto Admin Autorizado",
        "amount": 10000,
        "method": "efectivo",
    }).json()
    eid = exp["id"]

    # Cajero intenta borrar gasto -> 403
    del_r = cajero_session.delete(f"{API}/expenses/{eid}")
    assert del_r.status_code == 403
    assert "expenses:delete" in del_r.json().get("detail", "")

    # Cleanup
    admin_session.delete(f"{API}/expenses/{eid}")


def test_cajero_cannot_manage_promotions(cajero_session):
    r = cajero_session.post(f"{API}/promotions", json={
        "name": "Promo No Autorizada",
        "type": "percent_all",
        "value": 15.0,
    })
    assert r.status_code == 403
    assert "promotions:manage" in r.json().get("detail", "")


def test_cajero_cannot_use_ocr(cajero_session):
    r = cajero_session.post(f"{API}/invoices/ocr", json={
        "image_base64": "data:image/jpeg;base64,dGVzdA==",
    })
    assert r.status_code == 403
    assert "invoices:ocr" in r.json().get("detail", "")


def test_cajero_cannot_create_purchase_order(cajero_session):
    r = cajero_session.post(f"{API}/purchase-orders", json={
        "supplier_name": "Proveedor Test",
        "items": [{"name": "Item 1", "qty": 10, "cost": 2000}],
    })
    assert r.status_code == 403
    assert "inventory:purchase" in r.json().get("detail", "")


def test_mesero_cannot_view_expenses(mesero_session):
    r = mesero_session.get(f"{API}/expenses")
    assert r.status_code == 403
    assert "expenses:read" in r.json().get("detail", "")
