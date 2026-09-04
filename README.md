# JRPOS 🏪

Sistema POS completo para tiendas de abarrotes en Colombia. Web responsive (PWA instalable en Android) con inventario, escaneo de facturas con IA, fiado con abonos, impresión térmica Bluetooth y estructura modular DIAN.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 (CRA) + Tailwind CSS + shadcn/ui + driver.js |
| Backend | FastAPI (Python) + Motor (async MongoDB) |
| Base de datos | MongoDB |
| IA (OCR facturas) | Gemini 3 Flash / 3.1 Pro vía `emergentintegrations` |
| Auth | JWT (cookies httpOnly) + bcrypt, roles admin/cajero |
| Impresión | Web Bluetooth ESC/POS (58/80 mm) |

## Módulos activos

Dashboard · POS (multi-cuenta retenida, cámara/pistola de barras, 6 métodos de pago) · Inventario (CRUD, iconos de categoría fijables) · Escanear Factura con IA · Carga/Actualización Masiva CSV · Clientes y Proveedores · Créditos/Fiado (abonos, estado de cuenta, recordatorio WhatsApp) · Gastos · Reportes (reimpresión térmica) · POS Electrónica **simulada** (CUFE + XML UBL) · Permisos de Usuarios · Configuración y personalización · Soporte · Onboarding guiado.

Módulos DIAN reales y roadmap: ver [`docs/MODULOS_PENDIENTES.md`](docs/MODULOS_PENDIENTES.md).

## Variables de entorno

**`backend/.env`** (stack Mongo original — Railway/Docker)
```
MONGO_URL=...
DB_NAME=...
EMERGENT_LLM_KEY=...        # OCR de facturas (Gemini)
JWT_SECRET=...              # 64 hex chars
ADMIN_EMAIL=...             # admin sembrado al iniciar
ADMIN_PASSWORD=...
FRONTEND_URL=https://...    # origen(es) exacto(s) para CORS con cookies; separa varios con coma (prod + preview)
FRONTEND_URL_REGEX=...      # opcional: regex para orígenes dinámicos, ej. previews de Vercel (^https://jrpos-.*\.vercel\.app$)
```

**Vercel (stack nuevo Postgres/Supabase — `backend/app.py`)**, además de `JWT_SECRET`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`/`FRONTEND_URL*` de arriba:
```
DATABASE_URL=...            # Supabase, pooler modo TRANSACCIÓN (puerto 6543) — usado en runtime por la app
DATABASE_URL_UNPOOLED=...   # Supabase, pooler modo SESIÓN (puerto 5432) — usado por Alembic al migrar
                             # OJO: no usar la conexión "directa" (db.<ref>.supabase.co) — es IPv6 y
                             # Vercel es IPv4-only, la conexión fallaría en el build/runtime.
GEMINI_API_KEY=...          # reemplaza EMERGENT_LLM_KEY para el OCR vía google-genai
```

**`frontend/.env`**
```
REACT_APP_BACKEND_URL=https://...
```

## Desarrollo local

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend && yarn install && yarn start
```

## Notas de despliegue

- **Emergent (recomendado)**: despliegue nativo del stack completo (frontend + FastAPI + MongoDB gestionada).
- **Vercel**: solo aloja el frontend React estático. El backend FastAPI necesita Railway/Render/Fly y MongoDB Atlas como base externa; apunta `REACT_APP_BACKEND_URL` al backend desplegado.
