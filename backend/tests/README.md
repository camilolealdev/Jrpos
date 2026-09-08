# Backend tests

These are **black-box integration tests**: they need a running backend.

> Never run them against production by accident — older versions of these
> files defaulted to the live Vercel URL and would create/delete real data.

## Local run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

# terminal 1 — local server (env-driven DB, SQLite fallback works)
python -B -m uvicorn app:app --port 8000

# terminal 2 — suite against local server (default target)
BACKEND_TEST_URL=http://127.0.0.1:8000 python -m pytest tests/ -q
```

## Against any environment

```bash
BACKEND_TEST_URL=https://staging.example.com python -m pytest tests/ -q
```

## What the suite covers

| File | Scope |
|---|---|
| `backend_test.py` | bulk load/update, expenses, held sales, electronic POS |
| `test_auth_permissions.py` | login, cookies, role permissions |
| `test_refresh_and_roles.py` | token refresh, role matrix |
| `test_reset_password.py` | password reset flows |
| `test_jrpos_modules.py` | sales docs, credit notes, promotions, warranties, POs, commissions, services |
| `test_timeclock.py` | clock in/out endpoints |
