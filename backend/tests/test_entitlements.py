"""Pruebas de Enforcement Comercial y Límites de Plan SaaS."""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"

SUPERADMIN = {
    "email": os.environ.get("SUPERADMIN_EMAIL", "superadmin@jrpos.co"),
    "password": os.environ.get("SUPERADMIN_PASSWORD", "testpass123"),
}


@pytest.fixture(scope="module")
def superadmin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=SUPERADMIN)
    assert r.status_code == 200, f"SuperAdmin login failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def limited_tenant():
    # Registrar un tenant nuevo para probar límites
    uid = uuid.uuid4().hex[:6]
    email = f"plan_limit_{uid}@tienda.co"
    pwd = "tenantpass123"

    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"Tienda Limites {uid}",
        "email": email,
        "password": pwd,
        "name": "Don Pruebas",
        "has_multiple_branches": False,
    })
    assert r.status_code == 200, r.text
    tenant_id = r.json()["tenant"]["id"]

    return {
        "session": s,
        "tenant_id": tenant_id,
        "email": email,
        "password": pwd,
    }


def test_product_limit_enforcement(limited_tenant, superadmin_session):
    tenant_session = limited_tenant["session"]
    tenant_id = limited_tenant["tenant_id"]

    # SuperAdmin crea un plan 'micro' muy restrictivo (max_products=2) y se lo asigna al tenant
    plan_data = {
        "id": "micro_test",
        "name": "Plan Micro Test",
        "price_cop": 10000,
        "max_products": 2,
        "max_users": 1,
        "max_branches": 1,
        "ai_ocr_enabled": False,
        "dian_enabled": False,
    }
    # Asegurar plan en superadmin
    superadmin_session.post(f"{API}/billing/superadmin/plans", json=plan_data)
    act_r = superadmin_session.post(f"{API}/billing/superadmin/tenants/{tenant_id}/activate", json={"plan_id": "micro_test", "months": 1})
    assert act_r.status_code == 200, act_r.text

    # Producto 1 -> OK
    r1 = tenant_session.post(f"{API}/products", json={
        "name": "Producto Limit 1", "price": 1000, "cost": 500
    })
    assert r1.status_code == 200, r1.text

    # Producto 2 -> OK
    r2 = tenant_session.post(f"{API}/products", json={
        "name": "Producto Limit 2", "price": 2000, "cost": 1000
    })
    assert r2.status_code == 200, r2.text

    # Producto 3 -> 402 Límite Excedido
    r3 = tenant_session.post(f"{API}/products", json={
        "name": "Producto Limit 3 (Debe fallar)", "price": 3000, "cost": 1500
    })
    assert r3.status_code == 402, f"Expected 402 but got {r3.status_code}: {r3.text}"
    assert "Límite de productos excedido" in r3.json().get("detail", "")
    assert r3.headers.get("X-Error-Code") == "PLAN_LIMIT_EXCEEDED"


def test_bulk_product_limit_enforcement(limited_tenant):
    tenant_session = limited_tenant["session"]
    # Intentar carga masiva de productos que supera el límite
    r = tenant_session.post(f"{API}/products/bulk", json=[
        {"name": "Bulk 1", "price": 100},
        {"name": "Bulk 2", "price": 200},
    ])
    assert r.status_code == 402
    assert "Límite de productos excedido" in r.json().get("detail", "")


def test_user_limit_enforcement(limited_tenant):
    tenant_session = limited_tenant["session"]
    # El plan micro tiene max_users=1, y el admin ya es 1 usuario
    r = tenant_session.post(f"{API}/users", json={
        "name": "Cajero Extra",
        "email": f"cajero_extra_{uuid.uuid4().hex[:6]}@tienda.co",
        "password": "pass1234",
        "role": "cajero",
    })
    assert r.status_code == 402
    assert "Límite de colaboradores alcanzado" in r.json().get("detail", "")
    assert r.headers.get("X-Error-Code") == "PLAN_LIMIT_EXCEEDED"


def test_ocr_feature_not_in_plan(limited_tenant):
    tenant_session = limited_tenant["session"]
    # Plan micro tiene ai_ocr_enabled=False
    r = tenant_session.post(f"{API}/invoices/ocr", json={
        "image_base64": "data:image/jpeg;base64,dGVzdA==",
    })
    assert r.status_code == 402
    assert "OCR" in r.json().get("detail", "")
    assert r.headers.get("X-Error-Code") == "FEATURE_NOT_IN_PLAN"
