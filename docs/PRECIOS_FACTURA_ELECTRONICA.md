# Precios con y sin factura electrónica

Cada plan de plataforma (`platform_plans`) tiene dos datos extra:

| Columna | Significado |
|---|---|
| `fe_addon_cop` | Incremento **mensual** (COP, sin IVA) sobre el plan base si el cliente quiere factura electrónica. `0` = el plan no ofrece la opción. |
| `fe_docs_year` | Documentos DIAN incluidos **al año** con esa opción. |

Para trimestral y anual el incremento recibe el mismo descuento que el plan base
(`frontend/src/lib/billing.js::fePeriodPrice`), así el total sigue el mismo ahorro por periodo.

**No activa nada:** `dian_enabled` sigue en `FALSE` mientras `DIAN_MODE != real`, el checkout no cobra el
incremento y la landing lo rotula "precio de referencia, se activa cuando conectemos un proveedor autorizado".

Se edita con `POST /api/billing/superadmin/plans` (campos `fe_addon_cop`, `fe_docs_year`). La migración solo
completa los valores si siguen en `0`, así que lo editado por el SuperAdmin no se pisa.

## Valores iniciales

Regla: **margen bruto del 35% sobre el peor costo**, redondeado hacia arriba a $1.000. El peor costo es el paquete
anual de MATIAS API por NIT dividido en 12 más el certificado digital ($104.000 al año por NIT, ~$8.667 al mes).

| Plan | Paquete de referencia (MATIAS) | Anual | / 12 | Peor costo / mes | Incremento | Docs / año | Total / mes (sin IVA) |
|---|---|---|---|---|---|---|---|
| Emprendedor ($49.000) | PYME "Básico", 1.200 docs | $265.000 | $22.083 | $30.750 | **$48.000** | 1.200 | $97.000 |
| Negocio Pro ($89.000) | PYME "Emprendedor", 3.000 docs | $365.000 | $30.417 | $39.083 | **$61.000** | 3.000 | $150.000 |
| Franquicia ($189.000) | "Paquetes por NIT", 15.000 docs | $750.000 | $62.500 | $71.167 | **$110.000** | 15.000 | $299.000 |

Versión anterior (incremento = paquete / 12, sin margen): +$23.000 / +$31.000 / +$63.000. Con el paquete por NIT
al precio público dejaba ~4% / 2% / 1% de margen, y negativo si el certificado se cobra aparte.

## Margen por modelo de costo (cifras de MATIAS sin verificar)

- **M1, pool de casa de software:** unos $40–44 por documento + certificado.
- **M2, paquete por NIT al precio público:** el paquete anual / 12 (el plan PYME incluye certificado).
- **Peor caso:** M2 más certificado aparte.

| Plan | Costo M1 / mes | Costo M2 / mes | Peor costo / mes | Incremento | Margen M1 | Margen M2 | Margen peor caso |
|---|---|---|---|---|---|---|---|
| Emprendedor | $13.067 | $22.083 | $30.750 | $48.000 | 73% | 54% | 36% |
| Pro | $19.667 | $30.417 | $39.083 | $61.000 | 68% | 50% | 36% |
| Franquicia | $58.667 | $62.500 | $71.167 | $110.000 | 47% | 43% | 35% |

## Estado de la referencia (leer antes de publicar)

- **No verificado en la fuente.** Las cifras salen de resúmenes de búsqueda sobre `matias-api.com`; desde el
  entorno de desarrollo el dominio no resuelve y no se pudo leer la página. Hay discrepancias entre páginas
  (una muestra 10.000 docs por $650.000 y $85 por documento adicional). Confirmarlas en el sitio.
- **IVA:** no se sabe si los precios de MATIAS incluyen IVA. Los de JRPOS se publican "+ IVA".
- **Modelo aplicable:** un SaaS que emite a nombre de muchas tiendas suele caer en "Casa de Software" o
  "Paquetes por NIT"; no está confirmado cuál ni si el paquete se comparte entre NIT.
- **Competitividad:** el incremento de Emprendedor casi duplica el plan ($49.000 a $97.000 con factura
  electrónica). Otros POS la traen incluida desde unos $26.000–$80.000 al mes (primera investigación de mercado,
  sin verificar). Validar con clientes reales.
- **Volumen:** una tienda con 40 ventas diarias emite ~14.600 documentos al año; los paquetes de Emprendedor y
  Pro se agotarían. Falta definir qué pasa al exceder el cupo (cobro por documento adicional o bloqueo).
