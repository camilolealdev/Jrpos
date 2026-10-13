# Plan de integración n8n × JRPOS — por fases

> Documento vivo. Se lee junto con
> [`N8N_FLUJOS_REVISION_OBLIGATORIA.md`](N8N_FLUJOS_REVISION_OBLIGATORIA.md) (catálogo, reglas
> de oro, decisiones y hechos verificados). **Si hay contradicción, manda el catálogo.**
>
> Cómo se usa: cada flujo avanza por sus casillas. Una casilla solo se marca con evidencia
> (commit, ejecución de prueba, captura o enlace). Cada fase termina en un **gate de revisión**
> que firma el propietario antes de empezar la siguiente.
>
> Creado: 2026-10-13 · Estado global: **Fase 0 sin iniciar**

---

## 0. Principios del plan

1. **Primero lo que no depende de nadie** (infraestructura y alertas a ti), luego retención e
   ingresos, luego operación por tienda, al final lo avanzado.
2. **Los flujos críticos hacen sondeo/reconciliación; los webhooks solo los aceleran.** Si un
   evento se pierde, el siguiente sondeo lo recupera (F01, F08, F11). Así una caída de n8n o del
   backend no pierde avisos de cobro.
3. **El backend nunca depende de n8n.** Una caída de n8n no puede bloquear ventas, caja ni login.
4. **Un cambio a la vez, verificable y reversible.** Cada flujo nace desactivado, se prueba con
   un tenant y número de prueba, y solo entonces se activa.
5. **Todo cambio de backend lleva tests** y pasa CI antes de que un flujo dependa de él.

## 1. Resumen de fases

| Fase | Contenido | Flujos | Gate |
|---|---|---|---|
| 0 | Fundaciones: decisiones, organización en n8n, capa interna del backend, tablas, repo | — | G0 |
| 1A | Infraestructura y alertas a ti (sin WhatsApp) | F06, F05, F03 | G1A |
| 1B | Retención e ingresos (canal al dueño) | F01, F02, F04, F07, F08 | G1B |
| 2 | Operación por tienda | F09–F15 | G2 |
| 3 | Avanzados | F16–F20 | G3 |

---

## Fase 0 — Fundaciones

Objetivo: dejar el terreno listo para que construir un flujo sea repetible y seguro.

### 0.1 Decisiones (propietario)
- [ ] **D-02** Dónde corre n8n para JRPOS (instancia actual vs. nueva autoalojada).
- [ ] **D-03** Número y WABA de JRPOS, separado del de la pizzería y del de cobro.
- [ ] **D-08** Leer la licencia de n8n y confirmar que el uso (motor interno, sin credenciales de
      tenants, sin exponer n8n a clientes) encaja.
- [ ] Canal de alertas a ti: crear credencial de Telegram y chat propio de JRPOS.

### 0.2 Organización en n8n
- [ ] Carpeta `JRPOS` y etiquetas `jrpos`, `pendiente`, `produccion`, `revisar-borrar`.
- [ ] Credencial de Telegram compartida (si se reutiliza la del otro proyecto, con **chat distinto**).
- [ ] Regla verificada: ningún flujo de otro proyecto se modifica.

### 0.3 Backend: capa interna `/api/internal/*` (propuesta de diseño)
- [ ] Router propio, **desactivado (404) si no existe `INTERNAL_API_TOKEN`**.
- [ ] Autenticación `Authorization: Bearer <token>` con comparación en tiempo constante y
      límite de peticiones.
- [ ] Aislamiento: para listar entre tenants fija el contexto de superadmin; para cualquier dato
      de un tenant fija `app.current_tenant_id` (mismo mecanismo `set_config` que usa `auth.py`).
      **Nunca** devuelve datos de varios tenants mezclados en una misma respuesta de negocio.
