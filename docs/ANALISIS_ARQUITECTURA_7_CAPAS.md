# 🗺️ Análisis de Arquitectura Ecosistémica (7 Capas) — JRPOS SaaS

> **Propósito:** documento de análisis compartido para todo el equipo. Compara la arquitectura
> objetivo de 7 capas (Edge → IAM → Middlewares → Dominio → Almacenamiento/RLS → Async →
> Observabilidad) contra el estado real del código, y define qué es viable implementar,
> qué falta y en qué orden.
>
> **Fecha:** 2026-09-08 · **Alcance:** `backend/`, `Caddyfile`, `docker-compose.yml`
>
> **Veredicto global:** la arquitectura es **100% alcanzable de forma incremental**.
> El núcleo de seguridad (Capas 2 y 4) ya está implementado y probado. Los gaps reales son:
> RLS en Postgres (Capa 5), rate-limiting por plan (Capa 1), webhooks/dunning de pagos
> (Capa 4) y observabilidad con contexto de tenant (Capa 7).

---

## Resumen ejecutivo por capa

| Capa | Objetivo | Estado actual | Veredicto | Esfuerzo |
|------|----------|---------------|-----------|----------|
| 1. Edge / CDN / Ingress | WAF, tenant router, rate-limit por plan | Caddy + HTTPS auto + gzip. Rate-limit solo en login | 🟡 Parcial | Bajo (rate-limit), Medio (WAF/subdominios) |
| 2. Autenticación / IAM | JWT con claims de tenant, aislamiento | ✅ JWT HS256 (tenant_id, role), cookies Secure, gate de trial/suspensión | 🟢 Implementado (1 bug hallado) | — |
| 3. Pipeline de Middlewares | Inyección de contexto por request | DI de FastAPI resuelve tenant desde token (equivalente idiomático a AsyncLocalStorage) | 🟢 Implementado (diseño distinto pero válido) | — |
| 4. Control Plane / App Plane | Billing, webhooks, dunning, onboarding | Billing + suscripciones + suspensión ✅. **Sin webhooks reales ni dunning automático** | 🟡 Parcial | Medio |
| 5. Almacenamiento & RLS | PgBouncer + RLS + índices compuestos | Índices tenant-first ✅, Supavisor-ready ✅. **Sin RLS ni set_config** (aislamiento solo en app layer) | 🔴 Gap principal | Medio-Alto |
| 6. Caché & Async | Redis namespacing + colas de jobs | Redis opcional con no-op seguro; caché de reportes; **sin workers/colas** | 🟡 Parcial | Bajo (namespacing), Alto (workers) |
| 7. Observabilidad | Logs estructurados + métricas por tenant | Solo logger de migraciones; **sin tenant_id/trace_id en logs, sin OTel** | 🔴 Gap | Medio |

Leyenda: 🟢 implementado · 🟡 parcial · 🔴 gap · ✅ verificado en código

---

## 1️⃣ Capa 1: Edge, CDN & Ingress

