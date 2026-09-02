# PRD - AbarrotesPOS Colombia

## Problem statement
Aplicativo POS para tienda de abarrotes en Colombia con manejo de inventario, subida de facturas de compra por foto convertida a datos con IA (OCR), POS sobre inventario, y estructura modular completa DIAN. Debe funcionar en Android y web.

## User personas
- Dueño de tienda de abarrotes (admin operativo)
- Cajero / vendedor
- Administrador / contador

## Core requirements
- POS táctil con búsqueda, código de barras, múltiples métodos de pago y recibo
- Inventario con CRUD, stock, código de barras compatible con lectores Play Store
- Escaneo de facturas de compra con foto → IA extrae ítems → importa a inventario
- Fallback manual para digitar facturas
- Clientes y proveedores CRUD
- Reportes y dashboard con métricas
- PWA responsive para Android y web

## Architecture
- Backend: FastAPI + MongoDB + emergentintegrations (Gemini vision para OCR)
- Frontend: React 19 + Tailwind + shadcn/ui + React Router
- LLM: Gemini 3 Flash (económico, default) y Gemini 3.1 Pro (preciso, opcional)
- Sin autenticación en MVP (por decisión del usuario)

## Implemented (Feb 2026 - v1)
- ✅ Backend endpoints: /api/products (CRUD + barcode), /api/sales, /api/contacts, /api/invoices/ocr, /api/invoices/import, /api/reports/summary, /api/seed
- ✅ Dashboard con estadísticas y gráfica de ventas 7 días
- ✅ POS táctil con carrito, código de barras, 6 métodos de pago, cálculo cambio, recibo
- ✅ Inventario CRUD completo con búsqueda y categorías
- ✅ Escaneo de facturas: dropzone/cámara móvil, selección de modelo Gemini, edición previa, importar al inventario
- ✅ Clientes y Proveedores CRUD compartido
- ✅ Reportes: historial de ventas
- ✅ Sidebar navigation con 22 módulos
- ✅ Responsive con drawer móvil, PWA manifest, colores emerald/terracotta anti-slop

## Implemented (Feb 2026 - v1.1: Fiado)
- ✅ Sale: campos is_credit, balance_due, credit_status
- ✅ POS: método "crédito" con selector obligatorio de cliente
- ✅ Endpoints: /api/credits/summary, /api/credits/customer/{id}, /api/credits/payment, /api/credits/pending-sales
- ✅ POS: categorías dinámicas como chips con conteo desde inventario (/api/categories devuelve name+count+stock)
- ✅ POS: iconos/emojis por categoría (via keyword-matching en /app/frontend/src/lib/categoryIcons.js) en chips y tarjetas de producto
## Implemented (Feb 2026 - v1.2: Categorías avanzadas + Impresión térmica)
- ✅ Backend: colección `category_meta` con emoji custom, pinned y order; endpoints GET/PUT /api/categories/meta
- ✅ /api/categories devuelve pinned primero (ordenados) y luego por conteo desc
- ✅ POS: chips fijados con emoji custom, botón "Iconos y categorías" desde Inventario abre CategoryManager
- ✅ Impresión térmica ESC/POS vía Web Bluetooth (58mm) para recibos POS y abonos de fiado

## P0 Backlog (siguiente fase)
- Facturación Electrónica DIAN (integración con proveedor tecnológico: Facture/Alegra API)
- Certificado Digital (.p12) upload y firma XML
- Órdenes de compra completas con recepción
- Notas Crédito/Débito con XML DIAN
- Créditos (fiado) con abonos y estado de cuenta

## P1 Backlog
- Carga masiva CSV / actualización masiva
- Promociones, ofertas y descuentos aplicables al POS
- Órdenes de venta y cotizaciones convertibles
- Cotizaciones enviables por WhatsApp
- Permisos por rol / múltiples cajas / cajeros

## P2 Backlog
- Nómina electrónica, Radian, Documento Soporte Electrónico
- Recogidas de dinero y arqueo de caja
- Comisiones por vendedor
- Gastos y cuentas por pagar
- Garantías y devoluciones
- Soporte / capacitación in-app

## Known issues (LOW priority)
- DialogContent falta aria-describedby en algunos diálogos (warning console)