- [ ] Endpoints mínimos para Fase 1 (cada uno con test):
      `GET /api/internal/tenants/expiring?days=5` · `GET /api/internal/tenants/{id}/daily-digest` ·
      `GET /api/internal/tenants/{id}/activity` · `POST /api/internal/tenants/{id}/mark-expired`.
- [ ] Documentar rutas, parámetros y respuestas en el catálogo (sección 4).

### 0.4 Backend: tablas de soporte (migración con tests)
- [ ] `notification_prefs` (por tenant): teléfono de notificación, canales, **opt-in con fecha**,
      email del contador (para F14), umbral de descuadre (para F10).
- [ ] `notification_log`: clave de idempotencia única, tenant, flujo, canal, estado, fecha.
- [ ] Endpoint interno para **consultar y registrar** envíos (n8n comprueba antes de enviar).

### 0.5 Backend: eventos hacia n8n (mínimo viable)
- [ ] Emisor best-effort con tiempo límite corto, firmado con HMAC (`X-JRPOS-Signature`, marca de
      tiempo, id de evento). Un fallo se registra y **no** afecta la operación.
- [ ] Eventos iniciales: `ticket.created`, `tenant.registered`, `cash.closed`.
- [ ] Variables de entorno documentadas en `.env.example` (sin valores reales).

### 0.6 Repositorio
- [ ] Carpeta `n8n/workflows/` con un JSON por flujo (`F01-ciclo-trial.json`) y `n8n/README.md`
      con el procedimiento de exportar/importar.
- [ ] Confirmar que los JSON exportados no contienen secretos.

### Gate G0 — se firma cuando
- [ ] D-02, D-03 y D-08 resueltas · [ ] `/api/internal` con tests en verde en CI ·
- [ ] Tablas migradas en un entorno de prueba · [ ] Carpeta y credenciales listas en n8n.

---

## Fase 1A — Infraestructura (F06, F05, F03)

No requiere WhatsApp ni cambios grandes del backend. Empieza aquí para validar el método.

### F06 — Salud del sistema
- **Construcción:** programación cada 5 min → `GET /api` → si falla dos veces seguidas, alerta;
  rama de vencimiento del certificado TLS; webhook de GitHub Actions que avisa si falla
  `Backend Tests` o `Build and Push` en `main`.
- **Integración:** webhook de GitHub apuntando a n8n con secreto; sin cambios en el backend.
- **Hecho cuando:** [ ] se apaga el backend de prueba y llega la alerta en < 10 min ·
  [ ] un workflow de CI rojo genera aviso · [ ] la recuperación genera aviso de "restablecido".

### F05 — Latido de backup
- **Construcción:** webhook que registra el último latido; programación que alerta si pasan
  > 26 h. Opcional: subida fuera del VPS.
- **Integración:** una línea en `scripts/backup-db.sh` que llama al webhook al terminar bien.
- **Hecho cuando:** [ ] backup exitoso → latido registrado · [ ] se omite un día → alerta ·
  [ ] el script sigue funcionando si n8n no responde.

### F03 — Soporte
- **Construcción:** webhook `ticket.created` → aviso al superadmin → clasificación de urgencia
  con IA → `PUT /api/superadmin/tickets/{id}` con nota sugerida; recordatorio si sigue
  `abierto` tras 24 h.
- **Integración:** emisor de eventos (0.5) y credencial de servicio.
- **Hecho cuando:** [ ] ticket de prueba → aviso en < 1 min · [ ] la nota queda guardada ·
  [ ] reintento del webhook no duplica el aviso (idempotencia).

### Gate G1A
- [ ] F06, F05, F03 en producción con las pruebas anteriores · [ ] una semana sin falsos
  positivos graves · [ ] el propietario confirma que las alertas son accionables.

---

## Fase 1B — Retención e ingresos (F01, F02, F04, F07, F08)

Requisitos: G0 y G1A, número de WhatsApp de JRPOS (D-03), plantillas aprobadas, opt-in cargado.

