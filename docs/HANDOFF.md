# Handoff — Login/Registro con Google (sesión 2026-09-08)

Notas para la próxima sesión sobre lo que se implementó, el estado actual y lo que falta. Último commit al cierre de esta sesión: `ccde395` (en `origin/main`).

## Qué se implementó

Login y registro con Google, con onboarding obligatorio para cuentas nuevas (pidió el usuario: "que también deba llenar los datos de onboarding").

- **Backend** — `backend/auth.py`:
  - `POST /api/auth/google`: verifica el ID token de Google (`google-auth`), busca usuario por `google_id` o por email. Si existe → login directo. Si no existe y no viene `business_name` en el payload → responde `{"needs_onboarding": true, "google": {...}}`. Si viene `business_name` → crea el tenant (mismo flujo que `/register-tenant`, reusa el helper `_provision_tenant`).
  - `backend/models_sql.py`: columna `google_id` (nullable, unique) en `User`.
  - `backend/db_migrations.py`: ALTER idempotente para `google_id`.
- **Frontend**:
  - `frontend/src/components/GoogleSignInButton.jsx` — botón oficial de Google (Identity Services vía `<script>` en `index.html`, sin dependencia npm). Se oculta solo si `REACT_APP_GOOGLE_CLIENT_ID` no está seteado.
  - `frontend/src/components/GoogleOnboardingModal.jsx` — formulario (negocio, teléfono, tipo de comercio) que aparece solo para cuentas de Google nuevas.
  - `frontend/src/lib/useGoogleAuthFlow.js` — hook compartido entre `Login.jsx` y `RegisterTenant.jsx`.
  - Agregado a ambas páginas.

## Credenciales de Google (ya configuradas para local/pruebas)

- Client ID: `3345506845-n7p6p5mue4p43vtt89i7ejo0aq3b2fao.apps.googleusercontent.com`
  - Backend: `.env` → `GOOGLE_CLIENT_ID`
  - Frontend: `frontend/.env` y `frontend/.env.production` → `REACT_APP_GOOGLE_CLIENT_ID`
