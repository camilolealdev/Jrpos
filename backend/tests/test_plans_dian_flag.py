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


def test_public_plans_expose_electronic_invoicing_pricing():
    """Cada plan trae el incremento mensual por factura electrónica y los documentos al año que incluye."""
    plans = {p["id"]: p for p in requests.get(f"{API}/billing/plans").json()}
    ordered = [plans[i] for i in ("basico", "pro", "franquicia")]
    for p in ordered:
        assert p["fe_addon_cop"] > 0, p["id"]
        assert p["fe_docs_year"] > 0, p["id"]
        # el incremento nunca supera al plan base
        assert p["fe_addon_cop"] < p["price_cop"], p["id"]
        # y anunciarlo no significa que la emisión sea real
        assert p["dian_enabled"] is False, p["id"]
    adds = [p["fe_addon_cop"] for p in ordered]
    docs = [p["fe_docs_year"] for p in ordered]
    assert adds == sorted(adds) and len(set(adds)) == 3
    assert docs == sorted(docs) and len(set(docs)) == 3
