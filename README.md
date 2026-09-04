# JRPOS 🏪 — Sistema POS para Tiendas de Abarrotes en Colombia

Sistema POS integral, modular y 100% responsivo (PWA instalable en dispositivos móviles, tablets y escritorios) diseñado para el comercio minorista y tiendas de abarrotes en Colombia.

---

## ⚡ Stack Tecnológico

| Capa | Tecnologías |
|---|---|
| **Frontend** | React 19 + Craco + Tailwind CSS + Radix UI / shadcn + TanStack Query + Sonner + Lucide Icons |
| **PWA & Offline** | IndexedDB local cache + Cola de sincronización de ventas offline (`offlineSync.js`) |
| **Backend** | FastAPI (Python) con arquitectura modular de 20 routers (`backend/routers/`) |
| **Base de Datos Principal** | PostgreSQL 16+ con SQLAlchemy Async (`asyncpg`) + Migraciones Alembic |
| **Base de Datos Fallback** | MongoDB (Motor Async) en `server.py` |
| **IA / Visión (OCR Facturas)** | Google Gemini 3 Flash / 1.5 Flash Vision para extracción automática de ítems |
| **Seguridad & Auth** | JWT con cookies HttpOnly (`SameSite=None/Lax`), bcrypt, limitador de intentos y RBAC (`admin` / `cajero`) |
| **Facturación Fiscal** | Arquitectura DIAN UBL 2.1 con cálculo CUFE (SHA-384), códigos QR y Web Services SOAP |
| **Impresión** | Impresión Térmica Web Bluetooth / USB ESC-POS (formato 58mm y 80mm) |

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
    Ventas y Compras
      Órdenes y Cotizaciones
      Garantías y Devoluciones
      Órdenes de Compra
      Créditos Fiados con WhatsApp
      Servicios y Corresponsal
      Caja y Arqueo Cierre Z
      Comisiones de Ventas
      Gastos y Salidas de Caja
    Sistema
      Permisos de Usuarios
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
- **Facturación Electrónica (`/facturacion-electronica`)**: Generación de CUFE, XML UBL 2.1 y previsualización de facturas DIAN.
- **POS Electrónica (`/facturacion-pos-electronica`)**: Configuración de resolución DIAN para punto de venta.
- **Remisiones (`/remisiones`)**: Guías de entrega y despacho de mercancía.
- **Nómina Electrónica (`/nomina-electronica`)**: Simulación y cálculo de devengados, deducciones y CUNE.
- **Documento Soporte (`/documento-soporte`)**: Compras a sujetos no obligados a expedir factura.
- **RADIAN (`/radian`)**: Registro de eventos de título valor (acuse de recibo y aceptación).
- **Notas Crédito / Débito (`/notas`)**: Ajustes contables, descuentos y devoluciones vinculadas a facturas.
- **Cuentas de Cobro (`/cuentas-cobro`)**: Emisión de cuentas de cobro para servicios no gravados.
- **Certificado Digital (`/certificado-digital`)**: Gestión y carga de certificados `.p12`/`.pfx` para firma digital.

### 4. Inventario Avanzado
- **Carga Masiva (`/carga-masiva`)**: Importador de catálogo desde hojas de cálculo Excel y archivos CSV.
- **Actualización Masiva (`/actualizacion-masiva`)**: Modificación porcentual de precios y costos por categoría.
- **Promociones y Ofertas (`/promociones`)**: Descuentos globales y combos por categoría con vigencia programada.

### 5. Ventas, Compras y Caja
- **Órdenes / Cotizaciones (`/ordenes-venta`)**: Elaboración de presupuestos comerciales para clientes.
- **Garantías / Devoluciones (`/garantias`)**: Control de productos defectuosos y cambios de mercancía.
- **Órdenes de Compra (`/ordenes-compra`)**: Solicitudes de pedido a proveedores de insumos.
- **Créditos (Fiados) (`/creditos`)**: Cartera de fiados, abonos parciales y generador de recordatorio por WhatsApp con formato COP.
- **Servicios (`/servicios`)**: Gestión de recargas celulares, corresponsal bancario y pago de facturas de servicios públicos.
- **Caja y Recogidas (`/recogidas`)**: Apertura de turno con base, retiros parciales de efectivo y Arqueo Cierre Z con detección de sobrante/faltante.
- **Comisiones (`/comisiones`)**: Reglas de comisión por vendedor y liquidación de ganancias sobre ventas.
- **Gastos / Pagos (`/gastos`)**: Registro de salidas de dinero por arriendo, servicios, proveedores y mantenimiento.

### 6. Sistema
- **Permisos de Usuarios (`/usuarios`)**: Administración de accesos con roles de Administrador y Cajero.
- **Configuración (`/configuracion`)**: Razón social, NIT, mensaje de ticket y personalización de temas.
- **Soporte (`/soporte`)**: Base de conocimientos, preguntas frecuentes y asistencia técnica.

---

## 🚀 Despliegue en la Nube

### Despliegue en Vercel (Frontend & Serverless API)
1. Conecta el repositorio GitHub en Vercel.
2. [`vercel.json`](vercel.json) se encargará automáticamente del build (`CI=false yarn build`) y de las reescrituras SPA.
3. Configura las siguientes Variables de Entorno en el panel de Vercel:
   ```env
   DATABASE_URL=postgresql+asyncpg://usuario:password@host:6543/postgres
   JWT_SECRET=tu-clave-secreta-jwt-de-minimo-32-caracteres
   GEMINI_API_KEY=tu-api-key-de-google-gemini
   ADMIN_EMAIL=admin@jrpos.com
   ADMIN_PASSWORD=tu-contraseña-segura
   ```

### Despliegue en Railway (Backend PostgreSQL)
1. Crea un proyecto en Railway y añade un servicio **PostgreSQL** y un servicio **GitHub Repo**.
2. Railway utilizará el [`Procfile`](backend/Procfile) o [`railway.json`](backend/railway.json) para ejecutar:
   ```bash
   uvicorn app:app --host 0.0.0.0 --port $PORT
   ```

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
yarn install
yarn start
```
Accede a `http://localhost:3000` en tu navegador.
