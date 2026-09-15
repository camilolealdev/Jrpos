import pytest
import json
from unittest.mock import AsyncMock, patch
from routers.invoices import _extract_json, InvoiceOCR, InvoiceItemOCR


def test_extract_json_clean():
    sample = '{"supplier_name": "DISTRIBUIDORA ANDINA", "items": [{"name": "Arroz 1kg", "quantity": 10, "unit_price": 3500}]}'
    res = _extract_json(sample)
    assert res.get("supplier_name") == "DISTRIBUIDORA ANDINA"
    assert len(res.get("items")) == 1
    assert res["items"][0]["quantity"] == 10


def test_extract_json_with_code_blocks_and_markdown():
    sample = """Aquí está el resultado:
```json
{
  "supplier_name": "CARNES SAS",
  "supplier_nit": "900123456",
  "invoice_number": "FE-102",
  "total": 150000,
  "items": [
    {"name": "Lomo fino", "quantity": 5, "unit_price": 30000, "total": 150000}
  ]
}
```
Espero sea de ayuda.
"""
    res = _extract_json(sample)
    assert res.get("supplier_name") == "CARNES SAS"
    assert res.get("supplier_nit") == "900123456"
    assert res.get("total") == 150000
    assert len(res.get("items")) == 1


def test_extract_json_empty_or_invalid():
    assert _extract_json("") == {}
    assert _extract_json("texto sin ningún json") == {}
