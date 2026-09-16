<div align="center">
  <img src="frontend/src/assets/logo.webp" alt="Logo de JRPOS" width="180" />

  # JRPOS 🏪

  ### Sistema POS para Tiendas de Abarrotes en Colombia

  ![Backend](https://img.shields.io/badge/backend-FastAPI-009688) ![Frontend](https://img.shields.io/badge/frontend-React%2019-61DAFB) ![DB](https://img.shields.io/badge/db-PostgreSQL%2016-4169E1) ![PWA](https://img.shields.io/badge/PWA-instalable-5A0FC8)
</div>

Sistema POS integral, modular y 100% responsivo (PWA instalable en dispositivos móviles, tablets y escritorios) diseñado para el comercio minorista y tiendas de abarrotes en Colombia.

<div align="center">
  <img src="frontend/src/assets/hero-banner.webp" alt="Vista previa de JRPOS" width="720" />
</div>

---

## ⚡ Stack Tecnológico (v11.3)

| Capa | Tecnologías |
|---|---|
| **Frontend** | React 19 + Craco + Tailwind CSS + Radix UI / shadcn + TanStack Query + Sonner + Lucide Icons |
| **PWA & Offline-First** | IndexedDB (`jrpos_offline_db`) + Cola de ventas desconectadas + Monitor de red en vivo (`offlineSync.js`) |
| **Código de Barras** | Escáner de cámara (`html5-qrcode`) + Lector óptico físico + Generador de etiquetas para impresión |
| **Ergonomía POS** | Atajos <kbd>F2</kbd>, <kbd>F4</kbd>, <kbd>F9</kbd>, <kbd>Esc</kbd> + Audio feedback (Web Audio API) + Billetes rápidos COP |
| **Backend** | FastAPI (Python), entrypoint real `app.py`, arquitectura modular de 20 routers (`backend/routers/`) |
| **Base de Datos** | PostgreSQL 16+ con SQLAlchemy Async (`asyncpg`) + migraciones automáticas idempotentes (`db_migrations.py`) + Row-Level Security multi-tenant (rol `jrpos_app` sin `SUPERUSER`) |
| **IA / Visión (OCR Facturas)** | Google Gemini 3 Flash / 1.5 Flash Vision para extracción automática de ítems |
| **Seguridad & Auth** | JWT con cookies HttpOnly (`SameSite=None/Lax`), bcrypt, limitador de intentos y RBAC (`admin` / `cajero`) |
| **Facturación Fiscal** | Arquitectura DIAN UBL 2.1 con cálculo CUFE (SHA-384), códigos QR y Web Services SOAP |
| **Impresión** | Impresión Térmica Web Bluetooth / USB ESC-POS (58mm y 80mm) + Pliegos de etiquetas adhesivas A4 |

---

## 📦 Matriz de 28 Módulos Activos

```mermaid
mindmap
  root((JRPOS))
    Operación
      Panel / Dashboard
      POS Venta
      Escanear Factura IA
      Inventario
      Reportes
      Marcación
    Contactos
      Clientes
      Proveedores
    Facturación DIAN
      Facturación Electrónica
      POS Electrónica
      Remisiones
      Nómina Electrónica
      Doc. Soporte
      RADIAN
      Notas Crédito/Débito
      Cuentas de Cobro
      Certificado Digital
    Inventario Avanzado
      Carga Masiva Excel/CSV
      Actualización Masiva
      Promociones y Ofertas
      Control de Merma
    Ventas y Compras
      Órdenes y Cotizaciones
      Garantías y Devoluciones
      Órdenes de Compra
      Créditos Fiados con WhatsApp
      Servicios y Corresponsal
      Caja y Arqueo Cierre Z
      Comisiones de Ventas
      Gastos y Salidas de Caja
      Listas de Precios por Cliente
    Sistema
      Permisos Granulares por Empleado
      Métodos de Pago Personalizables
      Configuración y Personalización
      Soporte y FAQ
```

### 1. Operación
- **Panel (`/dashboard`)**: Resumen de ventas, KPIs diarios, alertas de bajo stock y accesos rápidos.
- **POS Venta (`/pos`)**: Carrito multitarea, retención de cuentas, escáner de código de barras físico y por cámara, pago en efectivo/tarjeta/transferencia/crédito, y emisión de ticket térmico.
- **Escanear Factura IA (`/facturas`)**: OCR de facturas de compra con Gemini Vision; detecta proveedor, NIT y carga productos directamente al inventario.
- **Inventario (`/inventario`)**: Catálogo general, control de stock, costos, precios, unidades de empaque y margen de utilidad.
- **Reportes (`/reportes`)**: Análisis detallado de facturación, desglose de formas de pago y exportación a CSV.
- **Marcación (`/marcacion`)**: Control de asistencia y puntualidad de cajeros y empleados.

### 2. Contactos
- **Clientes (`/clientes`)**: Directorio de clientes, CC/NIT, direcciones y enlace directo para contacto.
- **Proveedores (`/proveedores`)**: Gestión de proveedores de mercancía, NIT y plazos de pago.

### 3. Facturación DIAN & Documentos Fiscales

> ⚠️ **Estado real (sep. 2026):** los módulos marcados **(Simulado)** calculan el CUFE con el algoritmo oficial (SHA-384) y generan XML/UI de práctica, pero **no envían nada a los Web Services reales de la DIAN** ni a un proveedor tecnológico autorizado (Factus, Alegra, Siigo, etc.). `dian_client.send_invoice_sync()` retorna siempre una respuesta `ACCEPTED` hardcoded. No usar para facturar legalmente hasta conectar un proveedor autorizado real.

- **Facturación Electrónica (`/facturacion-electronica`) — Simulado**: Generación de CUFE, XML UBL 2.1 y previsualización de facturas DIAN, sin envío real.
- **POS Electrónica (`/facturacion-pos-electronica`) — Simulado**: Configuración de resolución DIAN para punto de venta.
- **Remisiones (`/remisiones`)**: Guías de entrega y despacho de mercancía — documento interno real (CRUD contra Postgres), no es un documento DIAN.
- **Nómina Electrónica (`/nomina-electronica`) — Simulado**: Cálculo de devengados y deducciones; no genera CUNE ni XML válido, guarda `status="simulada"`.
- **Documento Soporte (`/documento-soporte`)**: Compras a sujetos no obligados a expedir factura — documento interno real.
- **RADIAN (`/radian`) — Simulado**: Lista ventas con CUFE, sin acuse de recibo/aceptación real ante RADIAN.
- **Notas Crédito / Débito (`/notas`)**: Ajustes contables, descuentos y devoluciones vinculadas a facturas — CRUD real.
- **Cuentas de Cobro (`/cuentas-cobro`)**: Emisión de cuentas de cobro para servicios no gravados — CRUD real.
- **Certificado Digital (`/certificado-digital`) — Simulado**: Gestión y carga de certificados `.p12`/`.pfx`; no se usa aún para firmar XML real.

### 4. Inventario Avanzado
- **Carga Masiva (`/carga-masiva`)**: Importador de catálogo desde hojas de cálculo Excel y archivos CSV.
- **Actualización Masiva (`/actualizacion-masiva`)**: Modificación porcentual de precios y costos por categoría.
- **Promociones y Ofertas (`/promociones`)**: Descuentos globales y combos por categoría con vigencia programada.
- **Control de Merma**: Registro de merma/desperdicio por motivo (vencido, roto, derramado, robo, otro) reutilizando el Kardex de movimientos de stock, con reporte desglosado por motivo y por producto en Reportes.

### 5. Ventas, Compras y Caja
- **Órdenes / Cotizaciones (`/ordenes-venta`)**: Elaboración de presupuestos comerciales para clientes.
- **Garantías / Devoluciones (`/garantias`)**: Control de productos defectuosos y cambios de mercancía.
- **Órdenes de Compra (`/ordenes-compra`)**: Solicitudes de pedido a proveedores de insumos.
- **Créditos (Fiados) (`/creditos`)**: Cartera de fiados, abonos parciales y generador de recordatorio por WhatsApp con formato COP.
- **Servicios (`/servicios`)**: Gestión de recargas celulares, corresponsal bancario y pago de facturas de servicios públicos.
- **Caja y Recogidas (`/recogidas`)**: Apertura de turno con base, retiros parciales de efectivo y Arqueo Cierre Z con detección de sobrante/faltante.
- **Comisiones (`/comisiones`)**: Reglas de comisión por vendedor y liquidación de ganancias sobre ventas.
- **Gastos / Pagos (`/gastos`)**: Registro de salidas de dinero por arriendo, servicios, proveedores y mantenimiento.
- **Listas de Precios por Cliente (`/listas-precios`)**: Listas mayorista o de ventana promocional asignables por defecto a un cliente; el POS aplica los overrides automáticamente al seleccionarlo, con fallback al precio normal.

### 6. Sistema
- **Permisos de Usuarios (`/usuarios`)**: Roles Administrador / Cajero / Supervisor / Contador con **override granular por empleado** sobre el rol base — el endpoint `/auth/me` reporta los permisos efectivos (rol + override).
- **Métodos de Pago Personalizables**: Los métodos de pago del POS son configurables por tenant (agregar, renombrar, activar, reordenar) desde Configuración; los 6 métodos históricos (efectivo, Nequi, Daviplata, tarjeta, transferencia, crédito) quedan como default.
- **Configuración (`/configuracion`)**: Razón social, NIT, mensaje de ticket, logotipo de negocio y personalización de temas de color.
- **Soporte (`/soporte`)**: Base de conocimientos, preguntas frecuentes y asistencia técnica.

---

## 🚀 Despliegue en la Nube

**Entrypoint real de la API: `app.py` (`uvicorn app:app`), sobre PostgreSQL.** Es el único que registra los 20 routers de `backend/routers/` y todo lo construido desde la migración a Postgres en adelante (incluye el reset de contraseña de admin, RBAC, etc.).

### Despliegue en VPS con Docker + Traefik — fuente de verdad actual
Ver [`docs/DEPLOY_RUNBOOK.md`](docs/DEPLOY_RUNBOOK.md) para el procedimiento completo. Resumen:
`docker-compose.traefik.yml` levanta el reverse proxy con TLS automático (Let's Encrypt) si tu VPS
todavía no tiene uno corriendo, y `docker-compose.yml` levanta el stack de la app
(`postgres` + `redis` + `backend` + `web`) usando las imágenes publicadas en GHCR por
[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) en cada push a `main`.
Para desarrollo local (build desde código fuente en vez de imágenes de GHCR) usa
`docker-compose.local.yml`.

### Despliegue en Vercel (Frontend & Serverless API) — alterno, no sincronizado activamente
1. Conecta el repositorio GitHub en Vercel.
2. [`vercel.json`](vercel.json) define el servicio `backend` con `"entrypoint": "app:app"` — correcto — y el build del frontend (`CI=false yarn build`) con las reescrituras SPA.
3. Configura las siguientes Variables de Entorno en el panel de Vercel:
   ```env
   DATABASE_URL=postgresql+asyncpg://usuario:password@host:6543/postgres
   JWT_SECRET=tu-clave-secreta-jwt-de-minimo-32-caracteres
   GEMINI_API_KEY=tu-api-key-de-google-gemini
   ADMIN_EMAIL=admin@jrpos.com
   ADMIN_PASSWORD=tu-contraseña-segura
   ```

### Despliegue en Railway (opcional / alterno)
[`Procfile`](backend/Procfile), [`railway.json`](backend/railway.json) y [`Dockerfile`](backend/Dockerfile) ejecutan `uvicorn app:app` — el mismo backend Postgres que Vercel. El proyecto usa **PostgreSQL vía Supabase** como única base de datos; no hay dependencia de MongoDB en el backend activo (el prototipo legado sobre Mongo quedó archivado en [`backend/_legacy_mongo_archive/`](backend/_legacy_mongo_archive/)).

---

## 💻 Entorno de Desarrollo Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/camilolealdev/Jrpos.git
cd Jrpos

# 2. Iniciar Backend (FastAPI)
cd backend
python -m venv venv
# En Windows: venv\Scripts\activate | En Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# 3. Iniciar Frontend (React)
cd ../frontend
npm install --legacy-peer-deps
npm start
```
Accede a `http://localhost:3000` en tu navegador.

---

## 🧭 Estado de Calidad, Auditoría y Deuda Técnica (Actualizado Sep 2026)

Estado verificado mediante suite de pruebas automatizadas y auditoría fullstack:

- ✅ **Test Suite Backend 100% Verde**: 73 pruebas pasadas, 1 omitida, 0 fallidas (`pytest-xdist`).
- ✅ **Test de Regresión de Reset de Contraseña**: Endpoint `PUT /api/users/{id}/reset-password` implementado y blindado con tests de integración (`test_reset_password.py`).
- ✅ **Configuración de Despliegue Unificada**: `backend/Procfile`, `backend/railway.json` y `backend/Dockerfile` ejecutan `app:app` sobre PostgreSQL/Supabase, sincronizado con Vercel.
- ✅ **Seguridad de API Keys de IA & OCR**: `GET /api/settings/general` filtra `ai_api_key` y `ai_base_url` para usuarios no administradores. En frontend, los inputs utilizan enmascaramiento protegido (`type="password"`) con visor condicional.
- ✅ **Cálculo de Precios por Paquete / Sixpack**: Asistente integrado en Inventario y Escáner de Facturas OCR para desglosar costos y precios de venta a partir de sixpacks, paquetes o canastas.
- ✅ **Exportación Contable Fiscal**: Endpoint `/api/reports/accounting-export` con discriminación de Base Gravable, IVA 0%, IVA 5%, IVA 19% y desglose por medios de pago para revisoría fiscal y contadores.
- ✅ **Identidad Visual & Branding**: Logotipos oficiales WebP de alta fidelidad (`logo.webp` y `logo2.webp`), favicons generados y eliminación total de etiquetas de texto de versión redundantes.
- ✅ **Auto-Recuperación de Despliegues Frontend**: Manejador `lazyWithRetry` en `App.js` que previene errores de carga de chunks (`ChunkLoadError`) ante nuevos despliegues.
- 🟠 **Facturación DIAN en Modo Simulación / Sandbox**: El cálculo CUFE (SHA-384) y la estructura UBL 2.1 están listos para integrarse con un proveedor tecnológico o certificado digital en producción.
- ✅ **Aislamiento Multi-Tenant con Row-Level Security**: Políticas RLS en las 33 tablas tenant-scoped de Postgres como segunda capa de defensa (además del filtro por `tenant_id` en el código), con conexión de la app vía rol dedicado sin privilegios de superusuario.
- ✅ **Política de Contraseñas Fuertes**: Validación centralizada (mínimo 8 caracteres, mezcla de tipos, rechazo de contraseñas débiles conocidas) aplicada en registro, alta de usuario y reset de password, con medidor visual en el frontend.
- ✅ **Login con Google**: Onboarding obligatorio para cuentas nuevas vía Google Identity Services, con restricción opcional de dominios de correo permitidos (`REGISTRATION_ALLOWED_DOMAINS`).
- ✅ **Nuevos Módulos (sep. 2026)**: Control de Merma por motivo, Listas de Precios por Cliente (mayorista/ventana promocional), Métodos de Pago Personalizables por tenant y Permisos Granulares por Empleado — cada uno con su propia suite de tests de integración.

---

## 📄 Licencia y Créditos

Desarrollado para el comercio minorista independiente en Colombia. © 2026 JRPOS.

