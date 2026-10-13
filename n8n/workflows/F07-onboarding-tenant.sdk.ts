// JRPOS F07 - Onboarding de tenant nuevo. Fuente en n8n Workflow SDK.
// IDs de Data Tables y del subflujo I02 son de la instancia actual; ver n8n/README.md.
import { workflow, node, trigger, ifElse, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const TABLA_CONFIG = { __rl: true, mode: 'id', value: 'zDL8AK31GyRpU4YB', cachedResultName: 'jrpos_config' };
const TABLA_LOG = { __rl: true, mode: 'id', value: 'umCskhDEBOVpZ2XE', cachedResultName: 'jrpos_notification_log' };
const TABLA_ONBOARDING = { __rl: true, mode: 'id', value: 'NUVjamW3lHJ8yUtM', cachedResultName: 'jrpos_onboarding' };
const NOTIFICADOR = { __rl: true, mode: 'id', value: 'yQY2jFZ7kyTCw3oi', cachedResultName: 'JRPOS I02 - Notificador central' };

const eventoRegistro = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Evento tenant.registered (desde I05)',
    parameters: {
      inputSource: 'workflowInputs',
      workflowInputs: {
        values: [
          { name: 'event_id', type: 'string' },
          { name: 'type', type: 'string' },
          { name: 'tenant_id', type: 'string' },
          { name: 'data', type: 'object' }
        ]
      }
    },
    position: [240, 160]
  },
  output: [{ event_id: 'evt-demo-0001', type: 'tenant.registered', tenant_id: 't-demo-1', data: {} }]
});

const registrarTenant = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Registrar tenant en onboarding',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TABLA_ONBOARDING,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'tenant_id', condition: 'eq', keyValue: expr('{{ $json.tenant_id }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          tenant_id: expr('{{ $json.tenant_id }}'),
          registered_at: expr('{{ $now.toISO() }}'),
          last_step: 'ninguno',
          completed: false
        },
        schema: [
          { id: 'tenant_id', displayName: 'tenant_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'registered_at', displayName: 'registered_at', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true },
          { id: 'last_step', displayName: 'last_step', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'completed', displayName: 'completed', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true }
        ]
      }
    },
    position: [480, 160]
  },
  output: [{ id: 1, tenant_id: 't-demo-1', last_step: 'ninguno', completed: false }]
});

const sondeo = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Cada 2 h entre 8 y 19',
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '11 8-19/2 * * *' }] } },
    position: [240, 520]
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
    position: [480, 520]
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
    position: [720, 520]
  }
});

const sinBackend = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin backend: nada que hacer', position: [960, 700] },
  output: [{}]
});

const leerPendientes = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer onboarding pendientes',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLA_ONBOARDING,
      returnAll: true
    },
    position: [900, 440]
  },
  output: [{ id: 1, tenant_id: 't-demo-1', registered_at: '2026-10-13T14:00:00.000Z', last_step: 'ninguno', completed: false }]
});

const soloPendientes = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Solo pendientes',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.completed }}'), operator: { type: 'boolean', operation: 'false', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1080, 440]
  },
  output: [{ id: 1, tenant_id: 't-demo-1', registered_at: '2026-10-13T14:00:00.000Z', last_step: 'ninguno', completed: false }]
});

const consultarActividad = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Consultar actividad del tenant',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Leer backend_base_url").first().json.config_value }}/api/internal/tenants/{{ $json.tenant_id }}/activity'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueRegularOutput',
    position: [1260, 440]
  },
  output: [{ tenant_id: 't-demo-1', status: 'trial', products_count: 0, sales_count: 0, last_sale_at: null, opt_in: true, channel: 'whatsapp' }]
});

