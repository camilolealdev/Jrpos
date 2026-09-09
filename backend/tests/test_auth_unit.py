import os
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock, patch

import anyio
import pytest
from fastapi import Response

# Asegurar que backend está en el path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from auth import (
    _is_production_env,
    _to_utc,
    _cookie_flags,
    get_jwt_secret,
    verify_password,
    create_access_token,
    logout,
    _provision_tenant,
)
from models_sql import SettingsGeneral, Tenant, User


def test_is_production_env():
    with patch.dict(os.environ, {}, clear=True):
        assert _is_production_env() is False

    with patch.dict(os.environ, {"ENV": "production"}):
        assert _is_production_env() is True

    with patch.dict(os.environ, {"RAILWAY_ENVIRONMENT": "production"}):
        assert _is_production_env() is True

    with patch.dict(os.environ, {"VERCEL": "1"}):
        assert _is_production_env() is True


def test_get_jwt_secret():
    with patch.dict(os.environ, {}, clear=True):
        assert get_jwt_secret() == "jrpos-dev-secret-key-change-in-production-min-32-chars-ok"

    with patch.dict(os.environ, {"ENV": "production"}, clear=True):
        with pytest.raises(RuntimeError, match="FATAL: JWT_SECRET"):
            get_jwt_secret()

    with patch.dict(os.environ, {"JWT_SECRET": "my-custom-super-secret-key-12345"}):
        assert get_jwt_secret() == "my-custom-super-secret-key-12345"


def test_to_utc_normalization():
    assert _to_utc(None) is None

    # Naive datetime
    naive_dt = datetime(2026, 9, 9, 12, 0, 0)
    utc_dt = _to_utc(naive_dt)
    assert utc_dt.tzinfo == timezone.utc

    # Already aware datetime
    aware_dt = datetime(2026, 9, 9, 12, 0, 0, tzinfo=timezone.utc)
    res = _to_utc(aware_dt)
    assert res == aware_dt
    assert res.tzinfo == timezone.utc


def test_verify_password_resilience():
    from auth import hash_password
    hashed = hash_password("secret123")
    assert verify_password("secret123", hashed) is True
    assert verify_password("wrong", hashed) is False

    # Hashes inválidos o corruptos no deben lanzar 500
    assert verify_password("secret123", "invalid_hash_string") is False
    assert verify_password("secret123", "") is False


def test_create_access_token_superadmin_vs_tenant():
    import jwt
    from auth import JWT_ALGORITHM

    # Superadmin sin tenant_id debe conservar None en el token
    token_super = create_access_token("admin-1", "super@jrpos.co", "superadmin_platform", None)
    decoded_super = jwt.decode(token_super, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    assert decoded_super["tenant_id"] is None
    assert decoded_super["role"] == "superadmin_platform"

    # Usuario con tenant_id
    token_user = create_access_token("user-1", "cajero@jrpos.co", "cajero", "tenant-abc-123")
    decoded_user = jwt.decode(token_user, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    assert decoded_user["tenant_id"] == "tenant-abc-123"

    # Usuario sin tenant_id explícito toma tenant por defecto
    token_default = create_access_token("user-2", "cajero@jrpos.co", "cajero", None)
    decoded_default = jwt.decode(token_default, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    assert decoded_default["tenant_id"] == "tenant-default-001"


def test_logout_deletes_cookies_with_flags():
    async def _test():
        response = MagicMock(spec=Response)
        with patch("auth._cookie_flags", return_value=(True, "none")):
            await logout(response)
            
            calls = response.delete_cookie.call_args_list
            assert len(calls) == 2
            
            # access_token
            args0, kwargs0 = calls[0]
            assert args0[0] == "access_token"
            assert kwargs0["secure"] is True
            assert kwargs0["samesite"] == "none"
            assert kwargs0["httponly"] is True
            assert kwargs0["path"] == "/"
            
            # refresh_token
            args1, kwargs1 = calls[1]
            assert args1[0] == "refresh_token"
            assert kwargs1["secure"] is True
            assert kwargs1["samesite"] == "none"
            assert kwargs1["httponly"] is True
            assert kwargs1["path"] == "/"
            
    anyio.run(_test)


def test_provision_tenant_includes_settings_general():
    async def _test():
        mock_session = MagicMock()
        mock_execute_res = MagicMock()
        mock_execute_res.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_execute_res)
        mock_session.commit = AsyncMock()
        
        added_objects = []
        mock_session.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))
        
        with patch("auth._set_tenant_context", new_callable=AsyncMock):
            user, tenant = await _provision_tenant(
                mock_session,
                business_name="Drogueria La Salud",
                email="contacto@lasalud.com",
                name="Farmaceutico Jefe",
                phone="3009876543",
                business_type="drogueria",
                password_hash="fakehash",
            )
            
            # Verificar que SettingsGeneral se haya creado y añadido
            settings_added = [obj for obj in added_objects if isinstance(obj, SettingsGeneral)]
            assert len(settings_added) == 1
            sg = settings_added[0]
            assert sg.store_name == "Drogueria La Salud"
            assert sg.business_type == "drogueria"
            assert sg.support_phone == "3009876543"
            assert sg.iva_default == 19
            assert sg.printer_width == 58
            assert sg.accent == "emerald"
            assert sg.tenant_id == tenant.id
            
    anyio.run(_test)


