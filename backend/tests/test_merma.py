"""Backend tests for the shrinkage (merma) recording and reporting feature.

Follows the same conventions as test_granular_rbac.py / test_jrpos_modules.py:
HTTP integration tests against the running compose stack (Caddy at BASE_URL),
using the module-seeded admin plus an ad-hoc cajero user for the permission
check.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_TEST_URL", "https://localhost").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {
    "email": os.environ.get("ADMIN_EMAIL", "admin@jrpos.co"),
    "password": os.environ.get("ADMIN_PASSWORD", "testpass123"),
}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def cajero_session(admin_session):
    uid = uuid.uuid4().hex[:6]
    email = f"cajero_merma_{uid}@tienda.co"
    pwd = "cajero123"
    r = admin_session.post(f"{API}/users", json={
        "name": "Cajero Merma Test", "email": email, "password": pwd, "role": "cajero",
    })
    assert r.status_code == 200, r.text

    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"Cajero login failed: {r.text}"
    return s


@pytest.fixture
def merma_product(admin_session):
    r = admin_session.post(f"{API}/products", json={
        "name": "TEST_Merma_Product", "price": 3000, "cost": 2000, "stock": 10,
        "unit": "und", "tax_rate": 0,
    })
    assert r.status_code == 200, r.text
    prod = r.json()
    yield prod
    admin_session.delete(f"{API}/products/{prod['id']}")


class TestMermaRegister:
    def test_invalid_motivo_rejected(self, admin_session, merma_product):
        r = admin_session.post(f"{API}/products/{merma_product['id']}/merma", json={
            "qty": 1, "motivo": "no_existe",
        })
        assert r.status_code == 400

    def test_qty_over_stock_rejected(self, admin_session, merma_product):
        r = admin_session.post(f"{API}/products/{merma_product['id']}/merma", json={
            "qty": 999, "motivo": "vencido",
        })
        assert r.status_code == 400

    def test_qty_zero_rejected(self, admin_session, merma_product):
        r = admin_session.post(f"{API}/products/{merma_product['id']}/merma", json={
            "qty": 0, "motivo": "vencido",
        })
        assert r.status_code == 400

    def test_register_merma_decrements_stock_and_computes_cost_impact(self, admin_session, merma_product):
        pid = merma_product["id"]
        r = admin_session.post(f"{API}/products/{pid}/merma", json={
            "qty": 3, "motivo": "Vencido", "reason": "vitrina 2",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["motivo"] == "vencido"
        assert body["previous_stock"] == 10
        assert body["new_stock"] == 7
        assert body["cost_impact"] == 6000  # 3 * cost(2000)

        after = admin_session.get(f"{API}/products/{pid}").json()
        assert after["stock"] == 7

        movements = admin_session.get(f"{API}/products/{pid}/stock-movements").json()
        merma_moves = [m for m in movements if m["type"] == "merma"]
        assert len(merma_moves) == 1
        assert merma_moves[0]["motivo"] == "vencido"
        assert merma_moves[0]["qty"] == -3

    def test_cajero_cannot_register_merma(self, cajero_session, merma_product):
        r = cajero_session.post(f"{API}/products/{merma_product['id']}/merma", json={
            "qty": 1, "motivo": "roto",
        })
        assert r.status_code == 403
        assert "inventory:adjust" in r.json().get("detail", "")


class TestMermaReport:
    def test_report_aggregates_by_motivo_and_product(self, admin_session, merma_product):
        pid = merma_product["id"]
        admin_session.post(f"{API}/products/{pid}/merma", json={"qty": 2, "motivo": "vencido"})
        admin_session.post(f"{API}/products/{pid}/merma", json={"qty": 1, "motivo": "roto"})

        r = admin_session.get(f"{API}/reports/merma")
        assert r.status_code == 200, r.text
        report = r.json()
        assert report["total_events"] >= 2

        motivos = {row["motivo"] for row in report["by_motivo"]}
        assert "vencido" in motivos
        assert "roto" in motivos

        product_ids = {row["product_id"] for row in report["by_product"]}
        assert pid in product_ids
