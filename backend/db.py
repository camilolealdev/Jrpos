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
    import datetime
    import sqlite3
    from sqlalchemy import event

    def _init_sqlite_sequences():
        seqs = {}
        try:
            db_path = _db_url.split("///")[-1]
            if not os.path.isabs(db_path):
                db_path = os.path.join(os.path.dirname(__file__), db_path)
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            for table, seq_name in [
                ("sales", "sales_number_seq"),
                ("documents", "documents_number_seq"),
                ("credit_notes", "credit_notes_number_seq"),
                ("payroll", "payroll_number_seq"),
                ("support_docs", "support_docs_number_seq"),
                ("warranties", "warranties_number_seq"),
                ("purchase_orders", "purchase_orders_number_seq"),
            ]:
                try:
                    cur.execute(f"SELECT number FROM {table}")
                    max_val = 0
                    for row in cur.fetchall():
                        if row[0] and "-" in row[0]:
                            try:
                                num = int(row[0].split("-")[-1])
                                if num > max_val:
                                    max_val = num
                            except Exception:
                                pass
                    seqs[seq_name] = max_val
                except Exception:
                    seqs[seq_name] = 0
            conn.close()
        except Exception:
            pass
        return seqs

    _sqlite_sequences = _init_sqlite_sequences()

    engine = create_async_engine(
        _db_url,
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _add_sqlite_functions(dbapi_connection, connection_record):
        def _date_trunc(unit, val):
            if not val:
                return None
            s = str(val)
            if unit == "day":
                return s[:10]
            elif unit == "month":
                return s[:7]
            elif unit == "year":
                return s[:4]
            return s[:10]

        def _nextval(seq_name):
            if seq_name not in _sqlite_sequences:
                _sqlite_sequences[seq_name] = int(datetime.datetime.now().timestamp()) % 100000
            val = _sqlite_sequences[seq_name] + 1
            _sqlite_sequences[seq_name] = val
            return val

        def _now():
            return datetime.datetime.now().isoformat()

        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()
            dbapi_connection.create_function("date_trunc", 2, _date_trunc)
            dbapi_connection.create_function("nextval", 1, _nextval)
            dbapi_connection.create_function("now", 0, _now)
        except Exception:
            pass
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