def test_lockout_resets_after_window_expired():
    from datetime import timedelta
    from auth import LoginRequest, login, utcnow
    from models_sql import LoginAttempt, User

    async def _test():
        mock_session = MagicMock()
        mock_request = MagicMock()
        mock_request.headers.get.return_value = "127.0.0.1"
        mock_request.client.host = "127.0.0.1"
        mock_response = MagicMock()

        # Intento previo con count=2 pero ya expirado
        expired_attempt = LoginAttempt(
            identifier="test@jrpos.co",
            count=2,
            locked_until=utcnow() - timedelta(minutes=5),
        )
        mock_session.get = AsyncMock(return_value=expired_attempt)

        # Simular usuario existente con password correcto
        from auth import hash_password
        mock_user = User(
            id="u-1",
            email="test@jrpos.co",
            name="Test User",
            password_hash=hash_password("correctpass"),
            role="admin",
            tenant_id="tenant-1",
        )
        mock_exec_res = MagicMock()
        mock_exec_res.scalar_one_or_none.return_value = mock_user
        mock_session.execute = AsyncMock(return_value=mock_exec_res)
        mock_session.delete = AsyncMock()
        mock_session.commit = AsyncMock()

        with patch("redis_client.rate_limit", new_callable=AsyncMock, return_value=True), \
             patch("auth._tenant_info_for", new_callable=AsyncMock, return_value={"name": "Tienda"}):
            res = await login(
                LoginRequest(email="test@jrpos.co", password="correctpass"),
                mock_request,
                mock_response,
                mock_session,
            )
            assert res["email"] == "test@jrpos.co"
            # El intento expirado debió borrarse tras login exitoso
            mock_session.delete.assert_called_once_with(expired_attempt)

    anyio.run(_test)


def test_refresh_from_payload_and_header():
    from auth import RefreshRequest, create_refresh_token, refresh
    from models_sql import User

    async def _test():
        token = create_refresh_token("u-99")

        mock_session = MagicMock()
        mock_user = User(id="u-99", email="refresh@jrpos.co", name="Refresher", role="admin", tenant_id="tenant-99")
        mock_exec_res = MagicMock()
        mock_exec_res.scalar_one_or_none.return_value = mock_user
        mock_session.execute = AsyncMock(return_value=mock_exec_res)

        # 1. Vía payload JSON (sin cookie)
        mock_req_no_cookie = MagicMock()
        mock_req_no_cookie.cookies.get.return_value = None
        mock_req_no_cookie.headers.get.return_value = ""
        mock_resp = MagicMock()

        res = await refresh(mock_req_no_cookie, mock_resp, RefreshRequest(refresh_token=token), mock_session)
        assert res == {"ok": True}
        assert mock_resp.set_cookie.called

        # 2. Vía Authorization Header: Bearer <refresh_token>
        mock_resp.reset_mock()
        mock_req_header = MagicMock()
        mock_req_header.cookies.get.return_value = None
        mock_req_header.headers.get.return_value = f"Bearer {token}"

        res2 = await refresh(mock_req_header, mock_resp, None, mock_session)
        assert res2 == {"ok": True}
        assert mock_resp.set_cookie.called

    anyio.run(_test)


def test_seed_admin_creates_branch_and_settings():
    from auth import seed_admin
    from models_sql import Branch, SettingsGeneral, Tenant, User

    async def _test():
        mock_session = MagicMock()
        
        # Simular que no existe tenant ni admin ni superadmin
        mock_session.get = AsyncMock(return_value=None)
        mock_exec_res = MagicMock()
        mock_exec_res.scalar_one_or_none.return_value = None
        
        scalars_mock = MagicMock()
        scalars_mock.first.return_value = None
        mock_exec_res.scalars.return_value = scalars_mock
        
        mock_session.execute = AsyncMock(return_value=mock_exec_res)
        mock_session.flush = AsyncMock()
        mock_session.commit = AsyncMock()

        added_objects = []
        mock_session.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        await seed_admin(mock_session)

        # Verificar que se sembraron Tenant, Branch, SettingsGeneral, SuperAdmin y Admin
        tenants = [o for o in added_objects if isinstance(o, Tenant)]
        branches = [o for o in added_objects if isinstance(o, Branch)]
        settings = [o for o in added_objects if isinstance(o, SettingsGeneral)]
        users = [o for o in added_objects if isinstance(o, User)]

        assert len(tenants) == 1
        assert tenants[0].id == "tenant-default-001"

        assert len(branches) == 1
        assert branches[0].tenant_id == "tenant-default-001"
        assert branches[0].name == "Sede Principal"

        assert len(settings) == 1
        assert settings[0].tenant_id == "tenant-default-001"
        assert settings[0].store_name == "Minimarket El Progreso"

        assert len(users) >= 2  # Superadmin y Admin

    anyio.run(_test)

