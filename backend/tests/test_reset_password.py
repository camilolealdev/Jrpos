"""Regression tests for PUT /api/users/{user_id}/reset-password (Admin password reset)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('BACKEND_TEST_URL', 'https://localhost').rstrip('/')
API = f"{BASE_URL}/api"
ADMIN = {"email": os.environ.get("TEST_ADMIN_EMAIL", "admin@jrpos.co"), "password": os.environ.get("TEST_ADMIN_PASSWORD", "testpass123")}
CAJERO = {"email": "cajero@jrpos.co", "password": "cajero123"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def cajero_session(admin_session):
    # Ensure cajero exists
    users = admin_session.get(f"{API}/users").json()
    if not any(u.get("email") == CAJERO["email"] for u in users):
        admin_session.post(f"{API}/users", json={
            "name": "Cajero Test",
            "email": CAJERO["email"],
            "password": CAJERO["password"],
            "role": "cajero",
        })
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=CAJERO)
    assert r.status_code == 200, f"Cajero login failed: {r.status_code} {r.text}"
    return s


def test_admin_can_reset_user_password_and_login(admin_session):
    unique_email = f"test_cajero_reset_{int(time.time())}@jrpos.co"
    initial_pass = "initial_pass_123"
    new_pass = "new_secure_pass_789"

    # 1. Admin creates user
    r_create = admin_session.post(f"{API}/users", json={
        "name": "Cajero Temporal",
        "email": unique_email,
        "password": initial_pass,
        "role": "cajero",
    })
    assert r_create.status_code == 200, r_create.text
    user_id = r_create.json()["id"]

    try:
        # 2. Verify initial login works
        user_session = requests.Session()
        r_login_init = user_session.post(f"{API}/auth/login", json={
            "email": unique_email,
            "password": initial_pass,
        })
        assert r_login_init.status_code == 200

        # 3. Admin resets password
        r_reset = admin_session.put(f"{API}/users/{user_id}/reset-password", json={
            "new_password": new_pass,
        })
        assert r_reset.status_code == 200, r_reset.text
        assert r_reset.json().get("ok") is True

        # 4. Old password must fail
        old_session = requests.Session()
        r_login_old = old_session.post(f"{API}/auth/login", json={
            "email": unique_email,
            "password": initial_pass,
        })
        assert r_login_old.status_code in (400, 401), f"Old password should fail, got {r_login_old.status_code}"

        # 5. New password must succeed
        new_session = requests.Session()
        r_login_new = new_session.post(f"{API}/auth/login", json={
            "email": unique_email,
            "password": new_pass,
        })
        assert r_login_new.status_code == 200, f"New password login failed: {r_login_new.status_code} {r_login_new.text}"

    finally:
        # Cleanup
        admin_session.delete(f"{API}/users/{user_id}")


def test_reset_password_short_password_fails(admin_session):
    # Short password (< 4 chars) should return 400
    users = admin_session.get(f"{API}/users").json()
    assert len(users) > 0
    target_id = users[0]["id"]

    r = admin_session.put(f"{API}/users/{target_id}/reset-password", json={
        "new_password": "123",
    })
    assert r.status_code == 400
    assert "al menos 4 caracteres" in r.text


def test_reset_password_nonexistent_user_fails(admin_session):
    r = admin_session.put(f"{API}/users/non-existent-user-id-99999/reset-password", json={
        "new_password": "validpassword123",
    })
    assert r.status_code == 404


def test_cajero_cannot_reset_password_forbidden(cajero_session, admin_session):
    users = admin_session.get(f"{API}/users").json()
    assert len(users) > 0
    target_id = users[0]["id"]

    r = cajero_session.put(f"{API}/users/{target_id}/reset-password", json={
        "new_password": "hacked_password_123",
    })
    assert r.status_code == 403


def test_unauthenticated_reset_password_fails():
    anon = requests.Session()
    r = anon.put(f"{API}/users/any-id/reset-password", json={
        "new_password": "somepassword123",
    })
    assert r.status_code == 401
