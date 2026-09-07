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
## Implemented (Sep 2026 - v3.0: TODOS los módulos completos)
- ✅ **Promociones**: CRUD + integración automática al checkout POS (% tienda o % por categoría, línea 🏷 en el total)
- ✅ **Cotizaciones/Remisiones**: CRUD + conversión a venta con 1 clic (descuenta stock, respeta servicios)
- ✅ **Cuentas de Cobro**: numeración CC-XXXXXX, estados pendiente/pagada
- ✅ **Notas Crédito/Débito**: NC/ND-XXXXXX con CUFE simulado, re-ingreso de stock en devoluciones, reduce saldo de fiado
- ✅ **Garantías y Devoluciones**: casos vinculados a venta con estados y resolución
- ✅ **Órdenes de Compra**: OC-XXXXXX a proveedores, recepción suma stock (crea producto si no existe)
- ✅ **Documento Soporte**: DS-XXXXXX con CUDE simulado (compras a no obligados)
- ✅ **Nómina Electrónica**: NOM-XXXXXX con deducción automática 8% (salud+pensión) — simulada
- ✅ **RADIAN**: vista de facturas electrónicas con CUFE — simulada
- ✅ **Certificado Digital**: carga .p12/.pfx (metadata) — simulado
- ✅ **Comisiones**: reglas % por vendedor + liquidación (ventas × %)
- ✅ **Servicios**: producto is_service no descuenta stock (recargas, giros, copias)
- ✅ **Recogidas de Caja**: apertura con base, recogidas, arqueo con conteo ciego y diferencia, historial por cajero
- ✅ Cero placeholders: los 23 módulos del enunciado están activos

## Implemented (Sep 2026 - v2.3: Marcación + fix login)
- ✅ Bug login resuelto: causa = lockout residual del correo viejo + usuario intentando email migrado (camiloleal.opx@gmail.com ya no existe); limpiado y verificado 200 con admin@jrpos.com
- ✅ Módulo Marcación `/marcacion`: reloj en vivo, entrada/salida con bloqueo de doble marca, salida requiere entrada previa del día, detección de tardanza (entry_time + tolerancia), horario programable por admin, reporte por empleado con filtro de fecha (solo admin); cajero solo ve sus marcas. Testing iteration_7: 14/14 pytest + E2E 100%

## Implemented (Sep 2026 - v2.2: Pulido de seguridad y consola)
- ✅ Brute force: 429 + Retry-After: 900 + mensaje claro "Cuenta bloqueada temporalmente..." (lock por cuenta; fix del bug donde el ingress rotaba IPs y el contador se dividía)
- ✅ React Router future flags (v7_startTransition, v7_relativeSplatPath) — warnings de consola eliminados
- ✅ favicon.svg JRPOS + title "JRPOS — POS Tienda de Abarrotes" + theme-color esmeralda + manifest enlazado (adiós 404 de favicon)

## Implemented (Sep 2026 - v2.1: Refresh transparente + Seguridad)
- ✅ Admin migrado a admin@jrpos.com (el viejo email queda rechazado); seed migra el admin existente en vez de duplicar
- ✅ Refresh token transparente: interceptor axios reintenta con /auth/refresh (flag _retried, dedup) y AuthProvider recupera sesión al recargar con access expirado — sin re-login en jornadas largas
- ✅ Seguridad verificada por testing iteration_6: 32/32 pytest + E2E (roles separados, 401/403 correctos, brute force, migración, refresh)

