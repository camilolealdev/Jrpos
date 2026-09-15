"""
Pruebas unitarias (sin servidor) para el nuevo campo custom_payment_methods
de GeneralSettingsIn. No requieren stack levantado -- ver tests/README.md
para la distincion con la suite de integracion black-box.
"""
from routers.settings import GeneralSettingsIn, _default_custom_payment_methods


def test_default_payment_methods_are_the_historic_six():
    defaults = _default_custom_payment_methods()
    ids = [m["id"] for m in defaults]
    # Estos ids ya existen en ventas historicas (Sale.payment_method) y NUNCA
    # deben renombrarse; el orden importa porque define sort_order.
    assert ids == ["efectivo", "nequi", "daviplata", "tarjeta", "transferencia", "credito"]
    assert all(m["active"] is True for m in defaults)
    assert [m["sort_order"] for m in defaults] == list(range(6))


def test_general_settings_defaults_include_payment_methods():
    dumped = GeneralSettingsIn().model_dump()
    assert "custom_payment_methods" in dumped
    assert dumped["custom_payment_methods"] == _default_custom_payment_methods()


def test_general_settings_accepts_custom_payment_methods_override():
    custom = [
        {"id": "efectivo", "label": "Efectivo", "active": True, "sort_order": 0},
        {"id": "bancolombia_a_la_mano", "label": "Bancolombia a la Mano", "active": True, "sort_order": 1},
        {"id": "credito", "label": "Fiado", "active": False, "sort_order": 2},
    ]
    payload = GeneralSettingsIn(custom_payment_methods=custom)
    assert payload.model_dump()["custom_payment_methods"] == custom


def test_general_settings_empty_list_is_explicit_not_default():
    # Un tenant puede enviar [] explicitamente (ej. desactivar todos); el
    # fallback a los 6 predeterminados en ese caso es responsabilidad del
    # frontend (POS.jsx), no de este modelo -- ver instrucciones de la tarea.
    payload = GeneralSettingsIn(custom_payment_methods=[])
    assert payload.model_dump()["custom_payment_methods"] == []
