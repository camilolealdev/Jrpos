# JRPOS — Estado de módulos (documento interno)

> Última actualización: Septiembre 2026 · v1.4
> Leyenda: ✅ activo · 🧪 simulado · ⬜ pendiente

---

## ✅ Módulos construidos y probados

| Módulo | Ruta | Backend | Notas |
|---|---|---|---|
| Dashboard | `/dashboard` | `/api/reports/summary` | Ventas hoy, top productos, stock bajo, gráfica 7 días |
| POS Venta | `/pos` | `/api/sales`, `/api/products/barcode/{code}`, `/api/held` | Carrito, 6 métodos de pago, cuentas retenidas multi-cliente, cámara + pistola/Play Store, recibo térmico 58mm |
| Inventario | `/inventario` | CRUD `/api/products` | CRUD completo, gestor de iconos/pin de categorías |
| Escanear Factura (IA) | `/facturas` | `/api/invoices/ocr`, `/api/invoices/import` | Gemini 3 Flash (económico) / 3.1 Pro; fallback manual |
| Clientes | `/clientes` | `/api/contacts?kind=customer` | CRUD |
| Proveedores | `/proveedores` | `/api/contacts?kind=supplier` | CRUD, auto-creado al importar factura |
| Créditos (Fiado) | `/creditos` | `/api/credits/*` | Abonos, estado de cuenta, cartera total |
| Carga Masiva | `/carga-masiva` | `/api/products/bulk` | CSV con plantilla descargable |
| Actualización Masiva | `/actualizacion-masiva` | `/api/products/bulk-update` | % precio/costo, IVA, stock por categoría |
| Gastos/Pagos | `/gastos` | `/api/expenses` | Totales hoy/mes/general |
| POS Electrónica 🧪 | `/facturacion-pos-electronica` | `/api/electronic/*` | CUFE sha256 + XML UBL **SIMULADO** |
| Reportes | `/reportes` | `/api/sales` | Historial + reimpresión térmica |

---

## ⬜ Módulos NO construidos — características necesarias

### 1. Facturación Electrónica DIAN (real)
- **Hoy**: solo POS Electrónica simulada (XML/CUFE de prueba).
- **Necesario**: integración con proveedor tecnológico autorizado (Facture, Alegra API, The Factory HKA), envío a DIAN vía servicio web, manejo de respuesta (CUFE/CUDE válidos, trackId), reintentos, eventos (reclamo, recibo del bien, aceptación expresa), representación gráfica PDF con QR.
- **Dependencias**: cuenta con PT, certificado digital (.p12), resolución DIAN vigente, modo habilitación → producción.

### 2. Remisiones
- **Necesario**: documento sin efecto fiscal para traslados/entregas; conversión de remisión → factura; control de mercancía entregada sin cobrar; consecutivo propio.
- **Modelo sugerido**: `remissions {number, customer_id, items[], status(pendiente|facturada|anulada), sale_id?}`.

### 3. Nómina Electrónica
- **Necesario**: soportes de pago de nómina y notas de ajuste según resolución DIAN 000013; empleados con contratos, devengados (sueldo, horas extra, recargos), deducciones (salud, pensión, libranzas), periodos quincenales/mensuales.
- **Dependencias**: mismo PT que facturación electrónica; **no** incluye dispersión de pagos bancarios.

### 4. Documento Soporte Electrónico
- **Necesario**: compras a personas no obligadas a facturar (ej. compra de cosechas a campesinos); CUDE propio; equivalente a factura pero emitido por el comprador.
- **Dependencias**: PT autorizado, resolución de documento soporte.

### 5. RADIAN
- **Necesario**: registro de facturas como título valor, consulta de eventos, circulación (endoso, cesión). Hoy no hay ningún componente.
- **Dependencias**: PT con integración RADIAN.

### 6. Notas Crédito / Notas Débito
- **Necesario**: desde una venta existente, generar nota con concepto DIAN (devolución, anulación, descuento, error en precio); afecta inventario (re-ingreso de stock en devolución); ajusta fiado si la venta era a crédito; XML/CUFE simulado primero, real después.
- **Modelo sugerido**: `credit_notes {sale_id, type(credito|debito), concept_code, items[], total, cufe?}`.

### 7. Cuentas de Cobro
- **Necesario**: documento equivalente para no obligados; numeración propia; relación con clientes; conversión a venta.
- **Bajo esfuerzo**: clon del flujo de venta POS con numeración `CC-XXXXXX`.

### 8. Promociones / Ofertas / Descuentos
- **Necesario**: reglas (2x1, % por categoría, combo A+B, precio especial por cantidad, fecha vigencia, cliente específico); motor de evaluación en el checkout del POS; exclusividad/acumulación.
- **Modelo sugerido**: `promotions {type, params, category_id?, product_ids[], start, end, active}`.

### 9. Órdenes de Venta / Cotizaciones
- **Necesario**: cotización con validez (días), envío por WhatsApp/PDF, conversión a venta con 1 clic (cargar al carrito POS), estados (borrador, enviada, aceptada, vencida).
- **Cercano a implementar**: reutiliza estructura de `held_sales`.

### 10. Garantías y Devoluciones
- **Necesario**: registro de caso vinculado a venta, motivo, resolución (cambio físico, nota crédito, reparación, rechazo), seguimiento con proveedor, re-ingreso de stock si aplica.

### 11. Órdenes de Compra
- **Necesario**: OC a proveedor con ítems y cantidades, recepción parcial/total que alimenta inventario (conecta con `/api/invoices/import`), estado (enviada, recibida parcial, recibida, anulada), costo esperado vs real.

### 12. Prestación de Servicios
- **Necesario**: ítems tipo servicio (sin stock), agenda/entrega, facturación de servicios con IVA. Para abarrotes aplica poco (ej. recargas, giros).
- **Bajo esfuerzo**: flag `is_service` en productos que omita control de stock.

### 13. Recogidas de Dinero (arqueo de caja)
- **Necesario**: apertura/cierre de caja con base inicial, retiros ("recogidas") con responsable y valor, conteo ciego de efectivo, diferencias, Z-report del día.
- **Modelo sugerido**: `cash_sessions {opened_at, base, pickups[], closed_at, expected, counted, diff}`.

### 14. Comisiones por Productos
- **Necesario**: % o valor por producto/categoría, reporte por vendedor, liquidación por periodo. Requiere usuarios/vendedores (depende de Permisos).

### 15. Permisos de Usuarios / Usuarios ilimitados
- **Necesario**: auth (JWT) con roles (admin, cajero, bodeguero), permisos por módulo, PIN rápido de cajero en POS, auditoría de acciones. **Bloquea**: comisiones, recogidas por cajero, multi-caja.
- **Estado**: el usuario decidió MVP sin auth.

### 16. Cajas ilimitadas
- **Necesario**: registro de cajas (punto físico), asignación de ventas/recogidas a caja, consecutivos por caja. Depende de usuarios.

### 17. Certificado Digital
- **Necesario**: carga de .p12 con contraseña, validación de vigencia, uso para firma XML-DSig en facturación real. Solo aplica cuando se conecte PT DIAN.

### 18. Soporte y Capacitación
- **Necesario**: centro de ayuda in-app, videos cortos por módulo, chat/tickets.
- **Bajo esfuerzo**: página estática con guías + link WhatsApp.

---

## Características transversales pendientes
- **Auth/roles** (bloqueante de varios módulos) · **Ancho 80mm** en impresión térmica · **Recordatorio WhatsApp de fiado** · **Facturación DIAN real** (reemplazar simulado) · **Modo offline** para ventas sin internet (PWA + sync)
