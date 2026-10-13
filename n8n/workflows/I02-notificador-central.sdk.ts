// JRPOS I02 - Notificador central (subflujo). Fuente en n8n Workflow SDK.
// IDs de tablas y de subflujos son de la instancia actual (easymarketing.tech); ver n8n/README.md.
import { workflow, node, trigger, ifElse, switchCase, sticky, expr } from '@n8n/workflow-sdk';

const TABLA_LOG = { __rl: true, mode: 'id', value: 'umCskhDEBOVpZ2XE', cachedResultName: 'jrpos_notification_log' };

const recibir = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Recibir aviso',
    parameters: {
      inputSource: 'workflowInputs',
      workflowInputs: {
        values: [
          { name: 'flow', type: 'string' },
          { name: 'tenant_id', type: 'string' },
          { name: 'channel', type: 'string' },
          { name: 'severity', type: 'string' },
          { name: 'message', type: 'string' },
          { name: 'idempotency_key', type: 'string' }
        ]
      }
    },
    position: [240, 400]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13' }]
});

const normalizar = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalizar aviso',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'a1', name: 'flow', value: expr("{{ $json.flow || 'desconocido' }}"), type: 'string' },
          { id: 'a2', name: 'tenant_id', value: expr("{{ $json.tenant_id || 'plataforma' }}"), type: 'string' },
          { id: 'a3', name: 'channel', value: expr("{{ ($json.channel || 'telegram').toLowerCase() }}"), type: 'string' },
          { id: 'a4', name: 'severity', value: expr("{{ ['info','alta','critica'].includes(($json.severity || '').toLowerCase()) ? $json.severity.toLowerCase() : 'info' }}"), type: 'string' },
          { id: 'a5', name: 'message', value: expr("{{ ($json.message || '').toString().slice(0, 1500) }}"), type: 'string' },
          { id: 'a6', name: 'idempotency_key', value: expr("{{ $json.idempotency_key || (($json.flow || 'desconocido') + ':' + ($json.tenant_id || 'plataforma') + ':' + $today.toFormat('yyyy-LL-dd') + ':' + ($json.message || '').toString().slice(0, 60)) }}"), type: 'string' },
          { id: 'a7', name: 'hora_bogota', value: expr("{{ $now.setZone('America/Bogota').hour }}"), type: 'number' },
          { id: 'a8', name: 'inicio_dia_iso', value: expr("{{ $now.setZone('America/Bogota').startOf('day').toUTC().toISO() }}"), type: 'string' },
          { id: 'a9', name: 'ahora_iso', value: expr("{{ $now.toISO() }}"), type: 'string' },
          { id: 'a10', name: 'silencio_desde_hora', value: 21, type: 'number' },
          { id: 'a11', name: 'silencio_hasta_hora', value: 7, type: 'number' },
          { id: 'a12', name: 'tope_diario', value: 20, type: 'number' }
        ]
      }
    },
    position: [480, 400]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', hora_bogota: 14, inicio_dia_iso: '2026-10-13T05:00:00.000Z', ahora_iso: '2026-10-13T19:00:00.000Z', silencio_desde_hora: 21, silencio_hasta_hora: 7, tope_diario: 20 }]
});

const mensajeValido = ifElse({
  version: 2.3,
  config: {
    name: 'Mensaje valido',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.message }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [720, 400]
  }
});

const descartarVacio = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Descartado: mensaje vacio', position: [960, 560] },
  output: [{}]
});

const sinDuplicado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Evitar duplicados',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'idempotency_key', condition: 'eq', keyValue: expr('{{ $json.idempotency_key }}') }] }
    },
    position: [960, 300]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', hora_bogota: 14, inicio_dia_iso: '2026-10-13T05:00:00.000Z', ahora_iso: '2026-10-13T19:00:00.000Z', silencio_desde_hora: 21, silencio_hasta_hora: 7, tope_diario: 20 }]
});

const enSilencio = ifElse({
  version: 2.3,
  config: {
    name: 'Horario de silencio',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.severity === "info" && ($json.hora_bogota >= $json.silencio_desde_hora || $json.hora_bogota < $json.silencio_hasta_hora) }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1200, 300]
  }
});

const marcarSilencio = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Marcar: omitido por silencio',
    parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [{ id: 's1', name: 'status', value: 'omitido_silencio', type: 'string' }] } },
    position: [1440, 160]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'telegram', severity: 'info', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', ahora_iso: '2026-10-13T19:00:00.000Z', status: 'omitido_silencio' }]
});

const contarHoy = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Contar avisos de hoy',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: {
        conditions: [
          { keyName: 'flow', condition: 'eq', keyValue: expr('{{ $json.flow }}') },
          { keyName: 'tenant_id', condition: 'eq', keyValue: expr('{{ $json.tenant_id }}') },
          { keyName: 'sent_at', condition: 'gte', keyValue: expr('{{ $json.inicio_dia_iso }}') }
        ]
      },
      returnAll: true
    },
    position: [1440, 440]
  },
  output: [{ id: 1, flow: 'I03-backup' }]
});