### F01 — Ciclo de vida del trial
- **Plantillas:** aviso D-5, D-2, D0 y D+1 (utilidad, con enlace al paywall).
- **Construcción:** programación diaria → `tenants/expiring` → por tenant: comprobar opt-in y
  `notification_log` → enviar → registrar. Marcar `expired` vía `mark-expired`.
- **Hecho cuando:** [ ] tenant de prueba recibe cada aviso una sola vez · [ ] sin opt-in no se
  envía · [ ] reejecutar el flujo el mismo día no duplica · [ ] estado `expired` coherente con el
  bloqueo existente.

### F02 — Reporte diario del dueño
- **Construcción:** programación diaria (8 pm) → `daily-digest` → resumen por IA con límite de
  costo → envío por canal preferido.
- **Hecho cuando:** [ ] cifras del mensaje coinciden con `/reports/summary` · [ ] el criterio de
  "stock bajo" está definido (ver F09) · [ ] costo de IA por mensaje medido y acotado.

### F04 — Pago recibido
- **Construcción:** mensaje entrante con imagen → reenvío al superadmin con botones →
  aprobar llama a `activate` → recibo al dueño.
- **Hecho cuando:** [ ] solo remitentes conocidos activan el flujo · [ ] aprobar/rechazar deja
  rastro en `tenant_audit_logs` · [ ] doble clic no activa dos veces.

### F07 — Onboarding de tenant nuevo
- **Construcción:** evento `tenant.registered` + sondeo de actividad → secuencia D0/D1/D3/D7
  condicionada a hitos (productos cargados, primera venta).
- **Hecho cuando:** [ ] los mensajes se detienen cuando el hito se cumple · [ ] respeta opt-in.

### F08 — Renovación y reactivación
- **Construcción:** programación diaria → vencimientos a 5 días y tenants sin ventas en 7 días.
- **Hecho cuando:** [ ] sin duplicados · [ ] tenants suspendidos no reciben empujes.

### Gate G1B
- [ ] Cinco flujos en producción · [ ] tasa de entrega y de bajas medida · [ ] ningún mensaje
  duplicado en 14 días · [ ] el propietario valida tono y frecuencia · [ ] coste mensual de
  WhatsApp e IA dentro de lo previsto.

---

## Fase 2 — Operación por tienda (F09–F15)

Un flujo por vez, en este orden de valor/esfuerzo: **F11 → F10 → F12 → F15 → F13 → F14 → F09**.

| Flujo | Trabajo previo en backend | Hecho cuando |
|---|---|---|
| F11 Alertas fiscales | Endpoint interno de vencimientos; fechas tipadas o normalizadas | Avisos a 30/15/7 días sin duplicar |
| F10 Descuadre de caja | Evento `cash.closed`; umbral en prefs | Cierre con diferencia > umbral avisa al instante |
| F12 Cartera semanal | Endpoint interno de cartera por tenant | Resumen al dueño con enlaces `wa.me`; **nada** a deudores |
| F15 Asistencia | Endpoint interno de tardanzas del día | Aviso diario solo si hubo tardanzas |
| F13 Rotación y merma | Consulta de rotación (90 días) | Reporte semanal coherente con `/reports/merma` |
| F14 Cierre contable | Email del contador en prefs | Envío mensual del export, una vez por periodo |
| F09 Stock bajo y reposición | `min_stock` por producto; estado `borrador` en OC; reglas de sugerencia | Borrador de OC creado y **aprobado por el dueño**; nunca se envía solo al proveedor |

### Gate G2
- [ ] Cada flujo cumple su "hecho cuando" · [ ] sin carga apreciable en la API (medir) ·
- [ ] revisión de privacidad de los datos que salen de la tienda.

---

## Fase 3 — Avanzados (F16–F20)

Cada uno requiere un **mini-diseño aprobado** antes de construirse.

