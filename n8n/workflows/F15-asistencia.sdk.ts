// JRPOS F15 - Asistencia (tardanzas del dia). Fuente en n8n Workflow SDK. Sin secretos.
// Diario 10:30 (Bogota). Por tenant con opt-in: SOLO si hubo tardanzas, UN aviso al dueno. Contrato: n8n/contracts/F15.md
import { workflow, node, trigger, ifElse, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const TABLA_CONFIG = { __rl: true, mode: 'id', value: 'zDL8AK31GyRpU4YB', cachedResultName: 'jrpos_config' };
const SUBFLUJO_NOTIFICADOR = { __rl: true, mode: 'id', value: 'yQY2jFZ7kyTCw3oi', cachedResultName: 'JRPOS I02 - Notificador central' };
const ENTRADA_I02 = {
  mappingMode: 'defineBelow',
  value: {
    flow: expr('{{ $json.flow }}'),
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
};

const programar = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Diario 10:30', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 10, triggerAtMinute: 30 }] } }, position: [240, 400] },
  output: [{}]
});

const leerConfig = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Leer configuracion', parameters: { resource: 'row', operation: 'get', dataTableId: TABLA_CONFIG, returnAll: true }, position: [480, 400] },
  output: [{ config_key: 'backend_base_url', config_value: 'https://backend.test' }]
});

const prepararConfig = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparar config',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const filas = $input.all().map(i => i.json);\nconst get = (k, d) => { const f = filas.find(x => x.config_key === k); return f && f.config_value !== undefined && f.config_value !== null && f.config_value !== '' ? String(f.config_value) : d; };\nconst g = Number(get('attendance_grace_minutes', '10'));\nreturn [{ json: { base_url: get('backend_base_url', '').replace(/\\/+$/, ''), plataforma: get('platform_tenant_id', 'plataforma'), grace: Number.isFinite(g) && g >= 0 ? g : 10 } }];"
    },
    position: [720, 400]
  },
  output: [{ base_url: 'https://backend.test', plataforma: 'plataforma', grace: 10 }]
});

const backendListo = ifElse({
  version: 2.3,
  config: {
    name: 'Backend configurado',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.base_url }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [960, 400]
  }
});

const sinBackend = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin backend configurado: nada que hacer', position: [1200, 600] },
  output: [{}]
});

const pedirObjetivos = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir tiendas con opt-in',
    parameters: {
      method: 'GET',
      url: expr("{{ $json.base_url + '/api/internal/notification-targets?flow=F15' }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    position: [1200, 300]
  },
  output: [{ tenants: [{ tenant_id: 'tenant-a', notify: { opt_in: true, channel: 'whatsapp' } }] }]
});

const separar = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Una fila por tienda', parameters: { fieldToSplitOut: 'tenants', include: 'noOtherFields' }, position: [1440, 300] },
  output: [{ tenant_id: 'tenant-a', notify: { opt_in: true, channel: 'whatsapp' } }]
});

const soloOptIn = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Solo tenants con opt-in',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.notify?.opt_in === true && !!$json.tenant_id }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1680, 300]
  },
  output: [{ tenant_id: 'tenant-a', notify: { opt_in: true, channel: 'whatsapp' } }]
});

const pedirTardanzas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir tardanzas de hoy por tienda',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Preparar config').first().json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/timeclock/late-today?grace_minutes=' + $('Preparar config').first().json.grace }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueErrorOutput',
    position: [1920, 300]
  },
  output: [{ tenant_id: 'tenant-a', date: '2026-10-13', grace_minutes: 10, late: [{ employee_label: 'Ana P.', scheduled_start: '08:00', clock_in: '08:25', minutes_late: 25 }] }]
});

