# JRPOS — Matriz de Módulos y Estado del Sistema

> Última actualización: Septiembre 2026
> Leyenda: ✅ Construido y Probado · 🧪 Simulado (Sandbox) · 🔄 En Evolución

---

## 📦 Matriz de los 28 Módulos del Sistema

| Módulo | Ruta | Backend | Estado | Descripción & Capacidades |
|---|---|---|:---:|---|
| **Dashboard** | `/dashboard` | `/api/reports/summary` | ✅ Activo | Métricas hoy, ganancias brutas, margen %, productos activos, stock bajo |
| **POS Venta** | `/pos` | `/api/sales`, `/api/products/barcode/{code}`, `/api/held` | ✅ Activo | Carrito multitarea, retención de cuentas, escáner cámara + pistola, 58mm/80mm, audio feedback |
| **Inventario** | `/inventario` | `/api/products` | ✅ Activo | CRUD, cálculo costo/precio por sixpack/paquete, margen %, código de barras |
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

## 🎯 Próximo Paso para Producción DIAN
- Conexión del conector SOAP y firma digital XAdES-BES con Proveedor Tecnológico (PT) habilitado ante la DIAN para emisión de facturas electrónicas reales con valor legal.

