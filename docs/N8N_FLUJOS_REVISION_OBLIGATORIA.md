# n8n × JRPOS — Catálogo de flujos (REVISIÓN OBLIGATORIA)

> **Regla para toda sesión (humana o agente):** antes de tocar n8n, webhooks, notificaciones,
> mensajería, `/api/internal/*` o cualquier automatización, lee este documento completo y el
> plan [`PLAN_N8N_INTEGRACION_POR_FASES.md`](PLAN_N8N_INTEGRACION_POR_FASES.md). Al terminar,
> actualiza el **estado** de los flujos afectados y el **registro de revisión** del plan.
>
> Última verificación contra código e instancia: **2026-10-13**.
> Leyenda: ✅ existe hoy · 🆕 hay que construirlo · ❓ decisión o dato pendiente.

---

## 1. Reglas de oro

1. **No toques flujos ajenos.** La instancia n8n también aloja flujos de otro proyecto
   (Juancho's Pizza / GastroPro, etiquetas `juanchos` y `produccion`). Jamás los edites,
   actives, desactives ni borres desde trabajo de JRPOS.
2. **n8n opera JRPOS solo por API**, con token de servicio, nunca por conexión directa a la base
   de datos. La BD tiene RLS por tenant; saltarla rompe el aislamiento. No uses la credencial
   `Postgres` ya existente en n8n para JRPOS (es de otro proyecto).
3. **Cero secretos en el repo, en el chat o en los JSON exportados de workflows.** Las
   credenciales viven en n8n; los workflows las referencian por nombre.
4. **Cero datos personales en el repo** (teléfonos, correos, NIT de clientes). Ni en docs, ni
   en tests, ni en ejemplos.
5. **Todo envío es idempotente y consentido**: clave de idempotencia por envío (tabla
   `notification_log` 🆕) y opt-in explícito por tenant (`notification_prefs` 🆕). Sin opt-in,
   no se envía.
6. **Solo se escribe a dueños de tienda y a la plataforma.** Nunca a clientes finales de una
   tienda (por ejemplo, deudores de fiado) hasta que exista número por tienda y se revise la
   licencia de n8n.
7. **Ningún flujo pasa a producción sin cumplir su Definición de Hecho** y el gate de su fase
   (ver plan). Un flujo nace siempre desactivado.
8. **Convención de nombres** (la misma que ya usa la instancia):
   `🟠 PENDIENTE | JRPOS F01 - Ciclo de trial` → `🟢 PRODUCCIÓN | JRPOS F01 - …` →
   `🟡 ANTIGUO | …` → `🔴 REVISAR Y BORRAR | …`. Carpeta `JRPOS`, etiquetas `jrpos`,
   `produccion` / `pendiente` / `revisar-borrar`.
9. **Cambios de JRPOS que afecten a n8n** (endpoints, payloads, estados) se documentan aquí en
   el mismo commit.

## 2. Estado verificado de la instancia n8n (2026-10-13, vía MCP de n8n)

| Dato | Estado |
|---|---|
| Instancia accesible desde las sesiones | ✅ Sí |
| Flujos existentes | 20, todos de otro proyecto (agente de pedidos por WhatsApp de una pizzería, subflujos, versiones antiguas y temporales marcados para borrar). **Ninguno es de JRPOS** |
| Convención de organización | ✅ Carpetas, etiquetas y prefijos con emoji (ver regla 8) |
| Credenciales disponibles (solo tipo) | `openAiApi`, `openRouterApi`, `groqApi`, `googlePalmApi`, `anthropicApi`, `whatsAppApi`, `whatsAppTriggerApi` (×2), `postgres` |
| Telegram | ❓ El flujo "Alertas de error (Telegram)" del otro proyecto está pendiente de credencial y chat. Una vez creadas, JRPOS puede reutilizar la credencial con un chat propio |
| Hosting (cloud o self-hosted) | ❓ **No verificado.** Decide D-02 |
| WhatsApp Cloud API | ✅ El propietario ya opera Cloud API y plantillas con otro número. ❓ Falta decidir si JRPOS usa el mismo WABA con **otro número** o uno propio (D-03) |

Implicación: se reduce el riesgo de la verificación en Meta y de las plantillas, pero **no se
debe mezclar** el número de una pizzería con la mensajería de un SaaS ni con el número de cobro.

## 3. Decisiones

| ID | Decisión | Estado |
|---|---|---|
| D-01 | Canal crítico: **WhatsApp Cloud API oficial** (nodo nativo de n8n). Rechazados Baileys/Evolution/WAHA por riesgo de bloqueo del número | Tomada |
| D-02 | Dónde corre n8n para JRPOS: instancia actual o una nueva autoalojada en el VPS | ❓ Pendiente |
| D-03 | Número y WABA de JRPOS: **recomendado número propio y separado** del de la pizzería y del número de cobro (el de `PAYMENT_WHATSAPP`). Nunca el número de cobro con API no oficial | ❓ Pendiente |
| D-04 | Alcance de mensajes: solo dueños y plataforma. Fiado a deudores se queda en `wa.me` manual | Tomada |
| D-05 | n8n consume `/api/internal/*` con token de servicio; no toca la BD | Tomada |
| D-06 | Webhooks backend → n8n firmados con HMAC (`X-JRPOS-Signature`, marca de tiempo, id de evento) | Tomada |
| D-07 | Email por defecto; WhatsApp solo para lo crítico (trial, cobro, alertas) | Tomada |
| D-08 | Licencia de n8n (Sustainable Use License): leer `LICENSE.md` del repo de n8n. No guardar credenciales de tenants en n8n | ❓ Pendiente |
| D-09 | DIAN real: proveedor tecnológico vs implementación propia | ❓ Pendiente |
| D-10 | Pasarela de pago real (Wompi / Bre-B) vs cobro manual | ❓ Pendiente |
| D-11 | Modelo de OCR por proveedor: correr `scripts/ocr_benchmark.py` con facturas reales | ❓ Pendiente |

## 4. Hechos verificados del backend (base de los flujos)

Todos bajo el prefijo `/api`. Hoy requieren sesión de usuario (cookie/JWT); **no existe aún** una
forma de autenticar a n8n.

| Recurso | Ruta / modelo | Nota |
|---|---|---|
| Resumen del día | `GET /api/reports/summary` ✅ | Por tenant del usuario |
| Exportación contable | `GET /api/reports/accounting-export` ✅ | |
| Merma | `GET /api/reports/merma` ✅ | |
| Cartera | `GET /api/credits/summary`, `/credits/pending-sales`, `/credits/customer/{id}` ✅ | |
| Cierre de caja | `POST /api/cash/close`, `GET /api/cash/session/{id}/z-report` ✅ | |
| Asistencia | `GET /api/timeclock/records` ✅ | |
| Órdenes de compra | `POST /api/purchase-orders` ✅ | Estado inicial `enviada`; **no existe estado borrador** |
| Tenants y trial | `GET /api/superadmin/tenants` ✅, `Tenant.trial_ends_at`, `Tenant.status` ✅ | `expired` es válido en BD, hoy el bloqueo es perezoso (en `auth.py`) |
| Suscripciones | `TenantSubscription.current_period_end` ✅; `POST /api/billing/superadmin/tenants/{id}/activate` ✅ | Cobro manual por Nequi/QR |
| Soporte | `POST /api/support/tickets` ✅, `GET/PUT /api/superadmin/tickets` ✅ | Campos: prioridad, estado, `admin_notes` |
| Registro de tenant | `POST /api/auth/register-tenant` ✅ | Envía correo de bienvenida por SMTP en `BackgroundTasks` |
| Certificado y resolución | `SettingsCertificate.expires`, `SettingsElectronic.fecha_resolucion`, `rango_hasta` ✅ | Texto, no fecha tipada |
| Backup | `scripts/backup-db.sh` ✅ | Cron del host, sin aviso si falla |

**Faltantes conocidos:** `/api/internal/*` 🆕 · `notification_log` 🆕 · `notification_prefs` 🆕 ·
emisor de webhooks firmados 🆕 · stock mínimo por producto (no existe campo) 🆕 · estado borrador
en órdenes de compra 🆕 · email del contador por tenant 🆕 · estado de borrador para OCR 🆕.

## 5. Catálogo de flujos

Estado inicial de todos: 🟠 **PENDIENTE** (no existe ningún flujo de JRPOS en n8n).

### Fase 1A — Infraestructura (sin dependencia de WhatsApp)

| ID | Flujo | Disparador | Datos / acción | Canal | Requiere |
|---|---|---|---|---|---|
| F06 | **Salud del sistema** | Cada 5 min + webhook de GitHub Actions | Ping a `GET /api` ✅, vencimiento del certificado TLS, aviso si falla un workflow en `main` | Telegram | Credencial Telegram ❓ |
| F05 | **Latido de backup** | `backup-db.sh` llama a un webhook | Si no llega latido en 26 h, alerta. Subida fuera del VPS | Telegram | Una línea 🆕 en el script |
| F03 | **Soporte** | Ticket creado (webhook 🆕) | Aviso al superadmin, clasificación de urgencia con IA, nota sugerida vía `PUT /api/superadmin/tickets/{id}` ✅. Recordatorio si abierto > 24 h | Telegram / WhatsApp a ti | Webhook 🆕 |

### Fase 1B — Retención e ingresos (canal al dueño)

| ID | Flujo | Disparador | Datos / acción | Canal | Requiere |
|---|---|---|---|---|---|
| F01 | **Ciclo de vida del trial** | Diario | Avisos en D-5, D-2, D0, D+1 con enlace al paywall. Marca `expired` proactivamente | WhatsApp + email | `/api/internal/tenants/expiring` 🆕, prefs, log |
| F02 | **Reporte diario del dueño** | Diario 8 pm | Ventas, margen, arqueo, fiados y stock bajo, con resumen en lenguaje natural por IA | WhatsApp o email | `/api/internal/tenants/{id}/daily-digest` 🆕. Criterio de "stock bajo" ❓ |
| F04 | **Pago recibido** | Mensaje entrante con comprobante | Reenvía la imagen al superadmin con aprobar/rechazar; aprobar llama a `activate` ✅ y envía recibo | WhatsApp | Entrada de WhatsApp 🆕 |
| F07 | **Onboarding de tenant nuevo** | Registro (webhook 🆕) | Secuencia D0, D1, D3, D7 según actividad real (productos cargados, primera venta) | Email + WhatsApp | `/api/internal/tenants/{id}/activity` 🆕 |
| F08 | **Renovación y reactivación** | Diario | Recordatorio 5 días antes del fin del plan; empuje a tenants sin ventas en 7 días | WhatsApp | Endpoint de actividad 🆕 |

### Fase 2 — Operación por tienda

| ID | Flujo | Datos / acción | Requiere |
|---|---|---|---|
| F09 | **Stock bajo y reposición** | Detecta mínimos, crea borrador de OC y pide aprobación al dueño | Campo `min_stock` 🆕, estado `borrador` en OC 🆕 |
| F10 | **Descuadre de caja** | Al cerrar caja, alerta si la diferencia supera un umbral | Webhook en `/cash/close` 🆕, umbral por tenant ❓ |
| F11 | **Alertas fiscales** | Certificado, rango y resolución por vencer a 30/15/7 días | Endpoint interno 🆕; fechas hoy son texto |
| F12 | **Cartera semanal** | Resumen al dueño de sus mayores deudores con enlaces `wa.me` listos | `/credits/summary` ✅ vía interno 🆕 |
| F13 | **Rotación y merma** | Sin ventas en 90 días y anomalías de merma, semanal | Consulta de rotación 🆕 |
| F14 | **Cierre contable mensual** | Envía `accounting-export` al contador | Email del contador por tenant 🆕 |
| F15 | **Asistencia** | Tardanzas del día al dueño | `/timeclock/records` ✅ vía interno 🆕 |

### Fase 3 — Avanzados (con dependencias externas)

| ID | Flujo | Depende de |
|---|---|---|
| F16 | **Factura por WhatsApp → OCR → borrador → confirmar en la app** | Entrada de mensajes, estado de borrador, teléfono del dueño mapeado al tenant. Idempotencia del import ✅ |
| F17 | **Enriquecimiento nocturno del catálogo** (imagen y categoría) | Reutiliza el caché de `lookup-external` ✅ |
| F18 | **Agente conversacional del dueño**, solo lectura | Endpoints internos de consulta + capa MCP; D-01 |
| F19 | **Emisión DIAN real con reintentos y estados** | D-09 |
| F20 | **Cobro automático por webhook de pasarela** | D-10 |

## 6. Lo que NO va en n8n

`POST /api/sales`, caja, cálculo de precios y descuentos, autenticación y permisos, OCR
síncrono del POS, escaneo y búsqueda de barcode en el POS, y cualquier proceso que deba ser
transaccional o de baja latencia. n8n es para orquestación asíncrona, notificaciones e
integraciones con terceros.

## 7. Seguridad y cumplimiento (checklist por flujo)

- [ ] Credenciales por referencia, nunca en el JSON exportado.
- [ ] Token de servicio rotado y con alcance mínimo; comparación en tiempo constante.
- [ ] Webhook entrante validado (HMAC + marca de tiempo + id de evento no repetido).
- [ ] Idempotencia: el reintento de n8n no duplica envíos ni escrituras.
- [ ] Opt-in verificado antes de cada envío; baja inmediata respetada.
- [ ] Sin datos personales en logs de n8n más allá de los necesarios; retención definida.
- [ ] Plantilla de WhatsApp aprobada (flujos con mensajes proactivos).
- [ ] Manejo de error: falla de n8n **no** bloquea ni retrasa ninguna operación del POS.

## 8. Cómo mantener este documento

- Al crear, activar o retirar un flujo: cambia su estado en las tablas de la sección 5 y anota
  la fecha en el registro de revisión del plan.
- Al descubrir un hecho nuevo del backend o de la instancia: corrige las secciones 2 y 4 con la
  fecha de verificación.
- Si una decisión pasa de ❓ a tomada: actualiza la sección 3.
- Este archivo y el plan se leen **siempre** al inicio de cualquier sesión que toque
  automatización (ver `AGENTS.md`).
