"""Mientras la emisión DIAN sea simulada, ningún plan debe anunciarla como incluida."""
import os

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.mark.skipif(os.environ.get("DIAN_MODE", "sandbox").lower() == "real", reason="DIAN_MODE=real")
def test_public_plans_do_not_advertise_dian():
    r = requests.get(f"{API}/billing/plans")
    assert r.status_code == 200, r.text
    plans = r.json()
    assert plans, "se esperaba al menos un plan sembrado"
    assert all(p["dian_enabled"] is False for p in plans), [p["id"] for p in plans if p["dian_enabled"]]
