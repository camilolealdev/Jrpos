"""Observabilidad Capa 7 — logs estructurados JSON con contexto de tenant.

Compone automaticamente {"request_id", "tenant_id", "user_id"} en cada linea
de log sin tocar el codigo de negocio. Equivalente stdlib-only del patron
OpenTelemetry descrito en docs/ANALISIS_ARQUITECTURA_7_CAPAS.md.

Uso:
    from observability import logger  # en cualquier modulo
    logger.warning("Stock bajo para producto %s", sku)  # -> JSON con contexto
"""

import json
import logging
import re
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from uuid import uuid4

# ---------------- Contexto por request (thread-local / task-local) ----------------

request_id_ctx: ContextVar = ContextVar("request_id", default=None)
tenant_id_ctx: ContextVar = ContextVar("tenant_id", default=None)
user_id_ctx: ContextVar = ContextVar("user_id", default=None)

_REQUEST_ID_RE = re.compile(r"[^A-Za-z0-9\-_.]")

logger = logging.getLogger("jrpos")


def get_request_id() -> str:
    return request_id_ctx.get() or "-"


def _ctx_fields() -> dict:
    fields = {}
    rid = request_id_ctx.get()
    tid = tenant_id_ctx.get()
    uid = user_id_ctx.get()
    if rid:
        fields["request_id"] = rid
    if tid:
        fields["tenant_id"] = tid
    if uid:
        fields["user_id"] = uid
    return fields


# ---------------- Formatter JSON ----------------

class JsonFormatter(logging.Formatter):
    """Formatea records como una linea JSON por log (ready para Loki/ELK/OTel)."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        payload.update(_ctx_fields())
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack_info"] = record.stack_info
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    """Instala el formatter JSON en el root logger (idempotente)."""
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(level)


# ---------------- Middleware ASGI puro (inyecta request_id) ----------------

class RequestContextMiddleware:
    """ASGI puro: asigna request_id (o respeta X-Request-ID entrante) y lo
    expone en el header de respuesta. Los contextvars propagan hacia abajo
    porque el app call corre dentro del mismo contexto de este middleware."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        rid = None
        for key, value in scope.get("headers") or []:
            if key == b"x-request-id":
                rid = _REQUEST_ID_RE.sub("", value.decode("latin-1", "ignore"))[:64] or None
                break
        rid = rid or uuid4().hex
        token = request_id_ctx.set(rid)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append((b"x-request-id", rid.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_ctx.reset(token)