const decidirPaso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Decidir paso',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: "const reg = $('Leer onboarding pendientes').item.json;\nconst a = $json || {};\nconst base = { tenant_id: reg.tenant_id, last_step: reg.last_step || 'ninguno', step: '', enviar: false, actualizar: false, completar: false, accion: '', channel: a.channel || 'whatsapp', severity: 'info', message: '', idempotency_key: '' };\nif (!a.tenant_id || a.tenant_id !== reg.tenant_id) { return { json: { ...base, accion: 'sin_datos' } }; }\nif (!['trial', 'active'].includes(a.status)) { return { json: { ...base, accion: 'tenant_no_activo' } }; }\nconst completar = Number(a.products_count) > 0 && Number(a.sales_count) > 0;\nif (completar) { return { json: { ...base, completar: true, actualizar: true, accion: 'hito_cumplido' } }; }\nconst ordenPasos = [{ id: 'D0', dia: 0 }, { id: 'D1', dia: 1 }, { id: 'D3', dia: 3 }, { id: 'D7', dia: 7 }];\nconst ultimo = ordenPasos.findIndex(p => p.id === base.last_step);\nconst dias = Math.floor($now.setZone('America/Bogota').startOf('day').diff(DateTime.fromISO(reg.registered_at).setZone('America/Bogota').startOf('day'), 'days').days);\nconst paso = ordenPasos.find((p, i) => i > ultimo && p.dia <= dias);\nif (!paso) { return { json: { ...base, accion: 'sin_paso_pendiente' } }; }\nif (!a.opt_in) { return { json: { ...base, accion: 'sin_opt_in' } }; }\nconst sinProductos = Number(a.products_count) === 0;\nconst sinVentas = Number(a.sales_count) === 0;\nlet mensaje = '';\nif (paso.id === 'D0') { mensaje = 'Bienvenido a JRPOS. Para empezar, carga tus productos (puedes importarlos desde Excel o escanearlos). Si necesitas ayuda, responde este mensaje.'; }\nelse if (paso.id === 'D1' && sinProductos) { mensaje = 'Aun no has cargado productos en JRPOS. Importa tu inventario desde Excel o crea tus primeros productos; toma menos de 10 minutos.'; }\nelse if (paso.id === 'D3' && sinVentas) { mensaje = sinProductos ? 'Tu tienda JRPOS sigue sin productos. Carga unos pocos para poder registrar tu primera venta.' : 'Ya tienes productos en JRPOS. Registra tu primera venta desde el punto de venta para ver tus reportes.'; }\nelse if (paso.id === 'D7' && sinVentas) { mensaje = 'Llevas una semana con JRPOS sin ventas registradas. Respondenos y te ayudamos a dejarlo funcionando.'; }\nconst vencido = dias - paso.dia > 1;\nconst enviar = mensaje !== '' && !vencido;\nreturn { json: { ...base, step: paso.id, enviar, actualizar: true, accion: enviar ? 'enviar_' + paso.id : (vencido ? 'paso_vencido_omitido' : 'paso_omitido_hito'), message: mensaje, idempotency_key: 'F07:' + reg.tenant_id + ':' + paso.id } };"
    },
    position: [1440, 440]
  },
  output: [{ tenant_id: 't-demo-1', last_step: 'ninguno', step: 'D0', enviar: true, actualizar: true, completar: false, accion: 'enviar_D0', channel: 'whatsapp', severity: 'info', message: 'Bienvenido a JRPOS.', idempotency_key: 'F07:t-demo-1:D0' }]
});

const hayMensaje = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Hay mensaje que enviar',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.enviar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1680, 360]
  },
  output: [{ tenant_id: 't-demo-1', step: 'D0', channel: 'whatsapp', severity: 'info', message: 'Bienvenido a JRPOS.', idempotency_key: 'F07:t-demo-1:D0' }]
});

const yaEnviado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Paso ya enviado',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'idempotency_key', condition: 'eq', keyValue: expr('{{ $json.idempotency_key }}') }] }
    },
    position: [1920, 360]
  },
  output: [{ tenant_id: 't-demo-1', step: 'D0', channel: 'whatsapp', severity: 'info', message: 'Bienvenido a JRPOS.', idempotency_key: 'F07:t-demo-1:D0' }]
});

const avisar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Enviar paso (I02)',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'F07-onboarding',
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
    position: [2160, 360]
  },
  output: [{ status: 'pendiente_canal' }]
});

const hayAvance = ifElse({
  version: 2.3,
  config: {
    name: 'Hay avance que guardar',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.actualizar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1680, 560]
  }
});

const sinAvance = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin avance', position: [1920, 700] },
  output: [{}]
});

const guardarAvance = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Guardar avance',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: TABLA_ONBOARDING,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'tenant_id', condition: 'eq', keyValue: expr('{{ $json.tenant_id }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          last_step: expr('{{ $json.step || $json.last_step }}'),
          completed: expr('{{ $json.completar }}')
        },
        schema: [
          { id: 'tenant_id', displayName: 'tenant_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'registered_at', displayName: 'registered_at', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true },
          { id: 'last_step', displayName: 'last_step', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'completed', displayName: 'completed', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true }
        ]
      }
    },
    position: [1920, 500]
  },
  output: [{ id: 1, tenant_id: 't-demo-1', last_step: 'D0', completed: false }]
});

const notaConectar = sticky(
  '## MANANA: conectar\n1) En I05, sustituir el nodo "Destino F07 onboarding" por Execute Workflow a este flujo (entradas: event_id, type, tenant_id, data). Mientras tanto el sondeo no registra tenants nuevos: se pueden anadir filas a jrpos_onboarding a mano para probar.\n2) Credencial Header Auth "JRPOS Internal Token" en "Consultar actividad del tenant" y fila backend_base_url en jrpos_config.\n3) Backend: GET /api/internal/tenants/{id}/activity (contrato en n8n/contracts/F07.md) con opt_in, channel, status, products_count, sales_count.\n4) Canal: conectar WhatsApp/Email en I02. Plantillas de utilidad: onboarding_d0, d1, d3, d7 (texto en el nodo "Decidir paso").\n5) Sondeo solo de 8 a 19 h porque I02 registra como omitido (y no reenvia) los info entre 21 y 7 h.\n6) Probar con un tenant y numero de prueba; activar solo con confirmacion del propietario.',
  [eventoRegistro, consultarActividad, decidirPaso],
  { color: 4 }
);

export default workflow('jrpos-f07-onboarding', 'JRPOS F07 - Onboarding de tenant nuevo')
  .add(eventoRegistro)
  .to(registrarTenant)
  .add(sondeo)
  .to(leerBase)
  .to(backendListo
    .onTrue(leerPendientes.to(soloPendientes.to(consultarActividad.to(decidirPaso.to(hayMensaje.to(yaEnviado.to(avisar)))))))
    .onFalse(sinBackend))
  .add(decidirPaso)
  .to(hayAvance.onTrue(guardarAvance).onFalse(sinAvance))
  .add(notaConectar);