const armarAviso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Armar aviso de tardanzas',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const cfg = $('Preparar config').first().json;\nconst objetivos = $('Solo tenants con opt-in').all().map(i => i.json);\nconst fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);\nconst out = [];\nfor (const it of $input.all()) {\n  const r = it.json || {};\n  const o = objetivos.find(x => String(x.tenant_id) === String(r.tenant_id));\n  if (!o || o.notify.opt_in !== true || !Array.isArray(r.late)) { continue; }\n  const grace = Number(r.grace_minutes) >= 0 && r.grace_minutes !== null && r.grace_minutes !== '' ? Number(r.grace_minutes) : cfg.grace;\n  const tarde = r.late.filter(x => Number(x.minutes_late) > grace).sort((a, b) => Number(b.minutes_late) - Number(a.minutes_late));\n  if (tarde.length === 0) { continue; }\n  const lista = tarde.slice(0, 10).map(x => String(x.employee_label || 'Empleado').slice(0, 30) + ' +' + Math.round(Number(x.minutes_late)) + ' min').join(', ') + (tarde.length > 10 ? ' y ' + (tarde.length - 10) + ' mas' : '');\n  out.push({ json: { flow: 'F15-asistencia', tenant_id: r.tenant_id, channel: o.notify.channel ? String(o.notify.channel).toLowerCase() : 'whatsapp', severity: 'info', message: 'Tardanzas de hoy (' + tarde.length + '): ' + lista + '.', idempotency_key: 'F15:' + r.tenant_id + ':' + fecha } });\n}\nreturn out;"
    },
    position: [2160, 200]
  },
  output: [{ flow: 'F15-asistencia', tenant_id: 'tenant-a', channel: 'whatsapp', severity: 'info', message: 'Tardanzas de hoy (1): Ana P. +25 min.', idempotency_key: 'F15:tenant-a:2026-10-13' }]
});

const avisar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar al dueno (I02)',
    parameters: { mode: 'each', source: 'database', workflowId: SUBFLUJO_NOTIFICADOR, workflowInputs: ENTRADA_I02 },
    onError: 'continueRegularOutput',
    position: [2400, 200]
  },
  output: [{ status: 'pendiente_canal' }]
});

const resumirFallos = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Resumir fallos para la plataforma',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const plat = $('Preparar config').first().json.plataforma;\nconst fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);\nreturn [{ json: { flow: 'F15-asistencia', tenant_id: plat, channel: 'telegram', severity: 'alta', message: 'F15: fallaron ' + $input.all().length + ' consulta(s) de asistencia al backend. Revisa /api/internal y la credencial JRPOS Internal Token.', idempotency_key: 'F15:plataforma:' + fecha } }];"
    },
    position: [2160, 480]
  },
  output: [{ flow: 'F15-asistencia', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'F15: fallaron 1 consulta(s)', idempotency_key: 'F15:plataforma:2026-10-13' }]
});

const avisarPlataforma = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar a la plataforma (I02)',
    parameters: { mode: 'once', source: 'database', workflowId: SUBFLUJO_NOTIFICADOR, workflowInputs: ENTRADA_I02 },
    onError: 'continueRegularOutput',
    position: [2400, 480]
  },
  output: [{ status: 'pendiente_canal' }]
});

const notaConectar = sticky(
  '## MANANA: conectar (F15 Asistencia)\n1) Credencial Header Auth "JRPOS Internal Token" en los 2 nodos HTTP.\n2) Backend, endpoints NUEVOS (contrato en n8n/contracts/F15.md): GET /api/internal/notification-targets?flow=F15 y GET /api/internal/tenants/{id}/timeclock/late-today?grace_minutes=N (reusa la logica de /api/timeclock/records).\n3) Privacidad: el endpoint devuelve solo una etiqueta corta del empleado (nombre + inicial), nunca documento ni telefono.\n4) jrpos_config: rellenar backend_base_url. attendance_grace_minutes (10) es la tolerancia por defecto; el endpoint puede devolver la del tenant. BD: si no existe horario esperado por empleado, el endpoint no puede calcular tardanza (campo faltante: hora de entrada programada).\n5) Solo se avisa si hubo tardanzas. Un mensaje por tienda y dia (clave F15:tenant:fecha). Canal real en I02 y opt-in. No activar sin confirmacion del propietario.',
  [pedirObjetivos, pedirTardanzas, avisar],
  { color: 4 }
);

pedirTardanzas.onError(resumirFallos.to(avisarPlataforma));

export default workflow('jrpos-f15-asistencia', 'JRPOS F15 - Asistencia')
  .add(programar)
  .to(leerConfig)
  .to(prepararConfig)
  .to(backendListo
    .onTrue(pedirObjetivos.to(separar.to(soloOptIn.to(pedirTardanzas.to(armarAviso.to(avisar)))))
    )
    .onFalse(sinBackend))
  .add(notaConectar);
