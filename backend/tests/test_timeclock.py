"""Tests for Marcación (timeclock) module + login regression."""
import os
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": os.environ.get("TEST_ADMIN_EMAIL", "admin@jrpos.co"), "password": os.environ.get("TEST_ADMIN_PASSWORD", "testpass123")}
CAJERO = {"email": "cajero@jrpos.co", "password": "cajero123"}
OLD_ADMIN = {"email": "camiloleal.opx@gmail.com", "password": "jrpos2026"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    return s, r


@pytest.fixture(scope="module")
def admin_session():
    s, r = _login(ADMIN)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def cajero_session(admin_session):
    users_res = admin_session.get(f"{API}/users")
    if users_res.status_code == 200:
        users = users_res.json()
        if not any(u.get("email") == CAJERO["email"] for u in users):
            admin_session.post(f"{API}/users", json={
                "name": "Cajero Test",
                "email": CAJERO["email"],
                "password": CAJERO["password"],
                "role": "cajero",
            })
    s, r = _login(CAJERO)
    assert r.status_code == 200, f"Cajero login failed: {r.status_code} {r.text}"
    return s


# ---------- Login regression ----------
class TestLoginRegression:
    def test_admin_new_email_works(self):
        _, r = _login(ADMIN)
        assert r.status_code == 200
        assert r.json().get("email") == ADMIN["email"]

    def test_old_admin_email_fails(self):
        _, r = _login(OLD_ADMIN)
        assert r.status_code in (400, 401, 429)

    def test_cajero_works(self, cajero_session):
        _, r = _login(CAJERO)
        assert r.status_code == 200
        assert r.json().get("role") == "cajero"


# ---------- Timeclock complete flow (sequential on single worker) ----------
class TestTimeclockFlow:
    def test_get_schedule_public(self, admin_session):
        r = admin_session.get(f"{API}/timeclock/schedule")
        assert r.status_code == 200
        data = r.json()
        assert "entry_time" in data and "exit_time" in data and "tolerance_minutes" in data

    def test_put_schedule_admin_ok(self, admin_session):
        # save then verify via GET
        payload = {"entry_time": "07:30", "exit_time": "17:30", "tolerance_minutes": 15}
        r = admin_session.put(f"{API}/timeclock/schedule", json=payload)
        assert r.status_code == 200
        r2 = admin_session.get(f"{API}/timeclock/schedule")
        assert r2.status_code == 200
        d = r2.json()
        assert d["entry_time"] == "07:30"
        assert d["exit_time"] == "17:30"
        assert d["tolerance_minutes"] == 15
        # restore default
        admin_session.put(f"{API}/timeclock/schedule", json={"entry_time": "08:00", "exit_time": "18:00", "tolerance_minutes": 10})

    def test_put_schedule_cajero_forbidden(self, cajero_session):
        r = cajero_session.put(f"{API}/timeclock/schedule", json={"entry_time": "08:00", "exit_time": "18:00", "tolerance_minutes": 10})
        assert r.status_code == 403

    def test_double_same_type_blocked(self, cajero_session):
        # First ensure a mark exists — mark whatever makes sense based on state
        today = cajero_session.get(f"{API}/timeclock/today").json()
        if not today:
            # Mark 'in' first
            r0 = cajero_session.post(f"{API}/timeclock/mark", json={"type": "in"})
            assert r0.status_code == 200
            last_type = "in"
        else:
            last_type = today[-1]["type"]
        # Try to mark same-type again → 400
        r = cajero_session.post(f"{API}/timeclock/mark", json={"type": last_type})
        assert r.status_code == 400

    def test_mark_invalid_type(self, admin_session):
        r = admin_session.post(f"{API}/timeclock/mark", json={"type": "xxx"})
        assert r.status_code == 400

    def test_late_detection(self, admin_session):
        # set entry_time in past so any mark 'in' is late
        admin_session.put(f"{API}/timeclock/schedule", json={"entry_time": "00:01", "exit_time": "23:59", "tolerance_minutes": 1})
        # Ensure admin last mark is 'out' first (or none) to allow 'in'
        today = admin_session.get(f"{API}/timeclock/today").json()
        if today and today[-1]["type"] == "in":
            # mark out to reset chain
            admin_session.post(f"{API}/timeclock/mark", json={"type": "out"})
        r = admin_session.post(f"{API}/timeclock/mark", json={"type": "in"})
        assert r.status_code == 200, r.text
        assert r.json().get("late") is True
        # restore
        admin_session.put(f"{API}/timeclock/schedule", json={"entry_time": "08:00", "exit_time": "18:00", "tolerance_minutes": 10})

    def test_double_in_blocked(self, admin_session):
        # after previous test, admin last mark should be 'in'
        r = admin_session.post(f"{API}/timeclock/mark", json={"type": "in"})
        assert r.status_code == 400

    def test_mark_out_after_in(self, admin_session):
        r = admin_session.post(f"{API}/timeclock/mark", json={"type": "out"})
        assert r.status_code == 200
        assert r.json().get("type") == "out"

    def test_records_admin_ok(self, admin_session):
        r = admin_session.get(f"{API}/timeclock/records")
        assert r.status_code == 200
        data = r.json()
        assert "date" in data and "employees" in data
        assert isinstance(data["employees"], list)

    def test_records_cajero_forbidden(self, cajero_session):
        r = cajero_session.get(f"{API}/timeclock/records")
        assert r.status_code == 403

    def test_today_cajero_ok(self, cajero_session):
        r = cajero_session.get(f"{API}/timeclock/today")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