### Lo que ya existe
- **`Caddyfile`**: reverse proxy a `backend:8000` para `/api*`, SPA con `try_files` para el resto,
  HTTPS automático (Let's Encrypt) y gzip. Rotación de logs por contenedor en `docker-compose.yml`.
- **Rate limiting puntual**: `redis_client.rate_limit()` por IP en el login (`auth.py:372-373`),
  complementado con lockout por email en DB (`login_attempts`). No-op seguro sin Redis.

### Gaps vs. arquitectura objetivo
| Requisito objetivo | Estado | Notas |
|---|---|---|
| Tenant Router (subdominio `tienda.mipos.com` / `X-Tenant-ID`) | ❌ No existe | El tenant **NO** debe resolverse por header (ver Capa 2); la app es single-domain (`/` SPA + `/api`). Para servir a cada tenant en su subdominio basta con apuntar los subdominios wildcard al mismo Caddy — el aislamiento es por JWT, no por host. **No es bloqueante.** |
| Rate Limiter por plan (100/1.000/10.000 req-min) | ❌ Solo login | `PlatformPlan` ya modela planes; falta exponer `rate_limit_rpm` y un middleware global que lo consulte |
| WAF | ❌ No existe | En VPS se cubre parcialmente con Cloudflare/Cloudbric delante de Caddy; en Vercel, su edge ya filtra parte |

### Plan de implementación (Capa 1)
1. **(Bajo, 1-2d)** Añadir `rate_limit_rpm` a `PlatformPlan` + middleware FastAPI global
   (antes de la resolución de sesión usa IP; después de ella usa tenant) que llame a
   `rate_limit(key, limit, 60)` con la key `rl:{plan}:{tenant_id|ip}`.
2. **(Opcional)** Wildcard DNS `*.dominio.com` → mismo stack; Caddy ya responde igual.
3. **(Opcional)** WAF: Cloudflare free tier delante (OWASP rules básicas) — cero código.

---

## 2️⃣ Capa 2: Seguridad & Autenticación (IAM)

### Lo que ya existe — **es el corazón del aislamiento y está bien hecho**
- **JWT HS256** con claims `sub` (user_id), `email`, `role`, `tenant_id` (`auth.py:44-56`).
  Cookies `HttpOnly` + `Secure` + `SameSite=None` en producción (`auth.py:66-72`), con fallback Bearer.
- **Identidad resuelta SOLO del token**: `get_current_user()` valida el JWT, carga el usuario de DB
  y **nunca** acepta `tenant_id` del body/URL. Los 23 routers derivan el tenant de
  `user.tenant_id` (75 usos verificados). El `or "tenant-default-001"` es un fallback interno,
  no un valor client-controlled.
- **Gate de trial/suspensión** en `get_current_user` (`auth.py:80-92`): 403 si trial vencido
  o tenant `suspended`/`cancelled`. Probado (72 tests).
- **Lockout por email** (DB) + rate-limit por IP (Redis) en login.

### 🔴 Bug encontrado en esta auditoría (IDOR cross-tenant)
`backend/routers/electronic.py:31`:
```python
sale = await session.get(Sale, sale_id)          # ← sin chequeo de tenant
```
Un usuario autenticado del tenant A puede generar el CUFE/XML simulado de una venta del
tenant B adivinando/probando IDs. **Contraste:** `credit_notes.py:48-50` sí lo hace bien:
```python
sale = await session.get(Sale, payload.sale_id)
if not sale or sale.tenant_id != tenant_id:
    raise HTTPException(status_code=404, detail="Venta no encontrada")
```
**Fix inmediato (recomendado):** replicar el chequeo en `electronic.py`:
```python
sale = await session.get(Sale, sale_id)
tenant_id = user.tenant_id or "tenant-default-001"
if not sale or sale.tenant_id != tenant_id:
    raise HTTPException(status_code=404, detail="Venta no encontrada")
```

### Plan de implementación (Capa 2)
1. **(Crítico, 30 min)** Corregir el IDOR de `electronic.py`.
2. **(Bajo, 2h)** Grep de auditoría: asegurar que todo `session.get(Model, id)` de entidades
   con `tenant_id` verifique pertenencia (o centralizar en un helper `get_tenant_scoped(session, Model, id, tenant_id)`).
3. **(Medio)** Migrar a RS256 con par de claves si se exponen APIs a terceros (hoy no aplica).

---

## 3️⃣ Capa 3: Pipeline de Middlewares (Inyección de Contexto)

### Análisis de compatibilidad
El ejemplo de referencia usa **NestJS + AsyncLocalStorage**. En FastAPI el equivalente idiomático
ya está en su lugar y es **más seguro**:

| Concepto del objetivo | Equivalente real en este código |
|---|---|
| `TenantContextMiddleware` + `AsyncLocalStorage` | `Depends(get_current_user)` — contexto resuelto por inyección de dependencias por request |
| Contexto thread-local con limpieza `finally` | Contexto vive solo dentro del request scope de FastAPI (garantía del framework) |
| Rechazo de tenant del cliente | Resolución exclusiva desde JWT ya cubierta |

**Conclusión:** **no se requiere AsyncLocalStorage** (que en Python sería `contextvars.ContextVar`).
Introducirlo solo se justificaría si aparece código "legacy" que no puede recibir `Depends`
(hoy no existe tal caso: toda la capa de routers recibe `user` inyectado).

### Mejora opcional (no bloqueante)
Un middleware ligero que registre `tenant_id` en el logging context (ver Capa 7) — el único
lugar donde un `ContextVar` global aportaría valor real.

---

## 4️⃣ Capa 4: Control Plane vs Application Plane

### Application Plane (POS multitenant) — ✅ completo
23 routers scoped por tenant: ventas, inventario, contactos, caja, gastos, reportes, promociones,
compras, notas crédito, garantías, documentos, comisiones, timeclock, nómina (demo), etc.

### Control Plane (global)
| Servicio objetivo | Estado | Evidencia |
|---|---|---|
| Onboarding / provisión de tenants | ✅ | `auth.py` crea Tenant + Branch + TenantSubscription en registro; `seed_admin` para platform |
| Billing / suscripciones | ✅ | `billing.py`: planes, checkout (URL Wompi simulada), activación/cancelación de subs, audit log |
| Dunning (mora → suspensión) | 🟡 **Manual** | El superadmin puede `PUT /status` a `suspended` y el gate lo bloquea (Capa 2). **Falta el job automático** que suspende al vencer |
| Webhooks de pagos (Wompi/ePayco) | ❌ No existe | El checkout genera URL simulada; **no hay endpoint receptor** de eventos |
| Idempotencia de transacciones | ❌ No aplica aún | Requerida cuando exista el webhook |

### Plan de implementación (Capa 4)
1. **(Medio, 2-3d) Webhook Wompi**: `POST /api/billing/webhook/wompi` — validar firma
   (HMAC-SHA256 de `signature.properties` + checksum), idempotencia vía
   `INSERT ... ON CONFLICT (event_id)` o tabla `payment_events(event_id PK)`, extender
   `TenantSubscription.current_period_end` y auditar en `TenantAuditLog`.
2. **(Medio, 1d) Dunning automático**: en Docker, `ofelia`/cron o un contenedor tiny que llame
   a un endpoint interno `POST /api/internal/dunning-scan` (protegido con `INTERNAL_API_KEY`):
   tenants `trial` con `trial_ends_at < now` → `status='expired'` o grace;
   subs `active` con `current_period_end < now - X días` → `suspended`. En Vercel: Vercel Cron.
3. **(Bajo)** Marcar el checkout simulado como `mode=simulation` hasta integrar el webhook real.

---

## 5️⃣ Capa 5: Almacenamiento, Aislamiento & RLS — **el gap más importante**

### Lo que ya existe
- **Índices compuestos tenant-first** ✅ (requisito de rendimiento para RLS, ya cumplido):
  `ix_sales_tenant_created (tenant_id, created_at)`, `ix_products_tenant_barcode`, etc.
  en `models_sql.py`.
- **Compatibilidad Supavisor transaction-mode** ✅: `NullPool` + `statement_cache_size: 0`
  (`db.py:35-38`) — exactamente lo que exige un pooler transaction-mode.
- **Aislamiento a nivel aplicación** ✅: filtros `where(Model.tenant_id == tenant_id)` consistentes
  (verificado en los 23 routers).

### Lo que falta (gap real)
| Requisito | Estado | Riesgo si no se hace |
|---|---|---|
| `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` | ❌ | Un solo `WHERE` olvidado (como el IDOR de Capa 2) filtra datos cross-tenant. RLS es el **backstop** |
| `set_current_tenant()` + `set_config('app.current_tenant_id', ..., true)` | ❌ | Sin esto RLS no puede funcionar con el app role |
| Rol DB dedicado (`pos_app_role`) sin superuser/BYPASSRLS | ⚠️ | Conexiones actuales usan el owner (que bypasea RLS salvo FORCE) |
| PgBouncer self-hosted | ➖ No necesario | Supabase ya provee Supavisor (mismo rol). En VPS self-hosted, Postgres directo con `NullPool` es válido a la escala actual; añadir pgbouncer si se superan ~100 conexiones |

### ⚠️ Consideración clave para la decisión
Con **SQLAlchemy async + asyncpg**, el contexto de tenant se inyecta así (equivalente al
`set_current_tenant(tenant_uuid)` del objetivo):

```python
async def get_scoped_session(user: User = Depends(get_current_user)):
    async with SessionLocal() as session:
        if not user.is_superadmin:
            await session.execute(
                text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                {"tid": user.tenant_id},           # true = solo la transacción actual
            )
        yield session
```
Esto es compatible con transaction-mode pooling (la config muere al terminar la transacción).

### Plan de implementación (Capa 5) — recomendado en fases
1. **Fase A (segura, 1d):** migración Alembic que aplique `ENABLE + FORCE ROW LEVEL SECURITY`
   + políticas `USING/WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true),'')::uuid)`
   en las ~15 tablas transaccionales (sales, sale_items, products, contacts, held_sales, cash, ...).
   **Volver `FORCE` opcional por tabla**: con FORCE, el owner también queda filtrado, así que
   superadmin debe consultar vía `SET LOCAL app.bypass_rls = 'on'` o rol sin FORCE para tablas globales (tenants, subscriptions, plans, audit).
2. **Fase B (1d):** reemplazar `get_session` por `get_scoped_session` (arriba) en los routers
   tenant-scoped, manteniendo `get_session` para control-plane (superadmin/billing).
3. **Fase C (0.5d):** tests — login tenant A no puede leer venta del tenant B ni con SQL directo
   (el test ya existe a nivel API; añadir uno a nivel DB).
4. **Diferir:** PgBouncer self-hosted (Supavisor ya lo cubre).

> **Nota de compatibilidad:** RLS solo aplica en Postgres. Los tests corren sobre Postgres
> (ya configurado), y SQLite de desarrollo no soporta RLS — aceptable porque el aislamiento
> app-layer sigue funcionando ahí.

---

## 6️⃣ Capa 6: Caché & Procesamiento Asíncrono

### Lo que ya existe
- **Redis opcional con degradación total** (`redis_client.py`): login rate-limit + caché de
  reportes (`get_json/set_json`, TTL 30s) + invalidación puntual en ventas
  (`sales.py:213-218`). Never-fail: sin Redis todo sigue funcionando.
- **Mem limits + LRU** en compose (`maxmemory 128mb, allkeys-lru`).

### Gaps
| Requisito | Estado | Notas |
|---|---|---|
| Namespacing `tenant:{id}:{modulo}:{id}` | 🟡 Parcial | Hoy: `reports:summary:{tenant_id}` — tiene tenant en la key (no hay colisión posible) pero no sigue la convención. **Cosmético, no crítico.** |
| Colas de jobs (BullMQ/Inngest) | ❌ No hay workers | No existe ningún trabajo asíncrono hoy. Los candidatos: envío de emails, generación de PDFs, sincronización DIAN, dunning (Capa 4) |
| Worker con `set_current_tenant` por job | ❌ | Depende de que existan colas + RLS |

### Plan de implementación (Capa 6)
1. **(Bajo, 2h)** Renombrar keys a la convención `tenant:{tenant_id}:reports:summary` al crear RLS (no antes; cambiar la key invalida caché en caliente).
2. **(Alto, diferir)** Colas: evaluar **ARQ** (asyncio nativo, encaja con FastAPI) sobre el Redis
   existente cuando aparezca el primer caso real (emails de dunning o facturación electrónica
   DIAN-PT). Introducir un worker sin casos de uso es sobre-ingeniería.

---

## 7️⃣ Capa 7: Observabilidad, Telemetría & Auditoría — **el segundo gap en importancia**

### Lo que ya existe
- `TenantAuditLog` para operaciones superadmin y billing (extend trial, cambio de estado,
  tickets, impersonación, pagos) ✅
- Logs con rotación en Docker + access logs de Caddy ✅
- LoginAttempt como evidencia forense básica de auth ✅

### Gaps
| Requisito | Estado | Impacto |
|---|---|---|
| Logs estructurados con `tenant_id/store_id/trace_id` | ❌ | Solo existe el logger de migraciones. Sin contexto de tenant en logs, diagnosticar "el tenant X reporta lentitud" es ciego |
| Métricas p95/errores por tenant | ❌ | Imposible detectar noisy-neighbor o degradación por cliente |
| OpenTelemetry | ❌ | Sin tracing distribuido |

### Plan de implementación (Capa 7) — el de mejor ratio costo/beneficio
1. **(Bajo, 1d) Logging contextual — la base:**
   - Middleware FastAPI que genera `request_id` (uuid4), lo propaga como `X-Request-ID`
     y llena un `contextvars.ContextVar` con `{tenant_id, user_id, request_id}`.
   - Configurar logging con formato JSON que anexe el contexto de la ContextVar.
   - Resultado: todo `logger.info(...)` sale con `"tenant_id": "...", "trace_id": "..."` sin tocar los routers.
2. **(Bajo, 0.5d)** Log de excepciones 5x con el contexto (mismo middleware, `try/except` global).
3. **(Medio, diferir a escala)** OTel: cuando haya >N tenants activos, instrumentar con
   `opentelemetry-instrumentation-fastapi` + exporter a Grafana Cloud free / Jaeger self-hosted.
   Las métricas por tenant (p95 por plan) salen de los spans ya etiquetados.

---

## 🧭 Roadmap consolidado por prioridad

| # | Acción | Capa | Esfuerzo | Bloquea deploy? |
|---|--------|------|----------|-----------------|
| 1 | Fix IDOR `electronic.py` (chequeo de tenant en venta) | 2 | 30 min | **Sí — seguridad** |
| 2 | Helper `get_tenant_scoped()` + sweep de `session.get()` | 2 | 0.5d | Recomendado |
| 3 | RLS Fase A (migración ENABLE+FORCE + políticas) | 5 | 1d | No (pero es el backstop crítico) |
| 4 | `get_scoped_session` con `set_config(..., true)` | 5 | 1d | No |
| 5 | Logging contextual JSON (request/tenant id) | 7 | 1d | No |
| 6 | Rate-limit global por plan (`rate_limit_rpm` en PlatformPlan) | 1 | 1-2d | No |
| 7 | Webhook Wompi idempotente + dunning automático | 4 | 3-4d | No (falta para SaaS real de pagos) |
| 8 | Tests de aislamiento a nivel DB | 5 | 0.5d | No |
| 9 | OTel + métricas por tenant | 7 | 2-3d | No (a escala) |
| 10 | Colas ARQ + worker con contexto tenant | 6 | diferir | No |
| 11 | Subdominios wildcard por tenant | 1 | diferir | No |
| 12 | WAF delante de Caddy (Cloudflare) | 1 | 0 código | No |

### Decisiones de arquitectura ya tomadas (y justificación)
- **FastAPI DI en vez de AsyncLocalStorage/ContextVar para contexto de negocio** → el framework
  garantiza el scope por request; cero riesgo de fuga de contexto entre workers.
- **Aislamiento app-layer + RLS como backstop** (defensa en profundidad), no solo RLS:
  los mensajes de error y lógica de negocio necesitan saber el tenant de todas formas.
- **Supavisor transaction-mode compatible por diseño** (`NullPool`, `statement_cache_size: 0`):
  la Fase B de RLS (set_config transaccional) es compatible con ese modo de pooling.
- **Redis opcional/never-fail**: Vercel (serverless) corre sin Redis; Docker lo activa.

---

## Cómo leer este documento en el equipo
- **Backend/Plataforma:** Capas 3, 5, 6 (implementación y migraciones).
- **Seguridad/QA:** Capas 2 y 5 (verificación del fix IDOR + tests de aislamiento DB).
- **DevOps:** Capas 1 y 7 (middleware, logging, infra).
- **Producto/Pagos:** Capa 4 (webhook + dunning antes de activar cobros reales).
