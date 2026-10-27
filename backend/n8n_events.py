"""Emisor de eventos hacia n8n (I05 `jrpos/events`).

Best-effort: sin N8N_EVENTS_URL y N8N_EVENTS_TOKEN no hace nada, y cualquier error
de red se registra y se descarta; un evento nunca puede romper un registro, un
ticket o un cierre de caja. Se ejecuta como tarea en segundo plano, despues del
commit. El contrato (n8n/contracts, flujo I05) exige: event_id unico de 8 a 64
caracteres, type conocido, tenant_id, timestamp en segundos (+-300 s) y `data` sin
nombres, correos ni telefonos.
"""
import logging
import os
import re
import time
import uuid
from typing import Optional

import requests
from fastapi import BackgroundTasks

logger = logging.getLogger("jrpos.n8n_events")

EVENT_TYPES = ("tenant.registered", "ticket.created", "cash.closed")

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"(?<!\w)\+?\d[\d\s().-]{6,}\d(?!\w)")


def scrub_text(text: Optional[str], limit: int) -> str:
    """Enmascara correos y telefonos evidentes y trunca. Texto que sale a n8n y a un modelo de IA."""
    out = _EMAIL.sub("[correo]", text or "")
    out = _PHONE.sub("[telefono]", out)
    return out.strip()[:limit]


def _config() -> tuple[str, str]:
    return os.environ.get("N8N_EVENTS_URL", "").strip(), os.environ.get("N8N_EVENTS_TOKEN", "").strip()


def build_event(event_type: str, tenant_id: str, data: Optional[dict] = None) -> dict:
    if event_type not in EVENT_TYPES:
        raise ValueError(f"tipo de evento no soportado: {event_type}")
    return {
        "event_id": uuid.uuid4().hex,
        "type": event_type,
        "tenant_id": tenant_id,
        "timestamp": int(time.time()),
        "data": data or {},
    }


def send_event(event: dict) -> bool:
    url, token = _config()
    if not url or not token:
        return False
    try:
        resp = requests.post(url, json=event, headers={"X-JRPOS-Token": token}, timeout=5)
        if resp.status_code >= 300:
            logger.warning("n8n rechazo el evento %s (%s): HTTP %s", event.get("type"), event.get("event_id"), resp.status_code)
            return False
        return True
    except Exception as exc:  # noqa: BLE001 - nunca propagar
        logger.warning("no se pudo enviar el evento %s a n8n: %s", event.get("type"), exc.__class__.__name__)
        return False


def emit_event(background_tasks: BackgroundTasks, event_type: str, tenant_id: str, data: Optional[dict] = None) -> None:
    """Encola el envio. Llamar despues del commit; no hace nada si n8n no esta configurado."""
    url, token = _config()
    if not url or not token:
        return
    background_tasks.add_task(send_event, build_event(event_type, tenant_id, data))
