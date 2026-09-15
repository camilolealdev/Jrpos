"""Backend tests for price lists (listas de precios): CRUD, active window,
customer default assignment (mayorista) and effective-price resolution used by
the POS. Registra su propio tenant (igual patrón que test_granular_rbac.py) en
vez de depender de las credenciales de admin sembradas por seed_admin(), que
varían según el entorno donde corra la suite."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def pl_tenant():
    uid = uuid.uuid4().hex[:6]
    admin_email = f"admin_pl_{uid}@tienda.co"
    pwd = "Str0ng!Pass_2026_Pl"

    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"Tienda ListaPrecios {uid}",
        "email": admin_email,
        "password": pwd,
        "name": "Admin ListaPrecios",
        "has_multiple_branches": False,
    })
    assert r.status_code == 200, r.text
    return {"admin_session": s, "uid": uid}


@pytest.fixture(scope="module")
def admin_session(pl_tenant):
    return pl_tenant["admin_session"]


@pytest.fixture(scope="module")
def cajero_session(pl_tenant):
    admin_s = pl_tenant["admin_session"]
    uid = uuid.uuid4().hex[:6]
    email = f"cajero_pl_{uid}@tienda.co"
    pwd = "cajero123x"
    r = admin_s.post(f"{API}/users", json={"name": "Cajero PL", "email": email, "password": pwd, "role": "cajero"})
    assert r.status_code == 200, r.text
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def product(admin_session):
    r = admin_session.post(f"{API}/products", json={
        "name": "TEST_PL Producto Base", "price": 1000, "cost": 600,
    })
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def customer(admin_session):
    r = admin_session.post(f"{API}/contacts", json={
        "kind": "customer", "name": "TEST_PL Cliente Mayorista",
    })
    assert r.status_code == 200, r.text
    return r.json()


class TestPriceListsCrud:
    def test_create_list_active_update_items_delete(self, admin_session, product):
        r = admin_session.post(f"{API}/price-lists", json={
            "name": "TEST_PL Mayorista", "active": True,
            "items": [{"product_id": product["id"], "price": 800}],
        })
        assert r.status_code == 200, r.text
        pl = r.json()
        plid = pl["id"]
        assert pl["active"] is True
        assert len(pl["items"]) == 1
        assert pl["items"][0]["product_id"] == product["id"]
        assert pl["items"][0]["price"] == 800

        # appears in list + active
        listed = admin_session.get(f"{API}/price-lists").json()
        assert any(p["id"] == plid for p in listed)
        active = admin_session.get(f"{API}/price-lists/active").json()
        assert any(p["id"] == plid for p in active)

        # deactivate -> disappears from /active
        r2 = admin_session.put(f"{API}/price-lists/{plid}", json={"active": False})
        assert r2.status_code == 200
        assert r2.json()["active"] is False
        active2 = admin_session.get(f"{API}/price-lists/active").json()
        assert not any(p["id"] == plid for p in active2)

        # replace items entirely
        r3 = admin_session.put(f"{API}/price-lists/{plid}", json={
            "active": True, "items": [{"product_id": product["id"], "price": 750}],
        })
        assert r3.status_code == 200
        assert len(r3.json()["items"]) == 1
        assert r3.json()["items"][0]["price"] == 750

        # delete
        r4 = admin_session.delete(f"{API}/price-lists/{plid}")
        assert r4.status_code == 200
        listed2 = admin_session.get(f"{API}/price-lists").json()
        assert not any(p["id"] == plid for p in listed2)

    def test_date_window_like_promotions(self, admin_session, product):
        """Mismo criterio de ventana de fechas que promotions.py's /promotions/active:
        start/end en el pasado excluye la lista de /active."""
        r = admin_session.post(f"{API}/price-lists", json={
            "name": "TEST_PL Vencida", "active": True,
            "start": "2000-01-01", "end": "2000-01-02",
            "items": [{"product_id": product["id"], "price": 700}],
        })
        assert r.status_code == 200, r.text
        plid = r.json()["id"]

        active = admin_session.get(f"{API}/price-lists/active").json()
        assert not any(p["id"] == plid for p in active)

        admin_session.delete(f"{API}/price-lists/{plid}")


class TestPriceListsCustomerResolution:
    def test_effective_prices_follow_customer_default_list(self, admin_session, product, customer):
        # sin lista asignada -> sin overrides
        r = admin_session.get(f"{API}/price-lists/effective-prices", params={"contact_id": customer["id"]})
        assert r.status_code == 200
        assert r.json() == {}

        # crear lista y asignarla como default del cliente
        r = admin_session.post(f"{API}/price-lists", json={
            "name": "TEST_PL Cliente Default", "active": True,
            "items": [{"product_id": product["id"], "price": 850}],
        })
        assert r.status_code == 200, r.text
        plid = r.json()["id"]

        r = admin_session.put(f"{API}/contacts/{customer['id']}", json={
            "kind": "customer", "name": customer["name"], "price_list_id": plid,
        })
        assert r.status_code == 200, r.text
        assert r.json()["price_list_id"] == plid

        r = admin_session.get(f"{API}/price-lists/effective-prices", params={"contact_id": customer["id"]})
        assert r.status_code == 200
        assert r.json().get(product["id"]) == 850

        # sin contact_id -> sigue sin overrides (nunca se aplica "a ciegas")
        r = admin_session.get(f"{API}/price-lists/effective-prices")
        assert r.status_code == 200
        assert r.json() == {}

        # cleanup
        admin_session.delete(f"{API}/price-lists/{plid}")


class TestPriceListsPermissions:
    def test_cajero_cannot_read_or_manage_price_lists(self, cajero_session):
        r = cajero_session.get(f"{API}/price-lists")
        assert r.status_code == 403
        assert "price_lists:read" in r.json().get("detail", "")

        r2 = cajero_session.post(f"{API}/price-lists", json={"name": "Intento Ilegal", "active": True})
        assert r2.status_code == 403
        assert "price_lists:manage" in r2.json().get("detail", "")