- **Al desplegar a un dominio real o a Vercel**, hay que:
  1. Agregar el origen real (`https://tu-dominio.com`) en "Authorized JavaScript origins" del Client ID en [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Los cambios pueden tardar unos minutos en propagar.
  2. Setear las mismas dos env vars en el entorno de destino (Vercel backend + Vercel frontend, o `.env` del VPS).
- El Client Secret que generó el usuario **no se usa** — el flujo es ID-token de Google Identity Services, no intercambio de código server-side.

## Bug real encontrado y corregido (no relacionado con Google Auth)

`users.ck_users_role` (CHECK constraint) se creó hace tiempo solo con `admin`/`cajero` permitidos y nunca se actualizó cuando el modelo ORM agregó `supervisor`, `contador`, `superadmin_platform`. Esto crasheaba el backend en cada arranque porque `seed_admin()` (en `auth.py`) intenta crear/actualizar un usuario `superadmin_platform` incondicionalmente. Corregido con un `ALTER TABLE ... DROP/ADD CONSTRAINT` idempotente en `db_migrations.py`.

**Lección para futuras columnas/roles/constraints nuevos en `models_sql.py`**: `Base.metadata.create_all()` NO altera tablas que ya existen — solo crea las que faltan. Cualquier cambio a una tabla existente (columna nueva, constraint nuevo, valor nuevo en un CHECK) necesita su propio `ALTER TABLE` idempotente en `db_migrations.py`, o se rompe silenciosamente en cualquier base de datos que no sea completamente nueva.

## Pendiente / a revisar

- **Contraseñas por defecto débiles**: `seed_admin()` usa `superadmin123`/`admin123` si `SUPERADMIN_PASSWORD`/`ADMIN_PASSWORD` no están seteadas. Definir ambas con contraseñas fuertes antes de cualquier despliegue real (VPS o Vercel).
- **Pantalla de consentimiento de Google**: sigue en modo "Testing" en Google Cloud Console — solo funciona con cuentas agregadas como "Test users" hasta que se publique la app (o se quede así si el volumen de usuarios es bajo, revisar límites de Google).
- **VPS**: todo esto se validó en Docker local (`docker compose`), no se ha desplegado al VPS real todavía. Ver `docs/DEPLOY_RUNBOOK.md` para esos pasos.
- **Certificado local de Caddy**: para probar `https://localhost` sin errores de certificado hay que instalar el CA local de Caddy en el almacén de confianza de Windows (se generó y entregó al usuario en esta sesión, no se vuelve a necesitar si ya lo instaló).

## Auditoría de aislamiento multi-tenant (sesión 2026-09-09) + Row-Level Security

Se auditaron los 22 routers del backend buscando queries que reciben `user`/`admin` pero no filtran por `tenant_id`. Se encontraron y corrigieron fugas reales entre tenants en `invoices.py` (el peor: `import_invoice_to_inventory` podía sobrescribir stock/precio de productos de OTRO tenant), `radian.py`, `payroll.py`, `docs.py` y `electronic.py`. El resto de routers ya estaban correctos.

Como segunda capa de defensa (para que un bug futuro similar no vuelva a filtrar datos aunque el código lo permita), se implementó **PostgreSQL Row-Level Security** en las 33 tablas realmente tenant-scoped (`backend/db_migrations.py`), con el contexto fijado en `backend/auth.py::get_current_user`/`_provision_tenant` vía `set_config('app.current_tenant_id', ...)`.

**Trampa crítica encontrada al verificar (no asumir que "ENABLE + FORCE ROW LEVEL SECURITY" ya es suficiente):** Postgres crea el rol de `POSTGRES_USER` **siempre como superusuario** durante el bootstrap del contenedor, y no se le puede quitar después (`ALTER ROLE ... NOSUPERUSER` falla explícitamente contra el bootstrap user: *"The bootstrap user must have the SUPERUSER attribute"*). Un superusuario **ignora RLS sin importar `FORCE`**. Si el backend se sigue conectando con ese rol, todas las políticas de RLS son un placebo — solo se detecta probando con SQL crudo *sin* el `WHERE` que el código ya pone, no con requests normales de la app (que seguían dando el resultado correcto gracias al filtro de código, ocultando el problema).

La solución fue crear un segundo rol, `jrpos_app` (sin `SUPERUSER`/`BYPASSRLS`), dueño de las tablas — `docker/postgres-init.sh` lo crea automático en un volumen nuevo (VPS, `down -v`), y `DATABASE_URL`/`DATABASE_URL_UNPOOLED` en `.env` ahora apuntan a `jrpos_app`, no a `jrpos`. `jrpos` (superusuario) sigue existiendo solo como bootstrap del cluster.

**Cómo verificar que RLS realmente bloquea (no solo que existan las políticas):** conectar por psql con el rol de la app, fijar `app.current_tenant_id` a un tenant distinto, y correr un `SELECT count(*)` **sin ningún `WHERE`** sobre una tabla con datos de otro tenant — debe dar 0. Si da el conteo real, alguna sesión sigue conectándose como superusuario/con `BYPASSRLS`.

## Lección operativa: Docker Desktop bajo carga

Durante esta sesión, lanzar más de un `docker compose build` en paralelo (o encima de uno que ya estaba corriendo) dejó a Docker Desktop/WSL2 en un estado degradado: builds colgados por 10+ minutos, `docker info`/`docker compose ps` sin responder, DNS interno fallando (`Temporary failure in name resolution` resolviendo `postgres` desde el backend), contenedores en crash-loop. La única solución fue matar los procesos de Docker Desktop y relanzarlo. **No lanzar builds de Docker en paralelo** — esperar a que termine uno antes de lanzar el siguiente.

---

## Sesión 2026-09-11: Venta por paquete (`pack_only`), stock en cajas y hardening SuperAdmin

### Qué cambió

**1. `pack_only` — producto que SOLO se vende por paquete/caja completo**
- `backend/models_sql.py::Product.pack_only` (Boolean, default False) + migración idempotente `ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_only BOOLEAN NOT NULL DEFAULT FALSE` en `db_migrations.py`.
- APIs: `pack_only` añadido a `ProductOut`, `ProductCreate` y `ProductUpdate` (`routers/products.py`).
- POS (`frontend/src/pages/POS.jsx`): `isPack = (isPackage || p.pack_only) && units_per_package > 1` — el click normal sobre un `pack_only` vende el paquete completo, el badge cambia a **"Solo x paquete de N"** (no clickable) y el precio mostrado en la tarjeta es el del paquete (unidad × N).
- Inventario (`frontend/src/pages/Inventory.jsx`): el campo `Unidades por paquete/caja` salió de la calculadora de % utilidad y ahora es siempre visible; el checkbox "SOLO se vende por paquete" aparece solo si `units_per_package > 1`. Al guardar, `pack_only` se fuerza a `false` si `units_per_package <= 1`.
- **Carga masiva NO toca `pack_only`** en updates (comentario en `bulk_load_products`): el CSV/factura IA no expone el campo y forzarlo a `False` borraria flags puestos a mano en cada reimportación.

**2. Stock recibido en paquetes → convertido a unidades**
- Nuevo campo `stock_packages` SOLO en el formulario de Inventario (no va al backend — se hace `delete payload.stock_packages` antes del POST). Indicas cuántas cajas recibiste y se calcula `stock = paquetes × units_per_package`. Invariantes: `stock` siempre se guarda en unidades; editar `stock` a mano limpia `stock_packages`.
- `units_per_package` y `pack_only` se envían SIEMPRE en el payload, aunque la calculadora de % utilidad esté apagada — son atributos del producto, no de la calculadora.

**3. `category_meta` multi-tenant real (bug fix)**
- Antes la PK era solo `name` → una categoría de un tenant bloqueaba/colisionaba con la de otro en `session.get(CategoryMeta, name)`.
- Ahora: PK compuesta `(tenant_id, name)` en el modelo (`PrimaryKeyConstraint`), migración idempotente en `db_migrations.py` (backfill `tenant_id = 'tenant-default-001'` donde era NULL, `SET NOT NULL`, swap de constraint en un `DO $$ ... EXCEPTION WHEN OTHERS THEN NULL`).
- Todos los accesos por PK simple cambiaron a `select(CategoryMeta).where(name == ..., tenant_id == ...)`: `routers/products.py::upsert_category_meta` (y eliminado el parche "if not meta.tenant_id"), `seed_data` y `auth.py::seed_admin`.

**4. SuperAdmin hardening + deep-links**
- El modo SuperAdmin (auto-activación por ruta, switcher del sidebar) ahora es **exclusivo de `superadmin_platform`** — antes cualquier `admin` podía entrar al panel SaaS.
- Panel `/superadmin`: pestañas sincronizadas con query param (`?tab=tenants|tickets|assisted`) vía `useSearchParams` → deep-links compartibles; sidebar con enlaces directos por sección.
- Todas las llamadas migradas de `axios` crudo con `withCredentials: true` manual al cliente `api` de `lib/api.js` (interceptores + baseURL centralizados).

### Verificación
- Migraciones idempotentes: seguras de correr sobre BD existentes (pattern IF NOT EXISTS / DO-EXCEPTION ya establecido en el repo).
- Pendiente de despliegue real: correr el stack y verificar que (a) la migración de PK compuesta aplica, (b) el POS respeta `pack_only`, (c) los deep-links `?tab=` del panel SaaS funcionan.

### Riesgos a vigilar
- El `EXCEPTION WHEN OTHERS THEN NULL` del swap de constraint de `category_meta_pkey` traga cualquier error — si la PK compuesta NO queda aplicada, no falla en arranque. Verificar con `\d category_meta` en psql tras desplegar.
- Deploys existentes con categorías duplicadas `NULL tenant_id`: el backfill las asigna todas a `tenant-default-001`; si hay datos reales de otros tenants con NULL habría que reasignarlas a mano ANTES de desplegar.

---

## Sesión 2026-09-12: continuación tras reinicio del PC — suite de tests reparada y verde

Contexto: la sesión anterior (staff roles por tipo de negocio + rol `mesero`) quedó interrumpida por un reinicio. Al retomar, la verificación completa de backend+frontend reveló y corrigió varias deudas acumuladas en los tests. **Suite final: 91 passed (HTTP) + 11 passed (unit, dentro del contenedor) + build de frontend OK.**

### Correcciones a los tests (causa raíz: credenciales y target desactualizados)

1. **Credenciales stale en 10 archivos de tests**: usaban `admin@jrpos.com`/`jrpos2026` (email/contraseña viejos) y provocaban 401 + bloqueos de 15 min en la tabla `LoginAttempt`. Ahora todos leen `os.getenv("ADMIN_EMAIL", "admin@jrpos.co")` / `os.getenv("ADMIN_PASSWORD", "testpass123")` (lo que siembra `.env`). `test_refresh_and_roles.py` conserva su caso `OLD_ADMIN` que verifica que el email legacy falla — ese queda intacto.
2. **Target de tests**: apuntaban a `http://127.0.0.1:8000` (puerto no publicado por compose). Target correcto: `https://localhost` (Caddy → `jrpos-backend:8000`). Todos los `BASE_URL`/`API` ahora `os.getenv("API_BASE", "https://localhost")`.
3. **`backend/tests/conftest.py` (nuevo)**: (a) parchea `requests.Session.request` para `verify=False` (cert self-signed de Caddy) y silencia el warning; (b) spoof de `X-Forwarded-For` **único por request** — el limiter Redis del backend en contenedor (imagen prebuilt, sin el bypass `x-test-client` del código local) keys por primera IP de XFF, así cada request tiene su propio bucket y nunca se agota el límite 10/min.

### Bugs reales de backend encontrados y corregidos (db_migrations.py)

Mismo patrón que el bug de `settings_general_id_seq` ya documentado: los modelos declaran `autoincrement=True` pero el DDL histórico creó las tablas con `id integer NOT NULL` **sin secuencia** → todo INSERT fallaba con 500. Las tablas afectadas eran `settings_timeclock_schedule`, `settings_electronic` (y las demás settings_* autoincrement). Fix: crear las secuencias idempotentemente + `ALTER COLUMN id SET DEFAULT nextval(...)` en `db_migrations.py`, y aplicado a la BD local en vivo.

Además: `settings_certificate.uploaded_at` era `varchar(30)` pero el código guarda timestamps ISO de 32 chars → `value too long`. Fix: widening idempotente a `varchar(40)`.

### Resuelto: proceso uvicorn fantasma en `:8000` (split-brain de BD)

Durante la sesión apareció dos veces un `uvicorn` local (desde `backend/.venv`) escuchando en `127.0.0.1:8000` **NO originado por compose**. Peligro real: cargaba `backend/.env`, cuyo `DATABASE_URL` puede apuntar al pooler de **Supabase producción** — los tests que apuntaban ahí (`test_entitlements.py`, `test_impersonation_security.py`) validaban contra otra BD (por eso el superadmin se bloqueaba ahí y no en local). Decisión: **no debe existir** — el stack corre 100% via compose+Caddy. Se mató el proceso (`taskkill //PID ... //F`) y se corrigieron los 2 test files que apuntaban al puerto. No se encontró mecanismo de auto-restart (fue lanzamiento manual); si reaparece, buscar qué lo lanza.

### Lecciones operativas de esta sesión

- **`npx vite build` NO es el build de este frontend** — el proyecto es CRA+craco; usar `npm run build`. El `npx vite` descarga un vite global ajeno y falla con errores crípticos de rolldown.
- **El contenedor backend corre imagen prebuilt** (`docker-compose.local.yml`, sin bind-mount): los cambios locales de código (ej. el header `x-test-client`) NO están en el contenedor hasta rebuild. Verificar con `docker exec jrpos-backend grep ...`. Para no bloquear tests por el limiter, el spoof XFF de conftest funciona sin rebuild.
- **Docker Desktop se cuelga bajo carga** (ya documentado): los `docker exec`/`docker ps` dieron timeout varios minutos; siempre envolver comandos docker en `timeout N` para no bloquear la sesión.
- El limiter Redis keys por primera IP de `X-Forwarded-For`; detrás de Caddy el backend ve la IP de red docker (compartida), por eso el suite agotaba el límite al instante.

### Estado de git al cierre

Sin commitear: `backend/db_migrations.py` (secuencias + uploaded_at widening), `backend/tests/conftest.py` (nuevo), y 3 test files (`test_entitlements.py`, `test_granular_rbac.py`, `test_impersonation_security.py`) apuntados al target correcto. Los demás fixes de tests ya están dentro de los commits `eb2d641`/`d3bed09`. Feature de staff roles/`mesero` ya estaba commiteada. Último commit: `d3bed09`.

---

## Sesión 2026-09-14: política de contraseñas fuertes + cierre de pendientes de sesiones previas

### Qué se implementó (commit `d4817d0`)

- `backend/auth.py::validate_password_strength()`: mínimo 8 caracteres, al menos 2 de {mayúscula, minúscula, dígito, símbolo}, rechaza una lista de contraseñas débiles/conocidas (incluye los defaults históricos del propio proyecto: `testpass123`, `admin123`, `jrpos2026`, etc.) y rechaza que la contraseña contenga el usuario del email. No aplica a login con Google (esas cuentas no tienen password JRPOS).
- Aplicado en los 3 puntos donde se fija un password: `register_tenant` (auth.py), `create_user` y `reset_password` (routers/users.py). El límite viejo de "mínimo 4 caracteres" en `reset_password` y en el frontend (`Users.jsx`) quedó reemplazado por esta validación centralizada.
- `frontend/src/components/PasswordStrengthMeter.jsx` (nuevo): medidor visual reutilizado en `RegisterTenant.jsx` y `Users.jsx` (alta de usuario + reset de password).
- `docs/legal/POLITICA_PRIVACIDAD.md` (nuevo).
- Verificado: 102/102 tests backend en verde antes de commitear.

### Pendiente resuelto en esta sesión: contraseñas por defecto del seed

El HANDOFF ya advertía que `seed_admin()` cae a `testpass123` si `SUPERADMIN_PASSWORD`/`ADMIN_PASSWORD` no están seteadas — y ese mismo string quedó, sin querer, dentro de la lista `_WEAK_PASSWORDS` de este commit (un usuario nuevo no podría elegir esa contraseña, pero el seed la seguía usando por default). Como `docker-compose.yml` (el compose real de despliegue) **ya** define fallbacks fuertes vía `${ADMIN_PASSWORD:-JrposSecKey2026_...}` / `${SUPERADMIN_PASSWORD:-PlatformMaster2026_...}`, el riesgo real solo aplicaba si el backend arranca sin pasar por ese compose (ej. otro entorno, `docker-compose.local.yml`, o un despliegue mal configurado que no exporta las env vars).

Fix (siguiendo el mismo patrón ya usado en `get_jwt_secret()` de este archivo): `seed_admin()` ahora revisa `_is_production_env()` — si es producción (`ENV=production` / Railway / Vercel) y falta `SUPERADMIN_PASSWORD` o `ADMIN_PASSWORD`, lanza `RuntimeError` en vez de sembrar silenciosamente una contraseña débil conocida. En dev/test (no producción) el fallback `testpass123` se mantiene igual que antes — no rompe nada del flujo local ni de los tests (que ya usan ese mismo default vía `os.getenv(..., "testpass123")`). Verificado copiando el archivo al contenedor (`docker cp` + `docker restart`, sin rebuild) y corriendo la suite completa.

### Pendientes que siguen abiertos — requieren decisión/acceso que no son solo código

1. **Pantalla de consentimiento de Google** sigue en modo "Testing" en Google Cloud Console (solo cuentas agregadas como "Test users" pueden loguearse con Google). Publicarla a producción es una acción manual en la consola de Google (posible revisión de verificación de app) — no se hizo en esta sesión, pendiente de decisión del usuario.
2. **VPS**: todo lo de RBAC/password policy/RLS sigue validado solo en Docker local; no se ha desplegado al VPS real. Ver `docs/DEPLOY_RUNBOOK.md`.

---

## Sesión 2026-09-14: Corrección de personalización visual (temas de color, logotipo de negocio) y React Router v7

### Diagnóstico de causas raíz
1. **Colores de acento**: Tailwind utilizaba clases estáticas `emerald-*` hardcodeadas en componentes JSX. El selector de acento en `Settings.jsx` solo alteraba variables CSS primarias (`--primary`), por lo que los componentes `bg-emerald-600`, `text-emerald-700`, etc., permanecían invariables.
2. **Logotipo de negocio**: No existía columna `logo_url` en `SettingsGeneral` (SQLAlchemy / PostgreSQL), ni en el schema Pydantic `GeneralSettingsIn`, ni en los endpoints de backend. En frontend no existía input ni botón de carga de logo.
3. **React Router v7 Warnings**: Advertencias de migración sobre `v7_startTransition` y `v7_relativeSplatPath`.

### Soluciones implementadas
- **Base de datos & Backend**:
  - `backend/models_sql.py`: Añadida columna `logo_url` a `SettingsGeneral`.
  - `backend/routers/settings.py`: Añadido `logo_url: Optional[str]` a `GeneralSettingsIn`.
  - `backend/db_migrations.py`: Añadida migración DDL idempotente `ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS logo_url TEXT;`. Ejecutada y verificada en `jrpos-postgres`.
- **Frontend & Tailwind**:
  - `frontend/tailwind.config.js`: Mapeada la paleta `emerald` completa (50 a 950) a `hsl(var(--accent-{shade}) / <alpha-value>)`.
  - `frontend/src/index.css`: Declaradas variables CSS `--accent-50` hasta `--accent-950` por defecto en `:root`.
  - `frontend/src/pages/Settings.jsx`:
    - Tablas completas de HSL para 8 paletas (`emerald`, `ocean`, `violet`, `terracotta`, `berry`, `amber`, `rose`, `slate`).
    - Actualizado `applyAccent()` para inyectar dinámicamente `--accent-50` a `--accent-950` y emitir `jrpos_accent_changed`.
    - Componente de subida de logotipo con canvas resize (máx. 400px), previsualización en tiempo real y botón para remover.
    - Card interactiva de paleta de colores con demostración en vivo.
  - `frontend/src/components/Layout.jsx`: Logotipo de la tienda integrado en Sidebar (desktop y móvil) con fallback al logo blanco predeterminado.
  - `frontend/src/pages/POS.jsx`: Logotipo de la tienda renderizado en los tickets y comprobantes impresos de venta.
  - `frontend/src/index.js` y `frontend/src/App.js`: Activación inmediata de acento al iniciar la app y flags `v7_startTransition`, `v7_relativeSplatPath` en `BrowserRouter`.
  - Build compilado (`npm run build`) y desplegado en contenedor web Caddy (`jrpos-web:/srv/`).
