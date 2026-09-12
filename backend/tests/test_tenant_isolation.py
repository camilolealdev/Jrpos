"""Cross-tenant isolation regression tests.

Guards against IDOR-style leaks where tenant A can fetch tenant B's resources
by ID. Regression for the electronic.py finding (sale fetched without
tenant_id check). Any new "fetch by ID" endpoint in a tenant-scoped router
should get a case here.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get('BACKEND_TEST_URL', 'https://localhost').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = {"email": os.environ.get("TEST_ADMIN_EMAIL", "admin@jrpos.co"), "password": os.environ.get("TEST_ADMIN_PASSWORD", "testpass123")}


@pytest.fixture(scope="module")
def tenant_a():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def tenant_b():
    """A freshly registered second tenant (independent admin session)."""
    suffix = uuid.uuid4().hex[:8]
    s = requests.Session()
    r = s.post(f"{API}/auth/register-tenant", json={
        "business_name": f"ISOL-Test-{suffix}",
        "email": f"isol_admin_{suffix}@jrpos.co",
        "password": "isol1234",
        "name": "ISOL Admin",
    })
    assert r.status_code == 200, r.text
    # Session should now carry tenant B cookies; verify identity resolved
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200, me.text
    return s


def _create_product(s, name):
    r = s.post(f"{API}/products", json={
        "name": name, "price": 1000, "cost": 500,
        "stock": 10, "tax_rate": 19, "unit": "und",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _create_sale(s, prod):
    r = s.post(f"{API}/sales", json={
        "items": [{
            "product_id": prod["id"], "name": prod["name"],
            "qty": 1, "price": prod["price"], "tax_rate": 19,
            "subtotal": prod["price"],
        }],
        "payment_method": "efectivo",
    })
    assert r.status_code == 200, r.text
    return r.json()


class TestElectronicInvoiceIsolation:
    def test_other_tenant_cannot_fetch_sale_invoice(self, tenant_a, tenant_b):
        """Tenant B must get 404 (not 200, not 500) for tenant A's sale."""
        prod = _create_product(tenant_a, "TEST_ISOL_prod")
        sale = _create_sale(tenant_a, prod)

        r = tenant_b.get(f"{API}/electronic/invoice/{sale['id']}")
        assert r.status_code == 404, (
            f"Cross-tenant leak: expected 404, got {r.status_code}: {r.text[:200]}"
        )

    def test_owner_can_fetch_own_sale_invoice(self, tenant_a):
        """Sanity: the owning tenant still gets 200."""
        prod = _create_product(tenant_a, "TEST_ISOL_own_prod")
        sale = _create_sale(tenant_a, prod)

        r = tenant_a.get(f"{API}/electronic/invoice/{sale['id']}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("cufe")
        assert body.get("status") == "simulada"
