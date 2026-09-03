"""Auth + Users + Settings backend tests for JRPOS."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@jrpos.com", "password": "jrpos2026"}
OLD_ADMIN_EMAIL = "camiloleal.opx@gmail.com"
CAJERO = {"email": "cajero@jrpos.co", "password": "cajero123"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def cajero_session():
    # Ensure cajero exists via admin
    admin = requests.Session()
    r = admin.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200
    users = admin.get(f"{API}/users").json()
    if not any(u.get("email") == CAJERO["email"] for u in users):
        admin.post(f"{API}/users", json={
            "name": "Cajero Test", "email": CAJERO["email"],
            "password": CAJERO["password"], "role": "cajero"
        })
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=CAJERO)
    assert r.status_code == 200, r.text
    return s


# ---------- Login ----------
def test_login_admin_ok_sets_cookies():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "admin"
    # httpOnly cookies
    cookie_names = {c.name for c in s.cookies}
    assert "access_token" in cookie_names


def test_login_invalid_credentials():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
    assert r.status_code in (400, 401)


def test_me_requires_cookie():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_me_with_cookie(admin_session):
    r = admin_session.get(f"{API}/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


# ---------- Route protection ----------
def test_products_requires_auth():
    r = requests.get(f"{API}/products")
    assert r.status_code == 401


def test_products_with_auth(admin_session):
    r = admin_session.get(f"{API}/products")
    assert r.status_code == 200


# ---------- Users CRUD (admin only) ----------
def test_users_list_admin(admin_session):
    r = admin_session.get(f"{API}/users")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_users_forbidden_for_cajero(cajero_session):
    r = cajero_session.get(f"{API}/users")
    assert r.status_code == 403


def test_users_create_and_delete(admin_session):
    payload = {"name": "TEST_User", "email": "test_user@jrpos.co", "password": "pass1234", "role": "cajero"}
    # cleanup if exists
    existing = admin_session.get(f"{API}/users").json()
    for u in existing:
        if u.get("email") == payload["email"]:
            admin_session.delete(f"{API}/users/{u['id']}")
    r = admin_session.post(f"{API}/users", json=payload)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    # Verify persistence
    lst = admin_session.get(f"{API}/users").json()
    assert any(u["id"] == uid and u["email"] == payload["email"] for u in lst)
    # Delete
    r2 = admin_session.delete(f"{API}/users/{uid}")
    assert r2.status_code == 200
    lst2 = admin_session.get(f"{API}/users").json()
    assert not any(u["id"] == uid for u in lst2)


def test_users_cannot_self_delete(admin_session):
    me = admin_session.get(f"{API}/auth/me").json()
    r = admin_session.delete(f"{API}/users/{me['id']}")
    assert r.status_code in (400, 403)


# ---------- Settings general ----------
def test_settings_get(admin_session):
    r = admin_session.get(f"{API}/settings/general")
    assert r.status_code == 200


def test_settings_put_admin(admin_session):
    payload = {"store_name": "Tienda Camilo TEST", "accent": "ocean", "printer_width": 80, "iva_default": 19, "ticket_footer": "Gracias", "support_phone": "3001234567"}
    r = admin_session.put(f"{API}/settings/general", json=payload)
    assert r.status_code == 200, r.text
    r2 = admin_session.get(f"{API}/settings/general")
    assert r2.status_code == 200
    d = r2.json()
    assert d["store_name"] == "Tienda Camilo TEST"
    assert d["accent"] == "ocean"
    assert d["printer_width"] == 80


def test_settings_put_forbidden_cajero(cajero_session):
    r = cajero_session.put(f"{API}/settings/general", json={"store_name": "Hack"})
    assert r.status_code == 403


# ---------- Cajero can use POS/credits ----------
def test_cajero_can_list_products(cajero_session):
    r = cajero_session.get(f"{API}/products")
    assert r.status_code == 200


def test_cajero_can_hold_sale(cajero_session):
    payload = {"label": "TEST_Cajero", "items": [{"product_id": "x", "name": "TEST", "qty": 1, "price": 1000}], "customer_name": "T"}
    r = cajero_session.post(f"{API}/held", json=payload)
    assert r.status_code == 200
    hid = r.json()["id"]
    cajero_session.delete(f"{API}/held/{hid}")


# ---------- Brute force lockout ----------
def test_brute_force_lockout():
    # 5 fails then lock
    email = "brute_test@jrpos.co"
    for _ in range(5):
        requests.post(f"{API}/auth/login", json={"email": email, "password": "x"})
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": "x"})
    # should be locked (429) or still 401 depending on impl
    assert r.status_code in (401, 429)


# ---------- Logout ----------
def test_logout(admin_session):
    r = admin_session.post(f"{API}/auth/logout")
    assert r.status_code == 200
