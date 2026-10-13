// JRPOS F08 - Renovacion y reactivacion. Fuente en n8n Workflow SDK.
// IDs de Data Tables y del subflujo I02 son de la instancia actual; ver n8n/README.md.
import { workflow, node, trigger, ifElse, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const TABLA_CONFIG = { __rl: true, mode: 'id', value: 'zDL8AK31GyRpU4YB', cachedResultName: 'jrpos_config' };
const TABLA_LOG = { __rl: true, mode: 'id', value: 'umCskhDEBOVpZ2XE', cachedResultName: 'jrpos_notification_log' };
const NOTIFICADOR = { __rl: true, mode: 'id', value: 'yQY2jFZ7kyTCw3oi', cachedResultName: 'JRPOS I02 - Notificador central' };

const diario = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Diario 10 am Bogota',
    parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 10, triggerAtMinute: 23 }] } },
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

const listoRenovacion = ifElse({
  version: 2.3,
  config: {
    name: 'Backend configurado (renovaciones)',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.config_value || "" }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [720, 240]
  }
});

const listoInactividad = ifElse({
  version: 2.3,
  config: {
    name: 'Backend configurado (inactividad)',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.config_value || "" }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [720, 640]
  }
});

const sinBackendRenovacion = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin backend (renovaciones)', position: [960, 120] },
  output: [{}]
});

const sinBackendInactividad = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin backend (inactividad)', position: [960, 760] },
  output: [{}]
});

const consultarRenovaciones = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Consultar planes por vencer',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Leer backend_base_url").first().json.config_value }}/api/internal/tenants/renewals'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'days_ahead', value: '5' }] },
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    position: [960, 240]
  },
  output: [{ tenants: [{ tenant_id: 't-demo-1', status: 'active', plan: 'pro', current_period_end: '2026-10-18', days_left: 5, opt_in: true, channel: 'whatsapp', payment_url: 'https://app.invalid/pagar' }] }]
});

const separarRenovaciones = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Separar planes', parameters: { fieldToSplitOut: 'tenants', include: 'noOtherFields' }, position: [1200, 240] },
  output: [{ tenant_id: 't-demo-1', status: 'active', plan: 'pro', current_period_end: '2026-10-18', days_left: 5, opt_in: true, channel: 'whatsapp', payment_url: 'https://app.invalid/pagar' }]
});

const filtroRenovacion = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Vence en 3 a 5 dias con opt-in',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          { leftValue: expr('{{ $json.days_left }}'), operator: { type: 'number', operation: 'lte' }, rightValue: 5 },
          { leftValue: expr('{{ $json.days_left }}'), operator: { type: 'number', operation: 'gte' }, rightValue: 3 },
          { leftValue: expr('{{ $json.opt_in }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' },
          { leftValue: expr('{{ $json.status }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'active' }
        ],
        combinator: 'and'
      }
    },
    position: [1440, 240]
  },
  output: [{ tenant_id: 't-demo-1', status: 'active', current_period_end: '2026-10-18', days_left: 5, opt_in: true, channel: 'whatsapp', payment_url: 'https://app.invalid/pagar' }]
});

const armarRenovacion = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Armar aviso de renovacion',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'r1', name: 'tenant_id', value: expr('{{ $json.tenant_id }}'), type: 'string' },
          { id: 'r2', name: 'channel', value: expr('{{ $json.channel || "whatsapp" }}'), type: 'string' },
          { id: 'r3', name: 'severity', value: 'alta', type: 'string' },
          { id: 'r4', name: 'message', value: expr('{{ "Tu plan de JRPOS vence el " + $json.current_period_end + ". Renueva aqui para no perder el acceso: " + $json.payment_url }}'), type: 'string' },
          { id: 'r5', name: 'idempotency_key', value: expr('{{ "F08:renovacion:" + $json.tenant_id + ":" + $json.current_period_end }}'), type: 'string' }
        ]
      }
    },
    position: [1680, 240]
  },
  output: [{ tenant_id: 't-demo-1', channel: 'whatsapp', severity: 'alta', message: 'Tu plan de JRPOS vence el 2026-10-18.', idempotency_key: 'F08:renovacion:t-demo-1:2026-10-18' }]
});

const yaAvisadoRenovacion = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Renovacion ya avisada',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'idempotency_key', condition: 'eq', keyValue: expr('{{ $json.idempotency_key }}') }] }
    },
    position: [1920, 240]
  },
  output: [{ tenant_id: 't-demo-1', channel: 'whatsapp', severity: 'alta', message: 'Tu plan de JRPOS vence el 2026-10-18.', idempotency_key: 'F08:renovacion:t-demo-1:2026-10-18' }]
});

const avisarRenovacion = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar renovacion (I02)',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'F08-renovacion',
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
    position: [2160, 240]
  },
  output: [{ status: 'pendiente_canal' }]
});

