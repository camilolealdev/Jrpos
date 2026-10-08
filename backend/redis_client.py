"""Redis opcional para cache — degrada a no-op si REDIS_URL no existe.

Seguro en Vercel (sin REDIS_URL = comportamiento actual) y en Docker
(docker-compose exporta REDIS_URL=redis://redis:6379/0).
"""

import json
import os
import time

_r = None

try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    aioredis = None


def _client():
    """Cliente lazy. None si sin REDIS_URL, sin lib, o si Redis caído."""
    global _r
    url = os.environ.get("REDIS_URL")
    if not url or aioredis is None:
        return None
    if _r is None:
        _r = aioredis.from_url(
            url, socket_connect_timeout=2, socket_timeout=2, decode_responses=True
        )
    return _r


async def get_json(key: str):
    """Valor JSON cacheado o None. Nunca lanza."""
    r = _client()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def set_json(key: str, value, ttl: int = 30) -> None:
    """Guarda JSON con TTL (segundos). Never-fail."""
    r = _client()
    if r is None:
        return
    try:
        await r.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:
        pass


def get_redis():
    """Cliente bruto o None (para invalidaciones puntuales)."""
    return _client()


async def delete_key(key: str) -> None:
    """Elimina una clave de cache. Never-fail."""
    r = _client()
    if r is None:
        return
    try:
        await r.delete(key)
    except Exception:
        pass


async def delete_pattern(pattern: str) -> None:
    """Elimina claves coincidentes con un patrón usando SCAN iterativo (sin bloquear Redis)."""
    r = _client()
    if r is None:
        return
    try:
        cursor = 0
        while True:
            cursor, keys = await r.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                await r.delete(*keys)
            if cursor == 0:
                break
    except Exception:
        pass


# Contadores en memoria del proceso: respaldo opcional de rate_limit cuando no hay
# Redis (o esta caido). Por proceso (no compartido entre workers): es un tope de
# costo "mejor que nada", no un limite exacto.
_local_counters: dict = {}


def _local_rate_limit(key: str, limit: int, window: int) -> bool:
    now = time.monotonic()
    count, expires = _local_counters.get(key, (0, 0.0))
    if now >= expires:
        count, expires = 0, now + window
    count += 1
    _local_counters[key] = (count, expires)
    if len(_local_counters) > 10000:
        for k in [k for k, (_, exp) in _local_counters.items() if exp <= now]:
            _local_counters.pop(k, None)
    return count <= limit


async def rate_limit(key: str, limit: int, window: int, local_fallback: bool = False) -> bool:
    """True = permitido. Sin Redis es no-op (True), salvo local_fallback=True, que
    usa un contador en memoria del proceso (para topes de costo). Never-fail."""
    r = _client()
    if r is None:
        return _local_rate_limit(key, limit, window) if local_fallback else True
    try:
        n = await r.incr(key)
        if n == 1:
            await r.expire(key, window)
        return n <= limit
    except Exception:
        return _local_rate_limit(key, limit, window) if local_fallback else True