## Implemented (Sep 2026 - v2.0: Auth + Usuarios + Configuración + Soporte)
- ✅ Auth JWT completa: cookies httpOnly (access 8h + refresh 7d), bcrypt, bloqueo brute-force (5 intentos/15min), protección global de /api/* (401 sin sesión), CORS restringido a FRONTEND_URL
- ✅ Admin sembrado: camiloleal.opx@gmail.com / jrpos2026; cajero demo: cajero@jrpos.co / cajero123 (ver memory/test_credentials.md)
- ✅ Roles: admin (todo) y cajero (POS, clientes, créditos, reportes); sidebar filtra módulos adminOnly; /api/users y PUT /settings/general requieren admin (403)
- ✅ Módulo Permisos de Usuarios: crear/listar/eliminar usuarios con rol
- ✅ Módulo Soporte y Capacitación: 6 guías rápidas + WhatsApp soporte
- ✅ Configuración General: nombre tienda (aparece en sidebar), pie de recibo, IVA default, ancho impresora 58/80mm, 5 colores de acento con swatches, WhatsApp soporte
- ✅ README.md actualizado para GitHub (stack, módulos, env, despliegue)

## Implemented (Sep 2026 - v1.6: WhatsApp + Responsive 100%)
- ✅ Recordatorio WhatsApp de fiado: botón en lista de deudores y en estado de cuenta; mensaje con nombre, saldo, facturas y fecha más antigua; normaliza celular CO (10 dígitos → +57); toast si no hay teléfono válido
- ✅ Testing iteration_4: 100% frontend (wa.me URL verificada, stopPropagation, toast sin teléfono, regresión abonos/POS)
- ✅ Auditoría responsive móvil 375px: 7/7 páginas sin overflow horizontal (fix: tarjetas de totales apiladas en Gastos y Créditos)

## Implemented (Sep 2026 - v1.5: Documentación + Onboarding)
- ✅ `/app/docs/MODULOS_PENDIENTES.md`: MD interno con los 18 módulos no construidos, características necesarias, modelos sugeridos y dependencias (DIAN, auth, etc.)
- ✅ Onboarding con driver.js: tour guiado de 14 pasos por todos los módulos activos; auto-inicia en primera visita (desktop) y botón ❓ "Guía" en el header para repetirlo
- ✅ Commit local `20dbeee`; push bloqueado: no hay remote `origin` configurado (conectar GitHub desde Emergent UI)

## Implemented (Sep 2026 - v1.4: Escáner por cámara)
- ✅ Componente CameraScanner (html5-qrcode): lee EAN-13/Code128/QR con cámara trasera del celular
- ✅ Botón "📷 Cámara" en POS junto al input de código; al leer un código válido busca el producto y lo agrega al carrito con toast
## Implemented (Sep 2026 - v3.2: Branding Oficial, Auditoría Fullstack & Precios por Paquete)
- ✅ **Branding Oficial**: Logotipos vectoriales/WebP optimizados (`logo.webp` negro y `logo2.webp` blanco con transparencia), favicons multi-resolución y eliminación de badges de versión redundantes en el sitio y app.
- ✅ **Costo y Precio por Paquete / Sixpack**: Asistente en Inventario y Facturas OCR para desglosar unidades por empaque (6, 12, 24, 30) y calcular costo y precio unitario con margen comercial.
- ✅ **Seguridad de Claves IA/OCR**: Ocultamiento de API Keys en Configuración (`type="password"` con alternador de visibilidad) y filtrado en backend para usuarios no administradores.
- ✅ **Exportación Fiscal y Contable**: Endpoint `/api/reports/accounting-export` con desglose de Base Gravable, IVA 0/5/19% y métodos de pago.
- ✅ **Test Suite 100% Verde**: 73 pruebas automatizadas pasando con éxito en backend (auth, roles, reset password, timeclock, ventas, inventario).
- ✅ **Resiliencia Frontend**: `lazyWithRetry` en `App.js` para auto-recuperar sesiones ante nuevos despliegues de Vercel sin ChunkLoadError.

---

## 🎯 Next Steps
- Conexión del conector de emisión real DIAN con Proveedor Tecnológico (PT) mediante certificado digital en producción.
- ✅ Testing iteration_3: 9/9 backend pytest + UI e2e 100%

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
