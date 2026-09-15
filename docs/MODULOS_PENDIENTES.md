# JRPOS — Matriz de Módulos y Estado del Sistema

> Última actualización: 11 de septiembre 2026 (Sprint Multi-Tenant en curso)
> Leyenda: ✅ Construido y Probado · 🧪 Simulado (Sandbox) · 🔄 En Evolución · 🔨 En Desarrollo (código sin integrar)

---

## 📦 Matriz de los 28 Módulos del Sistema

| Módulo | Ruta | Backend | Estado | Descripción & Capacidades |
|---|---|---|:---:|---|
| **Dashboard** | `/dashboard` | `/api/reports/summary` | ✅ Activo | Métricas hoy, ganancias brutas, margen %, productos activos, stock bajo |
| **POS Venta** | `/pos` | `/api/sales`, `/api/products/barcode/{code}`, `/api/held` | ✅ Activo | Carrito multitarea, retención de cuentas, escáner cámara + pistola, 58mm/80mm, audio feedback. Respeta `pack_only`: productos marcados "solo por paquete" se venden siempre cerrados (precio = unidad × unidades/paquete) y muestran badge "Solo x paquete" |
| **Inventario** | `/inventario` | `/api/products` | ✅ Activo | CRUD, cálculo costo/precio por sixpack/paquete, margen %, código de barras. Nuevo flag `pack_only` (producto que nunca se vende suelto, ej. pack cerrado), campo `units_per_package` siempre editable y stock en paquetes que se convierte automático a unidades (stock se guarda SIEMPRE en unidades) |
| **Escanear Factura (IA)** | `/facturas` | `/api/invoices/ocr`, `/api/invoices/import` | ✅ Activo | OCR con Gemini / Groq / OpenRouter / NVIDIA; detecta ítems, costos e importa a inventario |
| **Clientes** | `/clientes` | `/api/contacts?kind=customer` | ✅ Activo | Directorio de clientes, CC/NIT, direcciones, teléfono y crédito |
| **Proveedores** | `/proveedores` | `/api/contacts?kind=supplier` | ✅ Activo | Directorio de proveedores, plazos de pago y compras |
| **Créditos (Fiado)** | `/creditos` | `/api/credits/*` | ✅ Activo | Cartera de fiados, abonos parciales, estado de cuenta y recordatorios por WhatsApp en COP |
| **Marcación** | `/marcacion` | `/api/timeclock/*` | ✅ Activo | Control de asistencia, horarios programables, detección automática de retardos |
| **Facturación Electrónica** | `/facturacion-electronica` | `/api/electronic/*`, `dian_client.py` | 🧪 Simulado | Algoritmo CUFE SHA-384, estructura UBL 2.1 y visor de documentos DIAN en Sandbox |
| **POS Electrónica** | `/facturacion-pos-electronica` | `/api/electronic/settings` | 🧪 Simulado | Configuración de resolución DIAN para POS electrónico |
| **Remisiones** | `/remisiones` | `/api/documents?type=remisiones` | ✅ Activo | Guías de entrega y despacho sin efecto fiscal |
| **Nómina Electrónica** | `/nomina-electronica` | `/api/payroll/*` | 🧪 Simulado | Liquidación de devengados y deducciones para nómina |
| **Documento Soporte** | `/documento-soporte` | `/api/support-docs/*` | ✅ Activo | Compras a no obligados a facturar |
| **RADIAN** | `/radian` | `/api/electronic/radian` | 🧪 Simulado | Registro y eventos de facturas electrónicas como título valor |
| **Notas Crédito / Débito** | `/notas` | `/api/credit-notes/*` | ✅ Activo | Devoluciones, descuentos y ajustes contables |
| **Cuentas de Cobro** | `/cuentas-cobro` | `/api/documents?type=cuentas` | ✅ Activo | Emisión de cuentas de cobro para personas naturales / servicios |
| **Certificado Digital** | `/certificado-digital` | `/api/settings/certificate` | 🧪 Simulado | Carga y verificación de vigencia de certificados `.p12`/`.pfx` |
| **Carga Masiva** | `/carga-masiva` | `/api/products/bulk` | ✅ Activo | Importador masivo de catálogo desde Excel y CSV |
| **Actualización Masiva** | `/actualizacion-masiva` | `/api/products/bulk-update` | ✅ Activo | Ajuste porcentual de precios, costos e IVA por categorías |
| **Promociones y Ofertas** | `/promociones` | `/api/promotions` | ✅ Activo | Descuentos globales y combos por categoría con vigencia |
| **Órdenes y Cotizaciones** | `/ordenes-venta` | `/api/documents?type=cotizaciones` | ✅ Activo | Cotizaciones comerciales para clientes |
| **Garantías y Devoluciones** | `/garantias` | `/api/warranties` | ✅ Activo | Gestión de cambios de mercancía y productos defectuosos |
| **Órdenes de Compra** | `/ordenes-compra` | `/api/purchase-orders` | ✅ Activo | Pedidos a proveedores y recepción de mercancía |
| **Servicios y Corresponsal** | `/servicios` | `/api/services/*` | ✅ Activo | Recargas, corresponsal bancario y pago de servicios públicos |
| **Caja y Recogidas** | `/recogidas` | `/api/cash-sessions`, `/api/cash-pickups` | ✅ Activo | Base inicial, retiros parciales y Arqueo Cierre Z |
| **Comisiones** | `/comisiones` | `/api/commissions/*` | ✅ Activo | Reglas de comisión por vendedor y liquidación |
| **Gastos / Pagos** | `/gastos` | `/api/expenses` | ✅ Activo | Registro de egresos operacionales (arriendo, servicios, insumos) |
| **Reportes & Exportación** | `/reportes` | `/api/reports/accounting-export` | ✅ Activo | Historial de ventas, reimpresión térmica y exportación fiscal contable (Base + IVA 0/5/19%) |
| **Permisos de Usuarios** | `/usuarios` | `/api/users/*` | ✅ Activo | Roles Admin / Cajero, reseteo seguro de contraseña y bloqueo por fuerza bruta |
| **Configuración** | `/configuracion` | `/api/settings/general` | ✅ Activo | Datos comerciales, NIT, tema de color, ancho de ticket, credenciales IA seguras |
| **Soporte** | `/soporte` | `/api/support` | ✅ Activo | Preguntas frecuentes, atajos de teclado y canales de atención |

