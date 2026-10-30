"""Cambiar el tipo de negocio en Configuración debe reflejarse en el tenant
(rol de personal ofrecido, listado de la plataforma)."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin():
    uid = uuid.uuid4().hex[:6]
    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"Tienda Tipo {uid}",
        "email": f"admin_tipo_{uid}@tienda.co",
        "password": "Str0ng!Pass_2026_Tipo",
        "name": "Admin Tipo",
        "business_type": "cafeteria",
        "has_multiple_branches": False,
    })
    assert r.status_code == 200, r.text
    assert r.json()["tenant"]["staff_roles"] == ["mesero"]
    return s


def _save(s, **changes):
    cur = s.get(f"{API}/settings/general")
    assert cur.status_code == 200, cur.text
    body = cur.json()
    body.update(changes)
    return s.put(f"{API}/settings/general", json=body)


def test_changing_type_in_settings_updates_the_tenant(admin):
    r = _save(admin, business_type="restaurante")
    assert r.status_code == 200, r.text
    me = admin.get(f"{API}/auth/me").json()["tenant"]
    assert me["business_type"] == "restaurante"
    assert me["staff_roles"] == ["cajero"]


def test_unknown_type_does_not_block_saving_or_touch_the_tenant(admin):
    # Tenants antiguos pueden tener un valor fuera del catálogo: guardar no debe fallar.
    r = _save(admin, business_type="minimercado")
    assert r.status_code == 200, r.text
    me = admin.get(f"{API}/auth/me").json()["tenant"]
    assert me["business_type"] == "restaurante"
