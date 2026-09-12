"""Pruebas de Seguridad para Impersonación y Auditoría SaaS."""
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
def target_tenant():
    uid = uuid.uuid4().hex[:6]
    email = f"target_{uid}@tienda.co"
    pwd = "tenantpass123"

    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"Tienda Target {uid}",
        "email": email,
        "password": pwd,
        "name": "Don Target",
    })
    assert r.status_code == 200, r.text
    return {
        "tenant_id": r.json()["tenant"]["id"],
        "email": email,
    }


def test_impersonation_requires_mandatory_documented_reason(superadmin_session, target_tenant):
    tid = target_tenant["tenant_id"]

    # 1. Sin motivo -> 422
    r_empty = superadmin_session.post(f"{API}/superadmin/impersonate/{tid}", json={})
    assert r_empty.status_code == 422

    # 2. Motivo demasiado corto (< 10 caracteres) -> 422
    r_short = superadmin_session.post(f"{API}/superadmin/impersonate/{tid}", json={"reason": "ayuda"})
    assert r_short.status_code == 422


def test_impersonation_flow_and_exit(target_tenant):
    tid = target_tenant["tenant_id"]

    # Iniciar sesión fresca de superadmin
    admin_s = requests.Session()
    r_login = admin_s.post(f"{API}/auth/login", json=SUPERADMIN)
    assert r_login.status_code == 200
    superadmin_id = r_login.json()["id"]

    # Ejecutar impersonación con motivo válido
    reason_text = "Asistencia técnica para configuración de impresoras térmicas"
    r_imp = admin_s.post(f"{API}/superadmin/impersonate/{tid}", json={"reason": reason_text})
    assert r_imp.status_code == 200, r_imp.text
    data_imp = r_imp.json()
    assert data_imp["ok"] is True
    assert data_imp["session"]["is_impersonated"] is True
    assert data_imp["session"]["actor_id"] == superadmin_id
    assert data_imp["session"]["expires_in_seconds"] == 1800

    # Verificar que /api/auth/me ahora ve la identidad del tenant con flag de impersonación
    r_me = admin_s.get(f"{API}/auth/me")
    assert r_me.status_code == 200
    me_data = r_me.json()
    assert me_data["tenant_id"] == tid
    assert me_data["is_impersonated"] is True
    assert me_data["actor_id"] == superadmin_id

    # Salir de la impersonación mediante /api/auth/exit-impersonation
    r_exit = admin_s.post(f"{API}/auth/exit-impersonation")
    assert r_exit.status_code == 200, r_exit.text
    exit_data = r_exit.json()
    assert exit_data["ok"] is True

    # Verificar que la sesión volvió a ser la de SuperAdmin
    r_me_restored = admin_s.get(f"{API}/auth/me")
    assert r_me_restored.status_code == 200
    restored_data = r_me_restored.json()
    assert restored_data["role"] == "superadmin_platform"
    assert restored_data["is_impersonated"] is False
    assert restored_data["actor_id"] is None


def test_regular_user_cannot_impersonate(target_tenant):
    tid = target_tenant["tenant_id"]
    # Usuario normal logueado
    reg_s = requests.Session()
    reg_s.post(f"{API}/auth/login", json={"email": target_tenant["email"], "password": "tenantpass123"})

    r = reg_s.post(f"{API}/superadmin/impersonate/{tid}", json={"reason": "Intento no autorizado"})
    assert r.status_code in (401, 403)
