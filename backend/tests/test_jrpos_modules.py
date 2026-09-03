"""Backend tests for JRPOS new modules: promotions, sales docs, credit notes,
warranties, purchase orders, support docs, payroll, RADIAN, certificate, commissions, services."""
import os
import io
import time
import pytest
import requests

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return os.environ.get("REACT_APP_BACKEND_URL", "")


BASE_URL = _load_frontend_env().rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@jrpos.com", "password": "jrpos2026"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# ---------------- Promotions ----------------
class TestPromotions:
    def test_create_activate_deactivate_delete(self, admin_session):
        r = admin_session.post(f"{API}/promotions", json={
            "name": "TEST_Promo Granos 10%", "type": "percent_category",
            "value": 10, "category": "Granos", "active": True,
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["value"] == 10
        assert r.json()["category"] == "Granos"

        # active list contains it
        active = admin_session.get(f"{API}/promotions/active").json()
        assert any(p["id"] == pid for p in active)

        # deactivate
        r2 = admin_session.put(f"{API}/promotions/{pid}", json={"active": False})
        assert r2.status_code == 200
        assert r2.json()["active"] is False
        active2 = admin_session.get(f"{API}/promotions/active").json()
        assert not any(p["id"] == pid for p in active2)

        # delete
        r3 = admin_session.delete(f"{API}/promotions/{pid}")
        assert r3.status_code == 200


# ---------------- Sales Docs: quotes/remissions ----------------
class TestSalesDocs:
    def test_create_and_convert_quote_to_sale(self, admin_session):
        payload = {
            "customer_name": "TEST Cliente Cot",
            "items": [
                {"product_id": "manual", "name": "Item A", "qty": 2, "price": 1000, "tax_rate": 19},
                {"product_id": "manual", "name": "Item B", "qty": 1, "price": 5000, "tax_rate": 19},
            ],
        }
        r = admin_session.post(f"{API}/docs/quotes", json=payload)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["number"].startswith("COT-")
        assert q["total"] == 7000
        assert q["status"] == "borrador"
        qid = q["id"]

        conv = admin_session.post(f"{API}/docs/quotes/{qid}/convert")
        assert conv.status_code == 200, conv.text
        sale = conv.json()
        assert sale["number"].startswith("POS-")
        assert sale["total"] == 7000

        # doc status flipped
        docs = admin_session.get(f"{API}/docs/quotes").json()
        found = next(d for d in docs if d["id"] == qid)
        assert found["status"] == "convertida"

        # cannot convert twice
        again = admin_session.post(f"{API}/docs/quotes/{qid}/convert")
        assert again.status_code == 400

    def test_remission_status_change_and_convert(self, admin_session):
        r = admin_session.post(f"{API}/docs/remissions", json={
            "customer_name": "TEST Cliente Rem",
            "items": [{"product_id": "manual", "name": "X", "qty": 3, "price": 2000, "tax_rate": 19}],
        })
        assert r.status_code == 200
        rid = r.json()["id"]
        assert r.json()["number"].startswith("REM-")

        upd = admin_session.put(f"{API}/docs/remissions/{rid}", json={"status": "entregada"})
        assert upd.status_code == 200
        assert upd.json()["status"] == "entregada"

        conv = admin_session.post(f"{API}/docs/remissions/{rid}/convert")
        assert conv.status_code == 200
        assert conv.json()["number"].startswith("POS-")

    def test_collection_account_cannot_be_converted(self, admin_session):
        r = admin_session.post(f"{API}/docs/collection_accounts", json={
            "customer_name": "TEST", "concept": "servicios", "amount": 50000, "items": [],
        })
        assert r.status_code == 200
        cid = r.json()["id"]
        assert r.json()["number"].startswith("CC-")
        assert r.json()["total"] == 50000
        bad = admin_session.post(f"{API}/docs/collection_accounts/{cid}/convert")
        assert bad.status_code == 400


# ---------------- Credit Notes ----------------
class TestCreditNotes:
    def _create_product(self, s, stock=10):
        r = s.post(f"{API}/products", json={
            "name": "TEST_CN_Product", "price": 1000, "cost": 500,
            "stock": stock, "tax_rate": 19, "unit": "und",
        })
        assert r.status_code == 200
        return r.json()

    def test_create_credit_note_restocks(self, admin_session):
        prod = self._create_product(admin_session, stock=10)
        # sell 3 (contado)
        sale_payload = {
            "items": [{"product_id": prod["id"], "name": prod["name"], "qty": 3, "price": prod["price"], "tax_rate": 19, "subtotal": 3000}],
            "payment_method": "efectivo",
        }
        sr = admin_session.post(f"{API}/sales", json=sale_payload)
        assert sr.status_code == 200, sr.text
        sale = sr.json()
        # stock should be 7
        after_sale = admin_session.get(f"{API}/products/{prod['id']}").json()
        assert after_sale["stock"] == 7

        # NC
        nc = admin_session.post(f"{API}/credit-notes", json={
            "sale_id": sale["id"], "type": "credito", "concept": "devolucion",
        })
        assert nc.status_code == 200, nc.text
        note = nc.json()
        assert note["number"].startswith("NC-")
        assert note["cufe"] and len(note["cufe"]) == 64
        # stock restocked to 10
        after_nc = admin_session.get(f"{API}/products/{prod['id']}").json()
        assert after_nc["stock"] == 10

        # cleanup
        admin_session.delete(f"{API}/products/{prod['id']}")

    def test_credit_note_on_credit_sale_reduces_balance(self, admin_session):
        # Need customer for credit
        cust = admin_session.post(f"{API}/contacts", json={
            "name": "TEST_Fiado_Client", "kind": "customer", "phone": "3000000000"
        }).json()
        prod = self._create_product(admin_session, stock=10)
        sale_payload = {
            "items": [{"product_id": prod["id"], "name": prod["name"], "qty": 2, "price": 1000, "tax_rate": 19, "subtotal": 2000}],
            "payment_method": "credito",
            "customer_id": cust["id"], "customer_name": cust["name"],
        }
        sr = admin_session.post(f"{API}/sales", json=sale_payload)
        assert sr.status_code == 200, sr.text
        sale = sr.json()
        assert sale["is_credit"] is True
        assert sale["balance_due"] == 2000

        nc = admin_session.post(f"{API}/credit-notes", json={
            "sale_id": sale["id"], "type": "credito", "amount": 1000,
        })
        assert nc.status_code == 200
        # verify balance reduced
        sale_after = admin_session.get(f"{API}/sales/{sale['id']}").json()
        assert sale_after["balance_due"] == 1000
        assert sale_after["credit_status"] == "partial"

        # cleanup
        admin_session.delete(f"{API}/products/{prod['id']}")
        admin_session.delete(f"{API}/contacts/{cust['id']}")


# ---------------- Warranties ----------------
class TestWarranties:
    def test_create_and_resolve(self, admin_session):
        r = admin_session.post(f"{API}/warranties", json={
            "sale_number": "POS-000001", "product_name": "TEST_Prod_Gar",
            "reason": "no enciende", "resolution": "cambio",
        })
        assert r.status_code == 200
        wid = r.json()["id"]
        assert r.json()["number"].startswith("GAR-")
        assert r.json()["status"] == "abierta"

        upd = admin_session.put(f"{API}/warranties/{wid}", json={"status": "resuelta", "resolution": "reembolso"})
        assert upd.status_code == 200
        assert upd.json()["status"] == "resuelta"


# ---------------- Purchase Orders ----------------
class TestPurchaseOrders:
    def test_create_receive_updates_stock(self, admin_session):
        # existing product to be restocked
        prod = admin_session.post(f"{API}/products", json={
            "name": "TEST_OC_Prod", "price": 1000, "cost": 500, "stock": 2, "tax_rate": 19, "unit": "und",
        }).json()
        r = admin_session.post(f"{API}/purchase-orders", json={
            "supplier_name": "TEST Prov",
            "items": [{"name": prod["name"], "qty": 5, "cost": 400}],
        })
        assert r.status_code == 200, r.text
        oc = r.json()
        assert oc["number"].startswith("OC-")
        assert oc["status"] == "enviada"

        rc = admin_session.post(f"{API}/purchase-orders/{oc['id']}/receive")
        assert rc.status_code == 200, rc.text
        # stock 2 + 5 = 7
        after = admin_session.get(f"{API}/products/{prod['id']}").json()
        assert after["stock"] == 7

        # cannot receive again
        bad = admin_session.post(f"{API}/purchase-orders/{oc['id']}/receive")
        assert bad.status_code == 400

        admin_session.delete(f"{API}/products/{prod['id']}")


# ---------------- Support Docs / Payroll / RADIAN / Certificate ----------------
class TestDianExtras:
    def test_support_doc_generates_cude(self, admin_session):
        r = admin_session.post(f"{API}/support-docs", json={
            "supplier_name": "TEST Proveedor", "supplier_doc": "123",
            "items": [{"name": "servicio X", "qty": 1, "price": 20000}],
        })
        assert r.status_code == 200
        d = r.json()
        assert d["number"].startswith("DS-")
        assert d["cude"] and len(d["cude"]) == 64
        assert d["total"] == 20000

    def test_payroll_auto_8_percent_deduction(self, admin_session):
        r = admin_session.post(f"{API}/payroll", json={
            "employee_name": "TEST_Empleado", "period": "2026-01",
            "salary": 1300000, "bonuses": 0,
        })
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["number"].startswith("NOM-")
        assert p["deductions"] == round(1300000 * 0.08, 2)
        assert p["net"] == round(1300000 - p["deductions"], 2)

    def test_radian_returns_list(self, admin_session):
        r = admin_session.get(f"{API}/radian/invoices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_certificate_upload_metadata(self, admin_session):
        r = admin_session.post(f"{API}/electronic/certificate", json={
            "filename": "test.p12", "size": 4096, "expires": "2027-01-01"
        })
        assert r.status_code == 200
        assert r.json()["filename"] == "test.p12"
        g = admin_session.get(f"{API}/electronic/certificate")
        assert g.status_code == 200
        assert g.json().get("filename") == "test.p12"


# ---------------- Commissions ----------------
class TestCommissions:
    def test_rule_and_report(self, admin_session):
        r = admin_session.post(f"{API}/commissions/rules", json={
            "user_name": "Administrador", "percent": 2,
        })
        assert r.status_code == 200
        rid = r.json()["id"]
        rep = admin_session.get(f"{API}/commissions/report").json()
        entry = next((e for e in rep if e["user_name"] == "Administrador"), None)
        assert entry is not None
        assert entry["percent"] == 2
        assert entry["commission"] == round(entry["sales_total"] * 2 / 100, 2)
        admin_session.delete(f"{API}/commissions/rules/{rid}")


# ---------------- Services (is_service does not decrement stock) ----------------
class TestServices:
    def test_service_product_no_stock_decrement(self, admin_session):
        prod = admin_session.post(f"{API}/products", json={
            "name": "TEST_Servicio_X", "price": 5000, "cost": 0, "stock": 100,
            "tax_rate": 19, "unit": "und", "is_service": True,
        }).json()
        assert prod.get("is_service") is True
        sr = admin_session.post(f"{API}/sales", json={
            "items": [{"product_id": prod["id"], "name": prod["name"], "qty": 3, "price": 5000, "tax_rate": 19, "subtotal": 15000}],
            "payment_method": "efectivo",
        })
        assert sr.status_code == 200
        after = admin_session.get(f"{API}/products/{prod['id']}").json()
        assert after["stock"] == 100  # unchanged
        admin_session.delete(f"{API}/products/{prod['id']}")
