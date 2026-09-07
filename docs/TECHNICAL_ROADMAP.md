# JRPOS — Auditoría de Brechas Técnicas, Deuda y Hoja de Ruta

> **Fecha de Auditoría:** Septiembre 2026  
> **Versión del Sistema:** JRPOS v1.4  
> **Alcance:** Frontend (React 19, Tailwind, Framer Motion), Backend (FastAPI, SQLAlchemy Async, SQLite/PostgreSQL), Integraciones Fiscales y Operativas.

---

## 1. Resumen Ejecutivo del Estado del Sistema

JRPOS cuenta con un núcleo operativo robusto para comercio minorista y mayorista (POS táctil, lector de código de barras, OCR de facturas con Gemini AI, control de fiados/créditos, gastos y reportes básicos). Sin embargo, existen brechas clave para alcanzar el nivel de producción masiva con validación fiscal ante la DIAN y resiliencia offline.

| Área | Estado Actual | Nivel de Madurez | Prioridad de Resolución |
|---|---|---|---|
| **Facturación Electrónica DIAN** | Simulación sintética (CUFE SHA-256 + XML UBL básico) | 🧪 Prototipo / Sandbox | 🔴 Alta |
| **Arqueo y Sesiones de Caja** | Recogidas de efectivo puntuales | 🟡 Parcial | 🔴 Alta |
| **Permisos y Multi-Caja** | Roles `admin` / `cajero` en JWT httpOnly | 🟡 Funcional básico | 🟡 Media |
| **Órdenes de Venta / Cotizaciones** | CRUD base de documentos | 🟡 Funcional | 🟡 Media |
| **Modo Contingencia / Offline** | Dependiente 100% de backend | ⚪ No iniciado | 🟡 Media |
| **Impresión Térmica** | Formato fijo 58mm | 🟡 Funcional | 🟢 Baja |
| **Notificaciones WhatsApp** | Manual | ⚪ No iniciado | 🟢 Baja |
| **Multi-Tenant / SaaS** | Mono-tenant (1 DB por despliegue, sin `tenant_id`) | ⚪ No iniciado | 🟡 Media (post Fase 2) |

---

## 2. Detalle de Brechas Técnicas y Deudas

### 2.1 Facturación Electrónica y Normativa DIAN (Colombia)
- **Brecha Actual**: Los endpoints `/api/electronic/*` y `backend/dian_client.py` calculan CUFE y generan XML UBL 2.1 en modo simulado local sin firma digital X.509 real ni transmisión SOAP a la DIAN.
- **Acciones Requeridas**:
  1. Integrar cliente SOAP o API REST de Proveedor Tecnológico (PT) avalado por la DIAN (ej. The Factory HKA, Alegra API, Facture) o conexión directa mediante WebService DIAN.
  2. Implementar módulo de carga y almacenamiento seguro de certificados digitales (`.p12` / `.pfx`) con encriptación de clave privada.
  3. Soporte para eventos de Facturación Electrónica como Título Valor (RADIAN): Acuse de recibo, Recibo de bienes/servicios y Aceptación expresa.
  4. Generación y descarga de la Representación Gráfica oficial en PDF con código QR bidimensional DIAN y validación en catálogo público.

### 2.2 Control de Caja, Turnos y Prevención de Fugas
- **Brecha Actual**: Se registran recogidas de efectivo individuales, pero no existe el ciclo de **Turnos / Sesiones de Caja**.
- **Acciones Requeridas**:
  1. Tabla `cash_sessions` con: Monto base de apertura, fecha/hora inicio, cajero asignado, estado (`open` / `closed`).
  2. Al cierre de turno: **Conteo ciego de efectivo**, cálculo automático del saldo esperado vs saldo contado, desglose por billetes/monedas y registro de diferencias (sobrantes/faltantes).
  3. Emisión del **Reporte Z de Cierre Fiscal** en tirilla térmica.

### 2.3 Seguridad, Permisos Granulares y Multi-Terminal
- **Brecha Actual**: Los cajeros tienen acceso a varios módulos secundarios o visualización de márgenes de ganancia en algunas vistas.
- **Acciones Requeridas**:
  1. Matriz de permisos granulares por módulo (POS, Inventario, Clientes, Reportes, Configuración, Carga Masiva).
  2. Modo **PIN de Desbloqueo Rápido** en la pantalla del POS para cambio ágil de cajero sin cerrar la sesión de la terminal.
  3. Consecutivos y numeraciones independientes por caja física (Caja 1, Caja 2, etc.).

