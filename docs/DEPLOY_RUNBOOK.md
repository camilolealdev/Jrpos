# 🚀 Runbook de Despliegue — JRPOS SaaS

Estado del proyecto: **listo para deploy**. Todos los módulos no-demo son funcionales.
Únicos módulos marcados **demo** (intencionalmente incompletos, dependen de habilitación DIAN-PT):
Facturación Electrónica, POS Electrónica, Nómina, RADIAN, Certificado Digital.

---

## 0. Qué se corrigió en esta sesión (bloqueadores eliminados)

| # | Bloqueador | Estado |
|---|-----------|--------|
| 1 | `docker-compose.yml` tenía error de sintaxis YAML (líneas fusionadas en `ports`) | ✅ Corregido |
| 2 | Tests apuntaban a **producción** (`jrpos-api.vercel.app`) y creaban datos reales | ✅ Repuntados a `http://127.0.0.1:8000` (override `BACKEND_TEST_URL`) |
| 3 | **Causa raíz del 500 en prod**: `.env.production.local` tenía la *URL del proyecto Supabase* (`https://...supabase.co`) en lugar de un *connection string* Postgres | ✅ Archivo reparado localmente (backup: `.env.production.local.bak`). **Debes corregirlo también en Vercel → Settings → Environment Variables** |
| 4 | `_tenant_info_for` crasheaba con datetimes naive (SQLite) vs aware (`utcnow`) | ✅ Comparación tz-safe en `auth.py` |
| 5 | Las 7 secuencias de numeración de documentos (`sales_number_seq`, `documents_number_seq`, etc.) **no existían** → 500 en todos los endpoints de documentos en prod | ✅ Creación idempotente añadida a `db_migrations.py` |
| 6 | `aiosqlite` faltaba en `requirements.txt` (fallback local crasheaba) | ✅ Añadido |
| 7 | Sin plantilla de variables de entorno | ✅ Creado `.env.example` |

**Suite de tests: 72 passed / 2 skipped** contra Postgres local (contenedor `jrpos-pg-test` en puerto 5433).

---

## 1. Variables de entorno obligatorias

Plantilla completa: ver `.env.example` en la raíz del repo.

| Variable | Obligatoria | Notas |
|----------|:-----------:|-------|
| `DATABASE_URL` | ✅ | **Connection string Postgres real**, NO la URL del proyecto Supabase |
| `JWT_SECRET` | ✅ (prod) | El backend rechaza arrancar en `ENV=production` sin él |
| `ENV` | ✅ | `production` activa cookies `Secure` (requiere HTTPS) |
| `DOMAIN` | ✅ (VPS) | Caddy la usa para HTTPS automático con Let's Encrypt |
| `POSTGRES_PASSWORD` | ✅ (VPS) | Sin default — el compose no arranca sin ella |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | recomendado | Seed del admin del tenant al primer arranque |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | recomendado | Seed del superadmin |
| `FRONTEND_URL` | recomendado | CORS / redirects |
| `TRIAL_DAYS` | opcional | Default del SaaS (14) |
| `REDIS_URL` | VPS | El compose la inyecta (`redis://redis:6379/0`) |

### Formato correcto de `DATABASE_URL` según plataforma

```
# Supabase (pooler, requerido para serverless/Vercel):
postgresql://postgres.<project-ref>:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres

# Postgres del docker-compose (VPS):
postgresql://jrpos:<POSTGRES_PASSWORD>@postgres:5432/jrpos
```

El backend normaliza a `postgresql+asyncpg://` y desactiva el statement cache (`statement_cache_size: 0`)
que exige Supavisor. Obtén el string exacto en **Supabase → Connect → Connection pooling**.

---

## 2. Opción A — VPS con Docker Compose (recomendado para SaaS)

### Requisitos
- VPS con Docker + Docker Compose plugin
- Dominio con registro DNS `A` → IP del VPS (Caddy gestiona el certificado TLS solo)

### Pasos

```bash
# 1. Clonar y configurar
git clone <repo> && cd jrpos
cp .env.example .env
nano .env   # completa DATABASE_URL, JWT_SECRET, DOMAIN, POSTGRES_PASSWORD, seeds...

# 2. Levantar el stack (postgres + redis + backend + web/Caddy)
docker compose up -d --build

# 3. Verificar salud
docker compose ps          # los 4 servicios deben estar healthy/running
docker compose logs backend --tail 50   # debe terminar en "Uvicorn running on..."

# 4. Smoke test
curl -s https://TU-DOMINIO/api/openapi.json | head -c 200
# Login (debe devolver 200 + cookies):
curl -s -i -X POST https://TU-DOMINIO/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | head -20
```

### Qué hace cada pieza
- **`postgres:16`** — base de datos con volumen persistente (`postgres_data`)
- **`redis:7`** — caché/limitadores, degrada grácilmente si falla
- **`backend`** — `docker-entrypoint.sh` ejecuta `alembic upgrade head` (tablas base) y luego
  `run_auto_migrations()` (ALTERs idempotentes + **creación de secuencias** de numeración)
- **`web` (Caddy)** — sirve el build del SPA (`CI=false yarn build`, yarn clásico tolera el
  peer-dep de react-day-picker con React 19) y hace reverse-proxy de `/api/*` al backend
  desde **el mismo origen** (resuelve el problema de cookies cross-site del deploy split de Vercel)

### HTTPS
Caddy emite y renueva certificados automáticamente con el valor de `DOMAIN`.
En local sin dominio (`DOMAIN=localhost`) usa certificado self-signed — el navegador pedirá aceptarlo.

### Actualizar el deploy
```bash
git pull && docker compose up -d --build
```

### Backups
```bash
docker exec jrpos-postgres pg_dump -U jrpos jrpos > backup_$(date +%F).sql
```

---

## 3. Opción B — Vercel (frontend ya desplegado; backend serverless)

⚠️ Requisitos específicos para que funcione (los fallos actuales venían de aquí):

1. **`DATABASE_URL` en Vercel debe ser el connection string del pooler de Supabase**
   (puerto `6543`), no la URL `https://...supabase.co` del proyecto. Este fue el 500.
2. **`JWT_SECRET` presente** — sin él todo endpoint de auth devuelve 500.
3. Cookies: Vercel sirve por HTTPS, así que las cookies `Secure` funcionan bien.
4. Frontera conocida: `date_trunc` (reportes/dashboard) requiere Postgres — Supabase lo cumple.

---

## 4. Verificación post-deploy (checklist)

- [ ] `/api/openapi.json` responde 200
- [ ] Login devuelve 200 con cookies `HttpOnly; Secure; SameSite=Lax`
- [ ] `/superadmin` accesible solo con rol superadmin
- [ ] Crear producto → venta → factura: la numeración de documentos funciona (secuencias OK)
- [ ] Dashboard/reportes cargan (`date_trunc` OK en Postgres)
- [ ] Paywall aparece al expirar el trial (403 → redirect `/paywall`)
- [ ] Audit log registra impersonación y operaciones superadmin

## 5. Módulos demo (no bloquean el deploy)

Facturación Electrónica, POS Electrónica, Nómina, RADIAN y Certificado Digital permanecen
en modo demo hasta contar con habilitación DIAN-PT. El resto del SaaS es funcional para
todos los roles: superadmin, admin, cajero y auditor.
