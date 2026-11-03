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

## Valores iniciales (referencia: MATIAS API)

Emprendedor y Pro: incremento = precio anual del paquete de MATIAS API por NIT dividido en 12, redondeado hacia arriba a $1.000
(**sin margen en el modelo M2**, ver abajo). Franquicia: incremento calculado con un margen bruto objetivo del 35% sobre el peor costo.

| Plan | Paquete de referencia | Anual | / 12 | Incremento | Docs / año | Total / mes (sin IVA) |
|---|---|---|---|---|---|---|
| Emprendedor ($49.000) | PYME "Básico", 1.200 docs | $265.000 | $22.083 | **$23.000** | 1.200 | $72.000 |
| Negocio Pro ($89.000) | PYME "Emprendedor", 3.000 docs | $365.000 | $30.417 | **$31.000** | 3.000 | $120.000 |
| Franquicia ($189.000) | "Paquetes por NIT", 15.000 docs | $750.000 | $62.500 | **$110.000** (ver margen) | 15.000 | $299.000 |

## Estado de la referencia (leer antes de publicar)

- **No verificado en la fuente.** Las cifras salen de resúmenes de búsqueda sobre `matias-api.com`; desde el
  entorno de desarrollo el dominio no resuelve y no se pudo leer la página. Hay discrepancias entre páginas
  (una muestra 10.000 docs por $650.000 y $85 por documento adicional). Confirmarlas en el sitio.
- **IVA:** no se sabe si los precios de MATIAS incluyen IVA. Los de JRPOS se publican "+ IVA".
- **Modelo aplicable:** un SaaS que emite a nombre de muchas tiendas suele caer en "Casa de Software" o
  "Paquetes por NIT"; no está confirmado cuál ni si el paquete se comparte entre NIT.
- **Costo que no está en el incremento:** en el modelo de casa de software el certificado digital se cobra
  aparte (referencia: $104.000 al año por NIT, unos $8.700 al mes).
- **Margen (cifras de MATIAS sin verificar).** Dos modelos de costo posibles para JRPOS:
  - **M1, pool de casa de software:** unos $40–44 por documento + certificado de $104.000 al año por NIT.
  - **M2, paquete por NIT al precio público:** el paquete anual / 12 (en el plan PYME el certificado va incluido; en
    "Paquetes por NIT" no se sabe, por eso el peor caso suma el certificado).

  | Plan | Costo M1 / mes | Costo M2 / mes | M2 + certificado | Incremento | Margen M1 | Margen M2 |
  |---|---|---|---|---|---|---|
  | Emprendedor | $13.067 | $22.083 | $30.750 | $23.000 | 43% | 4% |
  | Pro | $19.667 | $30.417 | $39.083 | $31.000 | 37% | 2% |
  | Franquicia (antes) | $58.667 | $62.500 | $71.167 | $63.000 | 7% | 1% |
  | **Franquicia (ahora)** | $58.667 | $62.500 | $71.167 | **$110.000** | **47%** | **43%** |

  Franquicia pasó de $63.000 a **$110.000** para tener **35% de margen incluso en el peor costo** ($71.167).
  **Emprendedor y Pro dependen de qué modelo aplique:** con M1 dejan 43% y 37%; con M2 quedan en ~0 y, si el
  certificado se cobra aparte, en pérdida. Con la misma regla del 35% sobre el peor costo serían $48.000 y $61.000
  de incremento (totales $97.000 y $150.000). No se aplicó: hay que confirmar primero el modelo real con MATIAS.
- **Volumen:** una tienda con 40 ventas diarias emite ~14.600 documentos al año; los paquetes de Emprendedor y
  Pro se agotarían. Falta definir qué pasa al exceder el cupo (cobro por documento adicional o bloqueo).
