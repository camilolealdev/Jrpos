#!/bin/sh
set -e

# The foundational tables (users, products, ...) are created by the two
# original Alembic revisions; everything added since then is handled by
# db_migrations.py's idempotent ALTER-based runner at app startup. Both
# are needed on a fresh database — Alembic bootstraps the schema, then
# run_auto_migrations() brings it up to the current shape.
alembic upgrade head

exec uvicorn app:app --host 0.0.0.0 --port "${PORT:-8000}"
