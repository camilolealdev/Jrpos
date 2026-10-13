// JRPOS I01 - Manejador de errores (flujo de errores compartido). Fuente en n8n Workflow SDK.
// Requiere que I02 exista (SUBFLUJO_NOTIFICADOR). No se puede asignar como flujo de errores
// hasta que este flujo este PUBLICADO (restriccion de n8n).
import { workflow, node, trigger, nodeJson, expr } from '@n8n/workflow-sdk';

const TABLA_ERRORES = { __rl: true, mode: 'id', value: 'I31DjgeX1Ynyk5pS', cachedResultName: 'jrpos_error_log' };
const SUBFLUJO_NOTIFICADOR = { __rl: true, mode: 'id', value: 'yQY2jFZ7kyTCw3oi', cachedResultName: 'JRPOS I02 - Notificador central' };

const falla = trigger({
  type: 'n8n-nodes-base.errorTrigger',
  version: 1,
  config: { name: 'Falla de un flujo JRPOS', position: [240, 300] },
  output: [{ workflow: { id: 'abc123', name: 'JRPOS I99 - ejemplo' }, execution: { id: '777', url: 'https://example/execution/777', error: { message: 'Mensaje de error de ejemplo' }, lastNodeExecuted: 'Nodo ejemplo', mode: 'trigger' } }]
});

const darForma = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Dar forma al error',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'e1', name: 'workflow_name', value: expr("{{ $json.workflow?.name || 'desconocido' }}"), type: 'string' },
          { id: 'e2', name: 'workflow_id', value: expr("{{ $json.workflow?.id || '' }}"), type: 'string' },
          { id: 'e3', name: 'execution_id', value: expr("{{ ($json.execution?.id || '').toString() }}"), type: 'string' },
          { id: 'e4', name: 'node_name', value: expr("{{ $json.execution?.lastNodeExecuted || '' }}"), type: 'string' },
          { id: 'e5', name: 'error_message', value: expr("{{ ($json.execution?.error?.message || $json.trigger?.error?.message || 'sin mensaje').toString().slice(0, 500) }}"), type: 'string' },
          { id: 'e6', name: 'execution_url', value: expr("{{ $json.execution?.url || '' }}"), type: 'string' },
          { id: 'e7', name: 'occurred_at', value: expr('{{ $now.toISO() }}'), type: 'string' },
          { id: 'e8', name: 'mensaje_aviso', value: expr("{{ 'ALERTA JRPOS: fallo el flujo \"' + ($json.workflow?.name || 'desconocido') + '\" en el nodo \"' + ($json.execution?.lastNodeExecuted || '?') + '\": ' + ($json.execution?.error?.message || 'sin mensaje').toString().slice(0, 300) + ($json.execution?.url ? ' | ' + $json.execution.url : '') }}"), type: 'string' }
        ]
      }
    },
    position: [480, 300]
  },
  output: [{ workflow_name: 'JRPOS I99 - ejemplo', workflow_id: 'abc123', execution_id: '777', node_name: 'Nodo ejemplo', error_message: 'Mensaje de error de ejemplo', execution_url: 'https://example/execution/777', occurred_at: '2026-10-13T19:00:00.000Z', mensaje_aviso: 'ALERTA JRPOS: fallo el flujo "JRPOS I99 - ejemplo"' }]
});

const guardar = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Guardar en jrpos_error_log',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: TABLA_ERRORES,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          workflow_name: expr('{{ $json.workflow_name }}'),
          workflow_id: expr('{{ $json.workflow_id }}'),
          execution_id: expr('{{ $json.execution_id }}'),
          node_name: expr('{{ $json.node_name }}'),
          error_message: expr('{{ $json.error_message }}'),
          execution_url: expr('{{ $json.execution_url }}'),
          occurred_at: expr('{{ $json.occurred_at }}')
        },
        schema: [
          { id: 'workflow_name', displayName: 'workflow_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'workflow_id', displayName: 'workflow_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'execution_id', displayName: 'execution_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'node_name', displayName: 'node_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'error_message', displayName: 'error_message', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'execution_url', displayName: 'execution_url', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'occurred_at', displayName: 'occurred_at', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true }
        ]
      }
    },
    position: [720, 300]
  },
  output: [{ id: 1, workflow_name: 'JRPOS I99 - ejemplo', workflow_id: 'abc123', execution_id: '777', node_name: 'Nodo ejemplo', error_message: 'Mensaje de error de ejemplo', execution_url: 'https://example/execution/777', occurred_at: '2026-10-13T19:00:00.000Z' }]
});

const avisar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar con el Notificador (I02)',
    onError: 'continueRegularOutput',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: SUBFLUJO_NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'I01-errores',
          tenant_id: 'plataforma',
          channel: 'telegram',
          severity: 'alta',
          message: nodeJson(darForma, 'mensaje_aviso'),
          idempotency_key: expr("{{ 'error:' + $('Dar forma al error').item.json.workflow_id + ':' + $('Dar forma al error').item.json.execution_id }}")
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
    position: [960, 300]
  },
  output: [{ id: 1, status: 'pendiente_canal' }]
});

export default workflow('jrpos-i01-errores', 'JRPOS I01 - Manejador de errores')
  .add(falla)
  .to(darForma)
  .to(guardar)
  .to(avisar);
