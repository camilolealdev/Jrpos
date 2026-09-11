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

## 2. Opción A — VPS con Docker Compose + Traefik (recomendado para SaaS)

`docker-compose.prod.yml` **no levanta Traefik** — asume que ya existe, corriendo en la red externa
`traefik_public`, con un certresolver llamado `letsencrypt`. `docker-compose.traefik.yml` (este repo)
provee exactamente eso. Si Traefik no está corriendo primero, el stack de la app no arranca
(la red externa no existe) y aunque arrancara, nadie llegaría al sitio (`web` solo hace `expose`, no
publica puertos — Traefik es el único punto de entrada en 80/443).

### Requisitos
- VPS con Docker + Docker Compose plugin
- Dominio con registro DNS `A` → IP del VPS
- Un Personal Access Token de GitHub con scope `read:packages` para hacer `docker login ghcr.io`
  (los paquetes `jrpos-backend`/`jrpos-web` en GHCR son privados por defecto)

### Pasos

```bash
# 0. Clonar y configurar
git clone <repo> && cd jrpos
cp .env.example .env
nano .env   # completa DATABASE_URL, JWT_SECRET, DOMAIN, POSTGRES_PASSWORD, ACME_EMAIL, seeds...

# 1. Login a GHCR (una sola vez por VPS) para poder hacer pull de las imágenes privadas
echo "<GITHUB_PAT>" | docker login ghcr.io -u <tu-usuario-github> --password-stdin

# 2. Levantar Traefik (crea la red externa `traefik_public` y gestiona TLS)
docker compose -f docker-compose.traefik.yml up -d

# 3. Levantar el stack de la app (postgres + redis + backend + web/Caddy)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 4. Verificar salud
docker compose -f docker-compose.traefik.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail 50   # debe terminar en "Uvicorn running on..."
docker compose -f docker-compose.traefik.yml logs traefik --tail 50   # confirma que emitió el certificado ACME

# 5. Smoke test
curl -s https://TU-DOMINIO/api/openapi.json | head -c 200
# Login (debe devolver 200 + cookies):
curl -s -i -X POST https://TU-DOMINIO/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | head -20
```

### Qué hace cada pieza
- **`traefik`** (`docker-compose.traefik.yml`) — único servicio con los puertos 80/443 publicados.
  Termina TLS con Let's Encrypt (challenge HTTP-01) y enruta por `Host()` según las labels de `web`.
- **`postgres:16`** — base de datos con volumen persistente (`postgres_data`)
- **`redis:7`** — caché/limitadores, degrada grácilmente si falla
- **`backend`** — `docker-entrypoint.sh` ejecuta `alembic upgrade head` (tablas base) y luego
  `run_auto_migrations()` (ALTERs idempotentes + **creación de secuencias** de numeración)
- **`web` (Caddy)** — sirve el build del SPA y hace reverse-proxy de `/api/*` al backend desde
  **el mismo origen** (resuelve el problema de cookies cross-site del deploy split de Vercel).
  Caddy ya no gestiona TLS (escucha `:80` plano) — eso ahora es responsabilidad de Traefik.

### HTTPS
Traefik emite y renueva los certificados automáticamente contra `DOMAIN` usando `ACME_EMAIL`.
Sin Traefik corriendo, no hay HTTPS ni forma de llegar al `web` desde fuera del VPS.

### Actualizar el deploy
```bash
git pull
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```
(Las imágenes se reconstruyen en GitHub Actions al hacer push a `main` — `pull` trae la última `:latest`
publicada por `.github/workflows/docker-publish.yml`. Solo se necesita rebuild local si se edita
`docker-compose.prod.yml`/`docker-compose.traefik.yml` en sí.)

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
