"""Emisor de eventos hacia n8n: forma del evento, mascaras de datos personales y tolerancia a fallos."""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import n8n_events  # noqa: E402


class _Resp:
    def __init__(self, status):
        self.status_code = status


def test_event_shape_matches_i05_contract():
    ev = n8n_events.build_event("cash.closed", "t-1", {"session_id": "s-1"})
    assert 8 <= len(ev["event_id"]) <= 64
    assert ev["type"] in n8n_events.EVENT_TYPES
    assert isinstance(ev["timestamp"], int)
    assert ev["tenant_id"] == "t-1" and ev["data"] == {"session_id": "s-1"}
    assert n8n_events.build_event("tenant.registered", "t-1")["event_id"] != ev["event_id"]


def test_unknown_event_type_is_rejected():
    with pytest.raises(ValueError):
        n8n_events.build_event("user.deleted", "t-1")


def test_scrub_masks_email_and_phone_and_truncates():
    txt = "Escribanme a juan.perez@correo.com o llamen al +57 300 123 4567, ticket 12345"
    out = n8n_events.scrub_text(txt, 600)
    assert "@" not in out and "300" not in out
    assert "[correo]" in out and "[telefono]" in out and "12345" in out
    assert len(n8n_events.scrub_text("a" * 1000, 600)) == 600
    assert n8n_events.scrub_text(None, 10) == ""


def test_not_configured_does_nothing(monkeypatch):
    monkeypatch.delenv("N8N_EVENTS_URL", raising=False)
    monkeypatch.delenv("N8N_EVENTS_TOKEN", raising=False)
    calls = []
    monkeypatch.setattr(n8n_events.requests, "post", lambda *a, **k: calls.append(1))

    class BT:
        def add_task(self, *a, **k):
            calls.append("queued")

    n8n_events.emit_event(BT(), "tenant.registered", "t-1")
    assert n8n_events.send_event(n8n_events.build_event("tenant.registered", "t-1")) is False
    assert calls == []


def test_send_posts_with_token_and_never_raises(monkeypatch):
    monkeypatch.setenv("N8N_EVENTS_URL", "https://n8n.example/webhook/jrpos/events")
    monkeypatch.setenv("N8N_EVENTS_TOKEN", "tok")
    seen = {}

    def ok(url, json=None, headers=None, timeout=None):
        seen.update(url=url, json=json, headers=headers, timeout=timeout)
        return _Resp(200)

    monkeypatch.setattr(n8n_events.requests, "post", ok)
    ev = n8n_events.build_event("ticket.created", "t-1", {"ticket_id": "x"})
    assert n8n_events.send_event(ev) is True
    assert seen["headers"] == {"X-JRPOS-Token": "tok"} and seen["json"] == ev and seen["timeout"] <= 5

    monkeypatch.setattr(n8n_events.requests, "post", lambda *a, **k: _Resp(500))
    assert n8n_events.send_event(ev) is False

    def boom(*a, **k):
        raise ConnectionError("caido")

    monkeypatch.setattr(n8n_events.requests, "post", boom)
    assert n8n_events.send_event(ev) is False  # no propaga