const consultarInactivos = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Consultar tenants sin ventas',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Leer backend_base_url").first().json.config_value }}/api/internal/tenants/inactive'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'days', value: '7' }] },
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    position: [960, 640]
  },
  output: [{ tenants: [{ tenant_id: 't-demo-2', status: 'active', days_without_sales: 9, opt_in: true, channel: 'whatsapp' }] }]
});

const separarInactivos = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Separar inactivos', parameters: { fieldToSplitOut: 'tenants', include: 'noOtherFields' }, position: [1200, 640] },
  output: [{ tenant_id: 't-demo-2', status: 'active', days_without_sales: 9, opt_in: true, channel: 'whatsapp' }]
});

const filtroInactividad = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Activo, 7+ dias sin ventas, con opt-in',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          { leftValue: expr('{{ $json.days_without_sales }}'), operator: { type: 'number', operation: 'gte' }, rightValue: 7 },
          { leftValue: expr('{{ $json.opt_in }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' },
          { leftValue: expr('{{ $json.status }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'active' }
        ],
        combinator: 'and'
      }
    },
    position: [1440, 640]
  },
  output: [{ tenant_id: 't-demo-2', status: 'active', days_without_sales: 9, opt_in: true, channel: 'whatsapp' }]
});

const armarInactividad = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Armar empuje de reactivacion',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'i1', name: 'tenant_id', value: expr('{{ $json.tenant_id }}'), type: 'string' },
          { id: 'i2', name: 'channel', value: expr('{{ $json.channel || "whatsapp" }}'), type: 'string' },
          { id: 'i3', name: 'severity', value: 'info', type: 'string' },
          { id: 'i4', name: 'message', value: expr('{{ "Hace " + $json.days_without_sales + " dias no registras ventas en JRPOS. Si algo no te funciono o necesitas ayuda para retomar, responde este mensaje y te apoyamos." }}'), type: 'string' },
          { id: 'i5', name: 'idempotency_key', value: expr('{{ "F08:inactividad:" + $json.tenant_id + ":" + $now.setZone("America/Bogota").toFormat("kkkk-WW") }}'), type: 'string' }
        ]
      }
    },
    position: [1680, 640]
  },
  output: [{ tenant_id: 't-demo-2', channel: 'whatsapp', severity: 'info', message: 'Hace 9 dias no registras ventas en JRPOS.', idempotency_key: 'F08:inactividad:t-demo-2:2026-42' }]
});

const yaAvisadoInactividad = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Empuje ya enviado esta semana',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'idempotency_key', condition: 'eq', keyValue: expr('{{ $json.idempotency_key }}') }] }
    },
    position: [1920, 640]
  },
  output: [{ tenant_id: 't-demo-2', channel: 'whatsapp', severity: 'info', message: 'Hace 9 dias no registras ventas en JRPOS.', idempotency_key: 'F08:inactividad:t-demo-2:2026-42' }]
});

const avisarInactividad = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Enviar empuje (I02)',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'F08-reactivacion',
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
    position: [2160, 640]
  },
  output: [{ status: 'pendiente_canal' }]
});

const notaConectar = sticky(
  '## MANANA: conectar\n1) Credencial Header Auth "JRPOS Internal Token" (Authorization: Bearer <INTERNAL_API_TOKEN>) en los 2 nodos HTTP y fila backend_base_url en jrpos_config.\n2) Backend: GET /api/internal/tenants/renewals?days_ahead=5 y GET /api/internal/tenants/inactive?days=7 (contrato en n8n/contracts/F08.md). Ambos deben excluir tenants suspendidos o sin opt-in.\n3) Canal: conectar WhatsApp en I02. Plantillas de utilidad: renovacion_plan (con enlace de pago) y reactivacion_inactividad.\n4) Renovacion: una vez por periodo (clave = tenant + fecha fin). Reactivacion: maximo una vez por semana ISO por tenant.\n5) El enlace de pago lo entrega el backend (payment_url); hoy el cobro es manual por Nequi/QR.\n6) Probar con un tenant y numero de prueba; activar solo con confirmacion del propietario.',
  [consultarRenovaciones, consultarInactivos],
  { color: 4 }
);

export default workflow('jrpos-f08-renovacion', 'JRPOS F08 - Renovacion y reactivacion')
  .add(diario)
  .to(leerBase)
  .to(listoRenovacion
    .onTrue(consultarRenovaciones.to(separarRenovaciones.to(filtroRenovacion.to(armarRenovacion.to(yaAvisadoRenovacion.to(avisarRenovacion))))))
    .onFalse(sinBackendRenovacion))
  .add(leerBase)
  .to(listoInactividad
    .onTrue(consultarInactivos.to(separarInactivos.to(filtroInactividad.to(armarInactividad.to(yaAvisadoInactividad.to(avisarInactividad))))))
    .onFalse(sinBackendInactividad))
  .add(notaConectar);
