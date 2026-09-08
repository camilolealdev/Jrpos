"""Redis opcional para cache — degrada a no-op si REDIS_URL no existe.

Seguro en Vercel (sin REDIS_URL = comportamiento actual) y en Docker
(docker-compose exporta REDIS_URL=redis://redis:6379/0).
"""

import json
import os

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


async def rate_limit(key: str, limit: int, window: int) -> bool:
    """True = permitido. No-op (True) sin Redis. Never-fail."""
    r = _client()
    if r is None:
        return True
    try:
        n = await r.incr(key)
        if n == 1:
            await r.expire(key, window)
        return n <= limit
    except Exception:
        return True