- [ ] **F16 Factura por WhatsApp → OCR → borrador:** definir estado de borrador, mapeo teléfono →
      tenant, tope de costo por tenant, confirmación humana obligatoria antes de importar
      (la idempotencia del import ya existe).
- [ ] **F17 Enriquecimiento de catálogo:** por lotes, con tope de llamadas a fuentes externas.
- [ ] **F18 Agente del dueño (solo lectura):** lista cerrada de consultas, sin escritura, con
      aislamiento por tenant demostrado con pruebas.
- [ ] **F19 DIAN real:** depende de D-09; el comprobante se guarda primero y se emite después,
      con estados y reintentos; la venta nunca espera a la DIAN.
- [ ] **F20 Cobro automático:** depende de D-10; verificación de firma de la pasarela e
      idempotencia por referencia de pago.

---

## 2. Definición de Hecho (aplica a todo flujo)

- [ ] Nombre, carpeta y etiquetas según la convención; nace desactivado.
- [ ] Validado (`validate_workflow`) y probado con datos de un tenant de prueba; envíos solo a un
      número de prueba.
- [ ] Idempotente: reejecutarlo no duplica envíos ni escrituras.
- [ ] Opt-in verificado; plantillas aprobadas (si aplica).
- [ ] Manejo de error con aviso a Telegram; no bloquea al backend.
- [ ] JSON exportado en `n8n/workflows/` sin secretos.
- [ ] Tests del backend que lo respaldan, en verde en CI.
- [ ] Catálogo actualizado (estado, endpoints, hechos) y registro de revisión con fecha.
- [ ] Revisión del propietario antes de activar; plan de reversa anotado.

## 3. Cómo construir un flujo con el MCP de n8n (para agentes)

1. Leer el catálogo y este plan; confirmar que el flujo está en la fase y gate correctos.
2. Cargar la referencia del SDK de workflows y las buenas prácticas por técnica **antes** de
   escribir código; buscar nodos y validar configuraciones.
3. Crear el flujo **desactivado**, en la carpeta `JRPOS`, con nombre `🟠 PENDIENTE | JRPOS Fxx - …`.
4. Validar y probar con datos de prueba (datos fijados). Nunca enviar mensajes reales fuera del
   tenant y número de prueba.
5. Exportar el JSON a `n8n/workflows/`, verificar que no hay secretos y commitear junto al
   cambio de backend y los tests.
6. Pedir la revisión del propietario. **Solo con su confirmación explícita** se publica y se
   renombra a `🟢 PRODUCCIÓN | …`.
7. Actualizar el catálogo y el registro de revisión.

## 4. Riesgos y reversa

| Riesgo | Mitigación | Reversa |
|---|---|---|
| Mensajes duplicados o a quien no corresponde | Idempotencia, opt-in, tenant y número de prueba | Desactivar el flujo; revisar `notification_log` |
| Fuga entre tenants | Solo API interna con contexto por tenant; pruebas de aislamiento | Revocar y rotar el token interno |
| Caída de n8n afecta al POS | Backend independiente; webhooks best-effort con tiempo límite | Apagar el emisor de eventos con una variable de entorno |
| Costo de WhatsApp/IA fuera de control | Topes por tenant y por día; medición en cada gate | Desactivar el flujo; bajar topes |
| Edición accidental de flujos ajenos | Regla de oro 1; carpeta y etiquetas | Restaurar versión desde el historial de n8n |
| Bloqueo del número por reportes de spam | Solo dueños con opt-in; plantillas aprobadas; frecuencia moderada | Pausar envíos; revisar calidad del número |

## 5. Registro de revisión

Agrega una fila por cada revisión, activación o cambio relevante. No borres filas.

| Fecha | Fase / flujo | Evento | Evidencia | Revisó |
|---|---|---|---|---|
| 2026-10-13 | Plan y catálogo | Documentos creados. Verificados: rutas y modelos del backend; instancia n8n con flujos de otro proyecto y credenciales existentes | Este commit | — |
