"""Fase 0: la DIAN simulada nunca se reporta como aceptada y el límite de OCR de
plataforma no falla abierto. Pruebas unitarias puras (no requieren servidor)."""
import os
import sys
from unittest.mock import MagicMock, patch

import anyio
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import redis_client
from dian_client import DianClient, dian_mode


def test_dian_mode_defaults_to_sandbox():
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("DIAN_MODE", None)
        assert dian_mode() == "sandbox"


def test_dian_stub_never_reports_accepted():
    client = DianClient(nit="900000001")
    res = anyio.run(client.send_invoice_sync, "eHg=")
    assert res["status"] == "SIMULATED"
    assert res["status"] != "ACCEPTED"


def test_dian_real_mode_refuses_without_a_provider():
    with patch.dict(os.environ, {"DIAN_MODE": "real"}):
        with pytest.raises(NotImplementedError):
            anyio.run(DianClient(nit="900000001").send_invoice_sync, "eHg=")


def test_rate_limit_fails_open_by_default_without_redis():
    with patch.object(redis_client, "_client", return_value=None):
        assert anyio.run(redis_client.rate_limit, "k", 1, 60) is True


def test_rate_limit_fail_closed_without_redis():
    async def call():
        return await redis_client.rate_limit("k", 1, 60, fail_open=False)

    with patch.object(redis_client, "_client", return_value=None):
        assert anyio.run(call) is False


def test_rate_limit_fail_closed_when_redis_errors():
    class Broken:
        async def incr(self, key):
            raise ConnectionError("redis down")

    async def call(fail_open):
        return await redis_client.rate_limit("k", 1, 60, fail_open=fail_open)

    with patch.object(redis_client, "_client", return_value=Broken()):
        assert anyio.run(call, True) is True
        assert anyio.run(call, False) is False


def test_rate_limit_still_counts_with_redis():
    class Fake:
        def __init__(self):
            self.n = 0

        async def incr(self, key):
            self.n += 1
            return self.n

        async def expire(self, key, window):
            return True

    async def call(fake):
        return await redis_client.rate_limit("k", 2, 60, fail_open=False)

    fake = Fake()
    with patch.object(redis_client, "_client", return_value=fake):
        assert [anyio.run(call, fake) for _ in range(3)] == [True, True, False]
