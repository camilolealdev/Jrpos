import os

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
    # DATABASE_URL must be Supabase's pooled (Supavisor, transaction-mode) string
    engine = create_async_engine(
        _db_url,
        poolclass=NullPool,
        connect_args={"statement_cache_size": 0},
    )

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session():
    async with SessionLocal() as session:
        yield session
