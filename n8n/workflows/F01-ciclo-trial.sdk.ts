// JRPOS F01 - Ciclo de vida del trial. Fuente en n8n Workflow SDK.
// IDs de Data Tables y del subflujo I02 son de la instancia actual; ver n8n/README.md.
import { workflow, node, trigger, ifElse, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const TABLA_CONFIG = { __rl: true, mode: 'id', value: 'zDL8AK31GyRpU4YB', cachedResultName: 'jrpos_config' };
const TABLA_LOG = { __rl: true, mode: 'id', value: 'umCskhDEBOVpZ2XE', cachedResultName: 'jrpos_notification_log' };
const NOTIFICADOR = { __rl: true, mode: 'id', value: 'yQY2jFZ7kyTCw3oi', cachedResultName: 'JRPOS I02 - Notificador central' };

const diario = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Diario 9 am Bogota',
    parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 9, triggerAtMinute: 7 }] } },
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

const consultar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Consultar trials por vencer',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Leer backend_base_url").first().json.config_value }}/api/internal/tenants/expiring'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'days_ahead', value: '5' }, { name: 'days_back', value: '1' }] },
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    position: [960, 300]
  },
  output: [{ tenants: [{ tenant_id: 't-demo-1', status: 'trial', trial_ends_at: '2026-10-18', days_left: 5, opt_in: true, channel: 'whatsapp', paywall_url: 'https://app.invalid/paywall' }] }]
});

const separar = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Separar tenants', parameters: { fieldToSplitOut: 'tenants', include: 'noOtherFields' }, position: [1200, 300] },
  output: [{ tenant_id: 't-demo-1', status: 'trial', trial_ends_at: '2026-10-18', days_left: 5, opt_in: true, channel: 'whatsapp', paywall_url: 'https://app.invalid/paywall' }]
});

const clasificar = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Clasificar etapa',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'c1', name: 'etapa', value: expr('{{ ({ "5": "D-5", "2": "D-2", "0": "D0", "-1": "D+1" })[String($json.days_left)] || "fuera_ventana" }}'), type: 'string' },
          { id: 'c2', name: 'hoy', value: expr('{{ $now.setZone("America/Bogota").toFormat("yyyy-LL-dd") }}'), type: 'string' },
          { id: 'c3', name: 'idempotency_key', value: expr('{{ "F01:" + $json.tenant_id + ":" + (({ "5": "D-5", "2": "D-2", "0": "D0", "-1": "D+1" })[String($json.days_left)] || "fuera_ventana") + ":" + $now.setZone("America/Bogota").toFormat("yyyy-LL-dd") }}'), type: 'string' },
          { id: 'c4', name: 'severity', value: expr('{{ $json.days_left <= 0 ? "alta" : "info" }}'), type: 'string' },
          { id: 'c5', name: 'message', value: expr('{{ $json.days_left > 0 ? "Tu prueba gratis de JRPOS termina en " + $json.days_left + " dias. Elige tu plan aqui para no perder tu operacion: " + $json.paywall_url : ($json.days_left === 0 ? "Tu prueba gratis de JRPOS termina hoy. Elige tu plan aqui para seguir vendiendo sin interrupciones: " + $json.paywall_url : "Tu prueba gratis de JRPOS ya termino. Activa tu plan aqui para recuperar el acceso: " + $json.paywall_url) }}'), type: 'string' },
          { id: 'c6', name: 'debe_expirar', value: expr('{{ $json.days_left < 0 && $json.status === "trial" }}'), type: 'boolean' }
        ]
      }
    },
    position: [1440, 300]
  },
  output: [{ tenant_id: 't-demo-1', status: 'trial', days_left: 5, opt_in: true, channel: 'whatsapp', paywall_url: 'https://app.invalid/paywall', etapa: 'D-5', hoy: '2026-10-13', idempotency_key: 'F01:t-demo-1:D-5:2026-10-13', severity: 'info', message: 'Tu prueba gratis de JRPOS termina en 5 dias. Elige tu plan aqui para no perder tu operacion: https://app.invalid/paywall', debe_expirar: false }]
});

const enVentana = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'En ventana y con opt-in',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          { leftValue: expr('{{ $json.etapa }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'fuera_ventana' },
          { leftValue: expr('{{ $json.opt_in }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' },
          { leftValue: expr('{{ $json.status }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'suspended' }
        ],
        combinator: 'and'
      }
    },
    position: [1680, 200]
  },
  output: [{ tenant_id: 't-demo-1', etapa: 'D-5', idempotency_key: 'F01:t-demo-1:D-5:2026-10-13', severity: 'info', channel: 'whatsapp', message: 'Tu prueba gratis de JRPOS termina en 5 dias.' }]
});

const yaAvisado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Ya avisado hoy',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'idempotency_key', condition: 'eq', keyValue: expr('{{ $json.idempotency_key }}') }] }
    },
    position: [1920, 200]
  },
  output: [{ tenant_id: 't-demo-1', etapa: 'D-5', idempotency_key: 'F01:t-demo-1:D-5:2026-10-13', severity: 'info', channel: 'whatsapp', message: 'Tu prueba gratis de JRPOS termina en 5 dias.' }]
});

const avisar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar al dueno (I02)',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'F01-trial',
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
    position: [2160, 200]
  },
  output: [{ status: 'pendiente_canal' }]
});

const debeExpirar = ifElse({
  version: 2.3,
  config: {
    name: 'Trial vencido sin marcar',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.debe_expirar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1680, 440]
  }
});

const marcarExpirado = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Marcar tenant expirado',
    parameters: {
      method: 'POST',
      url: expr('{{ $("Leer backend_base_url").first().json.config_value }}/api/internal/tenants/{{ $json.tenant_id }}/mark-expired'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ reason: "trial_ended", idempotency_key: "F01-expire:" + $json.tenant_id + ":" + $json.hoy }) }}'),
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueRegularOutput',
    position: [1920, 400]
  },
  output: [{ tenant_id: 't-demo-1', status: 'expired', changed: true }]
});

const sinAccion = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin cambio de estado', position: [1920, 560] },
  output: [{}]
});

const notaConectar = sticky(
  '## MANANA: conectar\n1) Credencial Header Auth "JRPOS Internal Token" (cabecera Authorization: Bearer <INTERNAL_API_TOKEN>) en los 2 nodos HTTP.\n2) Rellenar la fila backend_base_url en la Data Table jrpos_config (URL base sin barra final).\n3) Backend: construir GET /api/internal/tenants/expiring y POST /api/internal/tenants/{id}/mark-expired (contrato en n8n/contracts/F01.md); el backend debe devolver opt_in, channel y paywall_url por tenant.\n4) Canal: conectar WhatsApp en I02 y aprobar 4 plantillas de utilidad (trial_d5, trial_d2, trial_d0, trial_d1) con el texto de "Clasificar etapa".\n5) Probar con un tenant y numero de prueba; activar solo con confirmacion del propietario.',
  [leerBase, consultar, marcarExpirado],
  { color: 4 }
);

export default workflow('jrpos-f01-trial', 'JRPOS F01 - Ciclo de vida del trial')
  .add(diario)
  .to(leerBase)
  .to(backendListo
    .onTrue(consultar.to(separar.to(clasificar.to(enVentana.to(yaAvisado.to(avisar))))))
    .onFalse(sinBackend))
  .add(clasificar)
  .to(debeExpirar.onTrue(marcarExpirado).onFalse(sinAccion))
  .add(notaConectar);
