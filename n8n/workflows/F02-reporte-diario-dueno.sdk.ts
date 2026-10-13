// JRPOS F02 - Reporte diario del dueno. Fuente en n8n Workflow SDK.
// IDs de Data Tables y del subflujo I02 son de la instancia actual; ver n8n/README.md.
import { workflow, node, trigger, ifElse, languageModel, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const TABLA_CONFIG = { __rl: true, mode: 'id', value: 'zDL8AK31GyRpU4YB', cachedResultName: 'jrpos_config' };
const TABLA_LOG = { __rl: true, mode: 'id', value: 'umCskhDEBOVpZ2XE', cachedResultName: 'jrpos_notification_log' };
const NOTIFICADOR = { __rl: true, mode: 'id', value: 'yQY2jFZ7kyTCw3oi', cachedResultName: 'JRPOS I02 - Notificador central' };

const diario = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Diario 8 pm Bogota',
    parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 20, triggerAtMinute: 3 }] } },
    position: [240, 400]
  },
  output: [{}]
});

const leerBase = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer backend_base_url',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLA_CONFIG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'config_key', condition: 'eq', keyValue: 'backend_base_url' }] },
      limit: 1
    },
    position: [480, 400]
  },
  output: [{ id: 6, config_key: 'backend_base_url', config_value: 'https://backend.invalid' }]
});

const backendListo = ifElse({
  version: 2.3,
  config: {
    name: 'Backend configurado',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.config_value || "" }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [720, 400]
  }
});

const sinBackend = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin backend: nada que hacer', position: [960, 560] },
  output: [{}]
});

const listarDuenos = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Listar duenos con reporte',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Leer backend_base_url").first().json.config_value }}/api/internal/tenants/digest-recipients'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    position: [960, 300]
  },
  output: [{ tenants: [{ tenant_id: 't-demo-1', opt_in: true, channel: 'whatsapp' }] }]
});

const separar = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Separar duenos', parameters: { fieldToSplitOut: 'tenants', include: 'noOtherFields' }, position: [1200, 300] },
  output: [{ tenant_id: 't-demo-1', opt_in: true, channel: 'whatsapp' }]
});

const soloOptIn = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Solo con opt-in',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.opt_in }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1440, 300]
  },
  output: [{ tenant_id: 't-demo-1', opt_in: true, channel: 'whatsapp' }]
});

const obtenerResumen = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Obtener resumen del dia',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Leer backend_base_url").first().json.config_value }}/api/internal/tenants/{{ $json.tenant_id }}/daily-digest'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'date', value: expr('{{ $now.setZone("America/Bogota").toFormat("yyyy-LL-dd") }}') }] },
      options: { timeout: 20000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueRegularOutput',
    position: [1680, 300]
  },
  output: [{ tenant_id: 't-demo-1', date: '2026-10-13', currency: 'COP', sales_total: 1250000, sales_count: 42, margin_pct: 31.5, cash: { expected: 980000, counted: 975000, difference: -5000 }, credits_pending_total: 340000, low_stock_count: 3 }]
});

const resumenValido = ifElse({
  version: 2.3,
  config: {
    name: 'Resumen recibido',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.tenant_id || "" }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1920, 300]
  }
});

const descartarError = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Descartado: resumen no disponible', position: [2160, 480] },
  output: [{}]
});

const modeloIA = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatMistralCloud',
  version: 1,
  config: {
    name: 'Modelo de resumen',
    parameters: { model: 'mistral-small-latest', options: { maxTokens: 220 } },
    position: [2160, 520]
  }
});

const resumirIA = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Resumir con IA',
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr('Datos agregados del dia de la tienda (JSON): {{ JSON.stringify({ fecha: $json.date, moneda: $json.currency, ventas_total: $json.sales_total, ventas_cantidad: $json.sales_count, margen_pct: $json.margin_pct, caja: $json.cash, fiados_pendientes_total: $json.credits_pending_total, productos_stock_bajo: $json.low_stock_count }) }}'),
      messages: {
        messageValues: [
          {
            type: 'SystemMessagePromptTemplate',
            message: 'Eres el asistente de JRPOS. Redacta en espanol neutro un resumen del dia para el dueno de una tienda, maximo 5 lineas cortas, tono cercano. Usa SOLO las cifras recibidas, no inventes datos, no menciones nombres de personas ni telefonos. Termina con una sola recomendacion practica.'
          }
        ]
      }
    },
    subnodes: { model: modeloIA },
    position: [2160, 300]
  },
  output: [{ text: 'Hoy vendiste $1.250.000 en 42 ventas con 31,5% de margen.' }]
});

