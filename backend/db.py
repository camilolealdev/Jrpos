import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool


class Base(DeclarativeBase):
    pass


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./jrpos.db").strip()
    if not url:
        url = "sqlite+aiosqlite:///./jrpos.db"
    # SQLAlchemy async needs the asyncpg dialect explicitly for PostgreSQL.
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


_db_url = _database_url()
_is_sqlite = _db_url.startswith("sqlite")

if _is_sqlite:
    engine = create_async_engine(
        _db_url,
        connect_args={"check_same_thread": False},
    )
else:
    use_nullpool = os.environ.get("DB_USE_NULLPOOL", "false").lower() in ("true", "1", "yes")
    if use_nullpool:
        # Modo para Supabase Supavisor transaction-mode si se especifica
        engine = create_async_engine(
            _db_url,
            poolclass=NullPool,
            connect_args={"statement_cache_size": 0},
        )
    else:
        # Connection Pool de alto rendimiento para PostgreSQL dedicado/Docker
        pool_size = int(os.environ.get("DB_POOL_SIZE", "15"))
        max_overflow = int(os.environ.get("DB_MAX_OVERFLOW", "20"))
        pool_recycle = int(os.environ.get("DB_POOL_RECYCLE", "1800"))
        statement_cache = int(os.environ.get("DB_STATEMENT_CACHE_SIZE", "100"))
        engine = create_async_engine(
            _db_url,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_recycle=pool_recycle,
            pool_pre_ping=True,
            connect_args={"statement_cache_size": statement_cache},
        )

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session():
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            # Esterilización de contexto RLS al finalizar el request:
            # Previene cualquier fuga de contexto de tenant cuando la conexión se reutiliza en el pool.
            if not _is_sqlite:
                try:
                    await session.execute(
                        text(
                            "SELECT set_config('app.current_tenant_id', '', false), "
                            "set_config('app.is_superadmin', 'false', false)"
                        )
                    )
                except Exception:
                    pass

