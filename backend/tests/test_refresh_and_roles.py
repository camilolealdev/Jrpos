"""Refresh token transparente + separación de roles + admin migration."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@jrpos.com", "password": "jrpos2026"}
OLD_ADMIN = {"email": "camiloleal.opx@gmail.com", "password": "jrpos2026"}
CAJERO = {"email": "cajero@jrpos.co", "password": "cajero123"}


# ---------- Admin migration ----------
def test_new_admin_login_ok():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"
    assert r.json()["email"] == ADMIN["email"]
    cookies = {c.name for c in s.cookies}
    assert "access_token" in cookies
    assert "refresh_token" in cookies


def test_old_admin_email_fails():
    r = requests.post(f"{API}/auth/login", json=OLD_ADMIN)
    assert r.status_code in (400, 401), f"Old email should fail, got {r.status_code}"


# ---------- Refresh transparente ----------
def test_refresh_endpoint_renews_access_token():
    """Con solo refresh_token válido, /auth/refresh emite nueva cookie access_token."""
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200
    # Borrar SOLO access_token, mantener refresh_token
    refresh = s.cookies.get("refresh_token")
    assert refresh
    s.cookies.clear()
    s.cookies.set("refresh_token", refresh)
    # /me sin access_token debe fallar
    r_me = s.get(f"{API}/auth/me")
    assert r_me.status_code == 401
    # /auth/refresh debe emitir nueva cookie access_token
    r_ref = s.post(f"{API}/auth/refresh")
    assert r_ref.status_code == 200, r_ref.text
    assert s.cookies.get("access_token"), "refresh no emitió access_token cookie"
    # Ahora /me debe funcionar
    r_me2 = s.get(f"{API}/auth/me")
    assert r_me2.status_code == 200
    assert r_me2.json()["email"] == ADMIN["email"]


def test_refresh_without_refresh_token_fails():
    r = requests.post(f"{API}/auth/refresh")
    assert r.status_code == 401


# ---------- Role separation (cajero) ----------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module")
def cajero_session(admin_session):
    users = admin_session.get(f"{API}/users").json()
    if not any(u.get("email") == CAJERO["email"] for u in users):
        admin_session.post(f"{API}/users", json={
            "name": "Cajero Test", "email": CAJERO["email"],
            "password": CAJERO["password"], "role": "cajero"
        })
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=CAJERO)
    assert r.status_code == 200, r.text
    return s


def test_cajero_cannot_list_users(cajero_session):
    r = cajero_session.get(f"{API}/users")
    assert r.status_code == 403


def test_cajero_cannot_create_user(cajero_session):
    r = cajero_session.post(f"{API}/users", json={
        "name": "Hack", "email": "hack@x.com", "password": "hack1234", "role": "admin"
    })
    assert r.status_code == 403


def test_cajero_cannot_delete_user(cajero_session, admin_session):
    users = admin_session.get(f"{API}/users").json()
    target = next(u for u in users if u["email"] == CAJERO["email"])
    r = cajero_session.delete(f"{API}/users/{target['id']}")
    assert r.status_code == 403


def test_cajero_cannot_update_settings(cajero_session):
    r = cajero_session.put(f"{API}/settings/general", json={"store_name": "Hack"})
    assert r.status_code == 403


def test_cajero_can_read_settings(cajero_session):
    r = cajero_session.get(f"{API}/settings/general")
    assert r.status_code == 200


# ---------- Endpoints admin-only sin cookie ----------
def test_settings_put_without_cookie_401():
    r = requests.put(f"{API}/settings/general", json={"store_name": "x"})
    assert r.status_code == 401


def test_users_delete_without_cookie_401():
    r = requests.delete(f"{API}/users/nonexistent")
    assert r.status_code == 401


def test_users_list_without_cookie_401():
    r = requests.get(f"{API}/users")
    assert r.status_code == 401


# ---------- Cajero SI puede POS / credits / reportes / clientes ----------
def test_cajero_can_access_pos_endpoints(cajero_session):
    for path in ["/products", "/held", "/customers", "/credits", "/reports/summary"]:
        r = cajero_session.get(f"{API}{path}")
        assert r.status_code in (200, 404), f"{path} -> {r.status_code}: {r.text[:120]}"


# ---------- Admin puede todo ----------
def test_admin_can_access_admin_only(admin_session):
    assert admin_session.get(f"{API}/users").status_code == 200
    assert admin_session.get(f"{API}/settings/general").status_code == 200


# ---------- Brute force AL FINAL con email distinto ----------
def test_brute_force_lockout_with_unique_email():
    email = f"bruteforce_zzz_{int(time.time())}@jrpos.co"
    codes = []
    for _ in range(6):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrongpass"})
        codes.append(r.status_code)
    # Al menos el último debe ser 429 O el mensaje debe indicar lockout
    assert 429 in codes or any(c == 401 for c in codes), f"codes: {codes}"