const armarMensaje = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Armar mensaje',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'm1', name: 'tenant_id', value: expr('{{ $("Obtener resumen del dia").item.json.tenant_id }}'), type: 'string' },
          { id: 'm2', name: 'channel', value: expr('{{ $("Separar duenos").item.json.channel || "whatsapp" }}'), type: 'string' },
          { id: 'm3', name: 'idempotency_key', value: expr('{{ "F02:" + $("Obtener resumen del dia").item.json.tenant_id + ":" + $now.setZone("America/Bogota").toFormat("yyyy-LL-dd") }}'), type: 'string' },
          { id: 'm4', name: 'severity', value: 'info', type: 'string' },
          { id: 'm5', name: 'message', value: expr('{{ (() => { const d = $("Obtener resumen del dia").item.json; const ia = ($json.text || "").toString().trim(); if (ia) { return ia.slice(0, 1200); } const f = (n) => "$" + Number(n || 0).toLocaleString("es-CO"); return "Resumen de hoy: ventas " + f(d.sales_total) + " en " + (d.sales_count || 0) + " ventas, margen " + (d.margin_pct || 0) + "%, diferencia de caja " + f(d.cash && d.cash.difference) + ", fiados pendientes " + f(d.credits_pending_total) + ", productos con stock bajo: " + (d.low_stock_count || 0) + "."; })() }}'), type: 'string' },
          { id: 'm6', name: 'origen_texto', value: expr('{{ ($json.text || "").toString().trim() ? "ia" : "plantilla" }}'), type: 'string' }
        ]
      }
    },
    position: [2400, 300]
  },
  output: [{ tenant_id: 't-demo-1', channel: 'whatsapp', idempotency_key: 'F02:t-demo-1:2026-10-13', severity: 'info', message: 'Hoy vendiste $1.250.000 en 42 ventas con 31,5% de margen.', origen_texto: 'ia' }]
});

const yaEnviado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Ya enviado hoy',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'idempotency_key', condition: 'eq', keyValue: expr('{{ $json.idempotency_key }}') }] }
    },
    position: [2640, 300]
  },
  output: [{ tenant_id: 't-demo-1', channel: 'whatsapp', idempotency_key: 'F02:t-demo-1:2026-10-13', severity: 'info', message: 'Hoy vendiste $1.250.000 en 42 ventas con 31,5% de margen.' }]
});

const avisar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Enviar reporte (I02)',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'F02-reporte-diario',
          tenant_id: expr('{{ $json.tenant_id }}'),
          channel: expr('{{ $json.channel }}'),
          severity: expr('{{ $json.severity }}'),
          message: expr('{{ $json.message }}'),
          idempotency_key: expr('{{ $json.idempotency_key }}')
        },
        matchingColumns: [],
        schema: [
          { id: 'flow', displayName: 'flow', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'tenant_id', displayName: 'tenant_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'severity', displayName: 'severity', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'message', displayName: 'message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'idempotency_key', displayName: 'idempotency_key', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
        ],
        attemptToConvertTypes: false
      }
    },
    onError: 'continueRegularOutput',
    position: [2880, 300]
  },
  output: [{ status: 'pendiente_canal' }]
});

const notaConectar = sticky(
  '## MANANA: conectar\n1) Credencial Header Auth "JRPOS Internal Token" (Authorization: Bearer <INTERNAL_API_TOKEN>) en los 2 nodos HTTP.\n2) Rellenar backend_base_url en la Data Table jrpos_config.\n3) Backend: GET /api/internal/tenants/digest-recipients y GET /api/internal/tenants/{id}/daily-digest (contrato en n8n/contracts/F02.md). Las cifras deben coincidir con /api/reports/summary. Definir el criterio de "stock bajo" (hoy el backend devuelve solo low_stock_count).\n4) IA: "Modelo de resumen" es un marcador sin credencial (nodo Mistral elegido a proposito porque no hay credencial Mistral en la instancia y asi no se enlaza una ajena). Sustituirlo por el modelo de tu preferencia (OpenAI/OpenRouter/Groq...) con una credencial propia de JRPOS y reconectarlo a "Resumir con IA"; mantener maxTokens ~220. Sin modelo o si falla, se envia la plantilla de texto fijo.\n5) Canal: conectar WhatsApp/Email en I02; plantilla de WhatsApp de utilidad "reporte_diario" con una variable de texto (limite de 1200 caracteres ya aplicado).\n6) Probar con un tenant y numero de prueba; activar solo con confirmacion del propietario.',
  [leerBase, listarDuenos, obtenerResumen, modeloIA],
  { color: 4 }
);

export default workflow('jrpos-f02-reporte', 'JRPOS F02 - Reporte diario del dueno')
  .add(diario)
  .to(leerBase)
  .to(backendListo
    .onTrue(listarDuenos.to(separar.to(soloOptIn.to(obtenerResumen.to(resumenValido
      .onTrue(resumirIA.to(armarMensaje.to(yaEnviado.to(avisar))))
      .onFalse(descartarError))))))
    .onFalse(sinBackend))
  .add(notaConectar);
