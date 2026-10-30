"""Tipo de negocio -> módulos visibles por defecto y roles de personal.
Pruebas unitarias puras (no requieren servidor)."""
import os
import re
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import anyio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import business_types as bt
from auth import _provision_tenant
from models_sql import SettingsGeneral

FRONTEND_TYPES_JS = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "lib", "businessTypes.js")
)


def _frontend_block(name: str) -> str:
    src = open(FRONTEND_TYPES_JS, encoding="utf-8").read()
    start = src.index(f"export const {name}")
    return src[start : src.index("];", start)]


def test_bar_and_restaurante_are_their_own_types():
    for t in ("licorera", "bar", "restaurante", "cafeteria"):
        assert t in bt.BUSINESS_TYPES


def test_every_type_has_a_preset_and_staff_roles():
    for t in bt.BUSINESS_TYPES:
        assert t in bt.HIDDEN_MODULES_BY_BUSINESS_TYPE, t
        assert t in bt.STAFF_ROLES_BY_BUSINESS_TYPE, t


def test_presets_only_hide_known_hideable_modules():
    known = set(bt.HIDEABLE_MODULE_TIDS)
    for t, hidden in bt.HIDDEN_MODULES_BY_BUSINESS_TYPE.items():
        assert set(hidden) <= known, (t, set(hidden) - known)


def test_frontend_catalog_matches_backend():
    fe_types = re.findall(r'id:\s*"([a-z_]+)"', _frontend_block("BUSINESS_TYPES"))
    assert fe_types == bt.BUSINESS_TYPES
    fe_tids = re.findall(r'tid:\s*"([a-z-]+)"', _frontend_block("HIDEABLE_MODULES"))
    assert set(fe_tids) == set(bt.HIDEABLE_MODULE_TIDS)


def test_licorera_bar_and_restaurante_keep_fiados():
    for t in ("licorera", "bar", "restaurante"):
        assert "nav-creditos" not in bt.HIDDEN_MODULES_BY_BUSINESS_TYPE[t], t


def test_bar_and_restaurante_start_with_core_plus_fiados_only():
    expected = set(bt.HIDEABLE_MODULE_TIDS) - {"nav-creditos"}
    for t in ("bar", "restaurante"):
        assert set(bt.HIDDEN_MODULES_BY_BUSINESS_TYPE[t]) == expected, t


def test_bar_and_restaurante_staff_is_admin_plus_cajero():
    for t in ("bar", "restaurante"):
        assert bt.STAFF_ROLES_BY_BUSINESS_TYPE[t] == ["cajero"], t


def test_provisioning_applies_the_preset_of_the_chosen_type():
    async def _test():
        mock_session = MagicMock()
        res = MagicMock()
        res.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=res)
        mock_session.commit = AsyncMock()
        added = []
        mock_session.add = MagicMock(side_effect=lambda obj: added.append(obj))

        with patch("auth._set_tenant_context", new_callable=AsyncMock):
            await _provision_tenant(
                mock_session,
                business_name="Bar La Esquina",
                email="dueno@laesquina.com",
                name="Dueño",
                phone="3001112233",
                business_type="bar",
                password_hash="fakehash",
            )

        sg = [o for o in added if isinstance(o, SettingsGeneral)][0]
        assert sg.business_type == "bar"
        assert sg.hidden_module_tids == bt.HIDDEN_MODULES_BY_BUSINESS_TYPE["bar"]
        assert "nav-creditos" not in sg.hidden_module_tids

    anyio.run(_test)
