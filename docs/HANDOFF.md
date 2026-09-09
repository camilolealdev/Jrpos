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

## Lección operativa: Docker Desktop bajo carga

Durante esta sesión, lanzar más de un `docker compose build` en paralelo (o encima de uno que ya estaba corriendo) dejó a Docker Desktop/WSL2 en un estado degradado: builds colgados por 10+ minutos, `docker info`/`docker compose ps` sin responder, DNS interno fallando (`Temporary failure in name resolution` resolviendo `postgres` desde el backend), contenedores en crash-loop. La única solución fue matar los procesos de Docker Desktop y relanzarlo. **No lanzar builds de Docker en paralelo** — esperar a que termine uno antes de lanzar el siguiente.
