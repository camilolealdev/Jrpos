import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool


class Base(DeclarativeBase):
    pass


def _database_url() -> str:
    url = os.environ["DATABASE_URL"]
    # SQLAlchemy async needs the asyncpg dialect explicitly.
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# DATABASE_URL must be Supabase's pooled (Supavisor, transaction-mode) string
# — host "aws-0-<region>.pooler.supabase.com", port 6543, user
# "postgres.<project_ref>" — not the direct "db.<ref>.supabase.co:5432" one
# (that's reserved for Alembic, see migrations/env.py). Stacking SQLAlchemy's
# own pool on top of a serverless function (which only lives for one request)
# is both wasteful and unsafe, so pooling is disabled here and delegated
# entirely to Supavisor. Prepared-statement caching is disabled for the same
# reason: transaction-mode pooling can hand a connection to a different
# client between statements, so a cached server-side prepared statement can
# silently go stale.
engine = create_async_engine(
    _database_url(),
    poolclass=NullPool,
    connect_args={"statement_cache_size": 0},
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session():
    async with SessionLocal() as session:
        yield session