---

## 🏢 Plataforma SaaS Multi-Tenant (Fase 1 en curso)

| Módulo | Ruta | Backend | Estado | Descripción & Capacidades |
|---|---|---|:---:|---|
| **Registro Self-Service** | `/registro` | `/api/auth/register-tenant` | ✅ Activo | Onboarding de tienda en 2 min, trial automático sin tarjeta |
| **Paywall / Activación** | `/paywall` | `/api/billing/payment-info`, `/api/billing/activate` | ✅ Activo | Página de pago Nequi (QR + WhatsApp) registrada en App.js y conectada al gate 403: redirect desde interceptor, sesión restaurada y post-login (incluye trial vencido por fecha) |
| **Planes de Plataforma** | — | `/api/billing/payment-info` (público) | ✅ Activo | Catálogo `PlatformPlan` con precios COP, filtrado correcto por `is_active` |
| **Panel SuperAdmin** | `/superadmin` | `/api/superadmin/*` | ✅ Activo | MRR estimado, tenants con estado, gestión de suscripciones y soporte. Protegido con `SuperAdminRoute` (`superadmin_platform`). Pestañas navegables por query param (`/superadmin?tab=tickets` / `?tab=assisted`), sidebar con deep-links por sección y modo SuperAdmin activo SOLO para `superadmin_platform` (los `admin` ya no ven el switcher). Todas las llamadas migradas de `axios` crudo al cliente `api` compartido (interceptores + cookies centralizados) |
| **Auditoría Tenant** | — | `tenant_audit_logs` (modelo) | ✅ Activo | Helper `_audit()` en `superadmin.py` usado en `extend_trial`, `update_status`, `update_support_ticket` e `impersonate`; además de la escritura en `billing.py` (activación) |
| **Gate de Suscripción** | — | `auth.py get_current_user` | ✅ Activo | Bloqueo 403 automático ante trial vencido / tenant `suspended` / `cancelled` |

---

## 🎯 Próximo Paso para Producción DIAN
- Conexión del conector SOAP y firma digital XAdES-BES con Proveedor Tecnológico (PT) habilitado ante la DIAN para emisión de facturas electrónicas reales con valor legal.

## ✅ Resueltas esta sesión (14 sep 2026)
1. **Auditoría de arquitectura actualizada** (`ANALISIS_ARQUITECTURA_7_CAPAS.md`): IDOR electronic.py (commit `d6c5347`), sweep de `session.get()` (limpio, 9 routers), RLS Fase A+B+C y logging contextual Capa 7 (`observability.py`) ya estaban resueltos por la sesión anterior — docs marcados como RESUELTO. Roadmap pendiente real: rate-limit por plan, webhook Wompi+dunning, OTel (diferir).
2. **Trial 15 días**: default `TRIAL_DAYS` de 365 → 15 (`auth.py`, corregido de 30 → 15 por decisión del dueño). Coincide con el texto del frontend ("15 días gratis").
3. **Registro con dominios restringidos**: env `REGISTRATION_ALLOWED_DOMAINS` (coma-separada). Vacío = cualquier dominio (backwards compatible). Aplica a `/auth/register-tenant` y al onboarding de `/auth/google` (solo nuevas tiendas, no logins existentes). Test unitario `test_registration_domain_allowlist`.
4. **SMTP + correo de bienvenida**: nuevo `backend/mailer.py` (stdlib, best-effort, nunca lanza). Env `SMTP_HOST/PORT/USER/PASSWORD/FROM`. Se dispara vía BackgroundTasks al registrar (email/password y Google).
5. **Claves de IA/OCR de plataforma (fijas)**: el fallback por env `{PROVIDER}_API_KEY` ya existía (invoices.py); ahora con anti-abuso: cupo diario por tenant al usar clave de plataforma (`OCR_PLATFORM_DAILY_LIMIT`, default 50, Redis rate_limit no-op sin Redis) + `platform_ai_keys` (booleanos por proveedor, nunca valores) expuesto en GET `/settings/general` + banner ámbar en Settings.jsx explicando que es sin garantía hasta que el cliente configure su propia clave.
6. **PWA instalable**: ya existía (manifest.json + sw.js + icons + registro SW en index.html). Se añadió `InstallAppButton.jsx` (beforeinstallprompt nativo Android/Chrome + guía iOS "Añadir a pantalla de inicio") visible en Login.
7. Suite: **103 passed** contra stack Docker vivo (Postgres+RLS). Frontend: `npm run build` OK.