const evaluarTope = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Evaluar tope diario',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const base = $('Normalizar aviso').first().json;\nconst filas = $input.all().filter(i => i.json && i.json.id !== undefined);\nreturn [{ json: { ...base, enviados_hoy: filas.length, tope_alcanzado: filas.length >= base.tope_diario } }];"
    },
    position: [1680, 440]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', ahora_iso: '2026-10-13T19:00:00.000Z', enviados_hoy: 0, tope_alcanzado: false }]
});

const topeAlcanzado = ifElse({
  version: 2.3,
  config: {
    name: 'Tope diario alcanzado',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.tope_alcanzado }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1920, 440]
  }
});

const marcarTope = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Marcar: omitido por tope',
    parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [{ id: 't1', name: 'status', value: 'omitido_tope', type: 'string' }] } },
    position: [2160, 320]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', ahora_iso: '2026-10-13T19:00:00.000Z', status: 'omitido_tope' }]
});

const elegirCanal = switchCase({
  version: 3.4,
  config: {
    name: 'Elegir canal',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'telegram', renameOutput: true, conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.channel }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'telegram' }], combinator: 'and' } },
          { outputKey: 'whatsapp', renameOutput: true, conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.channel }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'whatsapp' }], combinator: 'and' } },
          { outputKey: 'email', renameOutput: true, conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.channel }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'email' }], combinator: 'and' } }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'otro' }
    },
    position: [2160, 560]
  }
});

const entregaTelegram = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Entrega Telegram (PENDIENTE DE CONECTAR)',
    parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [{ id: 'e1', name: 'status', value: 'pendiente_canal', type: 'string' }] } },
    position: [2400, 440]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', ahora_iso: '2026-10-13T19:00:00.000Z', status: 'pendiente_canal' }]
});

const entregaWhatsapp = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Entrega WhatsApp (PENDIENTE DE CONECTAR)',
    parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [{ id: 'w1', name: 'status', value: 'pendiente_canal', type: 'string' }] } },
    position: [2400, 580]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'whatsapp', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', ahora_iso: '2026-10-13T19:00:00.000Z', status: 'pendiente_canal' }]
});

const entregaEmail = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Entrega Email (PENDIENTE DE CONECTAR)',
    parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [{ id: 'm1', name: 'status', value: 'pendiente_canal', type: 'string' }] } },
    position: [2400, 720]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'email', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', ahora_iso: '2026-10-13T19:00:00.000Z', status: 'pendiente_canal' }]
});

const entregaOtro = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Canal desconocido',
    parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [{ id: 'o1', name: 'status', value: 'canal_desconocido', type: 'string' }] } },
    position: [2400, 860]
  },
  output: [{ flow: 'I03-backup', tenant_id: 'plataforma', channel: 'sms', severity: 'alta', message: 'Prueba de aviso', idempotency_key: 'prueba:2026-10-13', ahora_iso: '2026-10-13T19:00:00.000Z', status: 'canal_desconocido' }]
});

const registrar = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Registrar en bitacora',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: TABLA_LOG,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          idempotency_key: expr('{{ $json.idempotency_key }}'),
          flow: expr('{{ $json.flow }}'),
          tenant_id: expr('{{ $json.tenant_id }}'),
          channel: expr('{{ $json.channel }}'),
          severity: expr('{{ $json.severity }}'),
          message: expr('{{ $json.message }}'),
          status: expr('{{ $json.status }}'),
          sent_at: expr('{{ $json.ahora_iso }}')
        },
        schema: [
          { id: 'idempotency_key', displayName: 'idempotency_key', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'flow', displayName: 'flow', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'tenant_id', displayName: 'tenant_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'severity', displayName: 'severity', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'message', displayName: 'message', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'sent_at', displayName: 'sent_at', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true }
        ]
      }
    },
    position: [2640, 440]
  },
  output: [{ id: 1, idempotency_key: 'prueba:2026-10-13', flow: 'I03-backup', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Prueba de aviso', status: 'pendiente_canal' }]
});

const notaConectar = sticky(
  '## MANANA: conectar canales\nCada nodo "Entrega ... (PENDIENTE DE CONECTAR)" es un marcador. Para activar un canal: reemplazarlo por el nodo real (Telegram / WhatsApp / Email) con su credencial y dejar status = enviado. Entrada: flow, tenant_id, channel, severity (info|alta|critica), message, idempotency_key. Horario de silencio y tope diario se ajustan en "Normalizar aviso".',
  [elegirCanal, entregaTelegram, entregaWhatsapp, entregaEmail],
  { color: 4 }
);

export default workflow('jrpos-i02-notificador', 'JRPOS I02 - Notificador central')
  .add(recibir)
  .to(normalizar)
  .to(mensajeValido
    .onTrue(sinDuplicado.to(enSilencio
      .onTrue(marcarSilencio.to(registrar))
      .onFalse(contarHoy.to(evaluarTope.to(topeAlcanzado
        .onTrue(marcarTope.to(registrar))
        .onFalse(elegirCanal
          .onCase(0, entregaTelegram.to(registrar))
          .onCase(1, entregaWhatsapp.to(registrar))
          .onCase(2, entregaEmail.to(registrar))
          .onCase(3, entregaOtro.to(registrar))
        )
      )))
    ))
    .onFalse(descartarVacio))
  .add(notaConectar);