### 2.4 Documentos Comerciales y Circuitos de Venta
- **Brecha Actual**: Las cotizaciones y remisiones se crean de forma aislada.
- **Acciones Requeridas**:
  1. Botón de **"Convertir a Venta POS"** con un clic desde Cotizaciones y Remisiones (carga directa al carrito con aplicación de descuentos guardados).
  2. Gestión de garantías vinculada al serial o número de factura de la venta original con reingreso automático o desecho de inventario.

### 2.5 Resiliencia Operativa y Modo Offline (PWA)
- **Brecha Actual**: Si la conexión a internet o el servidor local falla, el punto de cobro queda bloqueado.
- **Acciones Requeridas**:
  1. Configuración de Service Worker con almacenamiento en `IndexedDB` para almacenar productos e indexar códigos de barra localmente.
  2. Cola de sincronización (*Background Sync*) para emitir ventas locales con consecutivo de contingencia y sincronizar con el backend al recuperar señal.

### 2.6 Escalabilidad como Plataforma SaaS Multi-Tienda (Visión a Futuro)
- **Brecha Actual**: JRPOS es hoy **mono-tenant**: cada despliegue apunta a una sola base de datos Postgres/Supabase sin columna `tenant_id`/`store_id` en ninguna tabla (`users`, `products`, `sales`, etc. — ver `backend/models_sql.py`), autenticación sin noción de organización, y sin capa de suscripción o facturación del propio SaaS. Escalar a "una instancia, muchas tiendas" hoy exigiría clonar el despliegue completo (DB + backend + env vars) por cada cliente, lo cual no es sostenible más allá de un puñado de comercios.
- **Acciones Requeridas** (orden sugerido, incremental y sin reescritura completa):
  1. **Modelo de datos multi-tenant**: añadir `tenant_id` (o `store_id`) a todas las tablas de negocio y aplicar **Row-Level Security (RLS)** en Supabase/Postgres para aislar datos por tienda a nivel de base de datos, no solo a nivel de aplicación.
  2. **Identidad y sesión con contexto de tenant**: el JWT (`backend/auth.py`) debe portar `tenant_id` además de `role`; todo query de `SessionLocal` debe filtrar por tenant automáticamente (vía middleware/dependency de FastAPI) para evitar fugas de datos entre comercios.
  3. **Aprovisionamiento de tiendas (onboarding self-service)**: flujo de registro que cree tenant + usuario admin inicial + datos semilla (reutilizando el endpoint `/seed` ya existente en `Dashboard.jsx`) sin intervención manual.
  4. **Planes, límites y facturación del SaaS**: capa de suscripción (ej. Stripe) con planes por número de cajas/usuarios/facturas DIAN emitidas al mes, *feature flags* por plan (p. ej. Facturación Electrónica DIAN o Multi-Caja solo en planes pagos) y bloqueo suave al vencer el periodo.
  5. **Aislamiento de secretos por tenant**: cada tienda que active DIAN necesita su propio certificado digital `.p12`/`.pfx` y credenciales de Proveedor Tecnológico — el almacenamiento seguro (ver 2.1) debe ser por-tenant, no global.
  6. **Observabilidad y cuotas**: métricas y rate-limiting por tenant (evitar que una tienda con alto tráfico degrade a las demás en la infraestructura compartida).
- **Nota de secuenciación**: este es un cambio estructural transversal — conviene abordarlo **después** de cerrar las Fases 1–2 del cronograma (Sesiones de Caja, Permisos Granulares, DIAN real), ya que esas features deben nacer ya conscientes de `tenant_id` para no requerir una migración doble. Introducirlo a mitad de esas fases duplicaría trabajo.

---

## 3. Plan de Mitigación y Cronograma Sugerido

```mermaid
gantt
    title Plan de Desarrollo y Cierre de Brechas JRPOS
    dateFormat  YYYY-MM-DD
    section Fase 1 - Operativa
    Sesiones de Caja & Arqueo Ciego     :a1, 2026-09-05, 10d
    Permisos Granulares & PIN POS       :a2, after a1, 7d
    section Fase 2 - Facturación
    Integración PT / DIAN Real         :b1, after a2, 14d
    Certificado Digital & PDF QR       :b2, after b1, 7d
    section Fase 3 - Resiliencia
    Impresión Dual (58mm/80mm)          :c1, 2026-09-15, 5d
    PWA & Modo Offline Contingencia     :c2, after b2, 12d
    section Fase 4 - SaaS Multi-Tienda
    Modelo Multi-Tenant + RLS           :d1, after c2, 14d
    Onboarding Self-Service + Planes    :d2, after d1, 10d
```