**Pendiente para deploy:** rebuild de imágenes (el contenedor backend corre código anterior: `docker compose build && docker compose up -d`) y definir las env vars nuevas en `.env` del VPS.

## ✅ Resueltas esta sesión (11 sept 2026)
1. ~~Categorías compartidas entre tenants~~ **RESUELTO** — `category_meta` ahora tiene clave primaria compuesta `(tenant_id, name)` (modelo + migración idempotente en `db_migrations.py`). Antes la PK era solo `name`, así que una categoría creada por una tienda bloqueaba la misma en otra (upsert colisionaba). Migración: respaldo de `tenant_id` a `tenant-default-001`, `SET NOT NULL` y swap de constraint con `DO $$ ... EXCEPTION WHEN OTHERS THEN NULL` para ser idempotente. Los upserts (`products.py::upsert_category_meta` y `seed_admin`/`seed_data`) ahora consultan por `(name, tenant_id)` en vez de `session.get()` por PK simple.
2. **Nuevo flag `pack_only` en productos** (columna `pack_only BOOLEAN NOT NULL DEFAULT FALSE` con migración idempotente): permite marcar productos que SOLO se venden por paquete/caja completo (ej: six-pack cerrado). El POS lo respeta — click normal vende el paquete, badge cambia a "Solo x paquete", y el precio mostrado es el del paquete completo. La carga masiva NO toca `pack_only` para no borrar flags manuales en reimportaciones (comentario explícito en `bulk_load_products`).
3. **SuperAdmin hardening + deep-links**: el modo SuperAdmin y el switcher del sidebar ahora son exclusivos de `superadmin_platform` (antes cualquier `admin` podía activarlo). El panel usa `useSearchParams` para pestañas deep-linkables y todas las llamadas pasaron de `axios` con `withCredentials` manual al cliente `api` compartido.
4. **Stock en paquetes en Inventario**: al crear/editar con la calculadora de paquete activada puedes indicar cuántas cajas recibiste (`stock_packages`) y se convierte a unidades (`paquetes × units_per_package`). `stock` sigue guardándose siempre en unidades; `units_per_package` y `pack_only` se envían siempre al backend aunque la calculadora de % utilidad esté apagada (son atributos del producto, no de la calculadora).

## ✅ Resueltas esta sesión (Sprint anterior)
1. ~~Paywall sin ruta~~: `/paywall` registrado en `App.js` (fuera de los gates de app protegida) + redirect al paywall desde interceptor 403 (`lib/api.js`), restauración de sesión (`lib/auth.jsx`) y post-login (`Login.jsx`, incluye comparación de `trial_ends_at`).
2. ~~SuperAdminRoute sin uso~~: ruta `/superadmin` ahora usa `SuperAdminRoute`.
3. ~~**Pendiente:** Login 500 en producción~~ **RESUELTO** — causa raíz identificada y corregida: `DATABASE_URL` tenía la URL del proyecto Supabase (`https://...supabase.co`) en vez del connection string Postgres del pooler. Corregir la variable en Vercel → Settings → Environment Variables (ver `docs/DEPLOY_RUNBOOK.md` § 3). Suite de tests local: **72 passed / 2 skipped**.

## 🗺️ Análisis de arquitectura (nuevo)

**`docs/ANALISIS_ARQUITECTURA_7_CAPAS.md`** — Gap analysis contra la arquitectura ecosistémica objetivo de 7 capas (Edge → IAM → Middleware → Dominio → RLS → Async → Observabilidad). Hallazgos clave:

- **🔴 URGENTE:** IDOR cross-tenant en `backend/routers/electronic.py` (falta chequeo de `tenant_id` al resolver la venta) — fix de 30 min, ver doc §2.
- **🟡 Gap principal:** sin RLS en Postgres (Capa 5) — aislamiento hoy solo a nivel aplicación; plan por fases A/B/C con `set_config('app.current_tenant_id', ..., true)` compatible con Supavisor.
- **🟡 Faltan para SaaS real:** webhook Wompi idempotente + dunning automático (Capa 4), rate-limit por plan (Capa 1), logging contextual JSON con `tenant_id/trace_id` (Capa 7).
- Incluye roadmap priorizado (12 acciones con esfuerzo y si bloquean deploy) y reparto por rol del equipo.

