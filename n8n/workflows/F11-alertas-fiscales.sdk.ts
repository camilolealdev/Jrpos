// JRPOS F11 - Alertas fiscales (30/15/7 dias). Fuente en n8n Workflow SDK. Sin secretos.
// Diario 7:30 (Bogota). Sondeo/reconciliacion: si se pierde un dia, el siguiente corrida igual avisa (la clave de
// idempotencia depende del documento, su fecha y el umbral cruzado, no del dia). UN mensaje resumen por tienda.
// Contrato: n8n/contracts/F11.md
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
  config: { name: 'Diario 7:30', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 30 }] } }, position: [240, 400] },
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
      jsCode: "const filas = $input.all().map(i => i.json);\nconst get = (k, d) => { const f = filas.find(x => x.config_key === k); return f && f.config_value !== undefined && f.config_value !== null && f.config_value !== '' ? String(f.config_value) : d; };\nlet dias = get('fiscal_alert_days', '30,15,7').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);\nif (dias.length === 0) { dias = [7, 15, 30]; }\nreturn [{ json: { base_url: get('backend_base_url', '').replace(/\\/+$/, ''), plataforma: get('platform_tenant_id', 'plataforma'), dias } }];"
    },
    position: [720, 400]
  },
  output: [{ base_url: 'https://backend.test', plataforma: 'plataforma', dias: [7, 15, 30] }]
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
      url: expr("{{ $json.base_url + '/api/internal/notification-targets?flow=F11' }}"),
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

const pedirFechas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir vencimientos fiscales por tienda',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Preparar config').first().json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/fiscal-deadlines' }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueErrorOutput',
    position: [1920, 300]
  },
  output: [{ tenant_id: 'tenant-a', items: [{ kind: 'certificado_digital', label: 'Certificado digital', expires_on: '2026-10-25' }] }]
});

const evaluar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Evaluar umbrales 30/15/7',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const cfg = $('Preparar config').first().json;\nconst objetivos = $('Solo tenants con opt-in').all().map(i => i.json);\nconst hoyMs = Date.parse(new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10) + 'T00:00:00Z');\nconst nombres = { certificado_digital: 'Certificado digital', rango_numeracion: 'Rango de numeracion', resolucion_dian: 'Resolucion DIAN' };\nconst out = [];\nfor (const it of $input.all()) {\n  const r = it.json || {};\n  const o = objetivos.find(x => String(x.tenant_id) === String(r.tenant_id));\n  if (!o || o.notify.opt_in !== true || !Array.isArray(r.items)) { continue; }\n  const alertas = [];\n  const partes = [];\n  for (const x of r.items) {\n    const nombre = nombres[x.kind] || String(x.label || x.kind || 'Documento').slice(0, 40);\n    const ok = typeof x.expires_on === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(x.expires_on) && !isNaN(Date.parse(x.expires_on + 'T00:00:00Z'));\n    if (!ok) { alertas.push({ texto: nombre + ': fecha de vencimiento no interpretable, revisala en Configuracion', prio: 999 }); partes.push(x.kind + ':sin_fecha'); continue; }\n    const d = Math.round((Date.parse(x.expires_on + 'T00:00:00Z') - hoyMs) / 86400000);\n    let bucket = null;\n    if (d < 0) { bucket = -1; } else { for (const u of cfg.dias) { if (d <= u) { bucket = u; break; } } }\n    if (bucket === null) { continue; }\n    alertas.push({ texto: nombre + (d < 0 ? ': VENCIDO hace ' + (-d) + ' dia(s)' : (d === 0 ? ': vence HOY' : ': vence en ' + d + ' dia(s)')) + ' (' + x.expires_on + ')', prio: d });\n    partes.push(x.kind + ':' + x.expires_on + ':' + bucket);\n  }\n  if (alertas.length === 0) { continue; }\n  alertas.sort((a, b) => a.prio - b.prio);\n  const urgente = alertas.some(a => a.prio <= 7);\n  const message = 'Alerta fiscal: ' + alertas.map(a => a.texto).join(' | ') + '. Renueva a tiempo para no frenar la facturacion.';\n  out.push({ json: { flow: 'F11-alertas-fiscales', tenant_id: r.tenant_id, channel: o.notify.channel ? String(o.notify.channel).toLowerCase() : 'whatsapp', severity: urgente ? 'alta' : 'info', message: message.slice(0, 1400), idempotency_key: ('F11:' + r.tenant_id + ':' + partes.sort().join('|')).slice(0, 250) } });\n}\nreturn out;"
    },
    position: [2160, 200]
  },
  output: [{ flow: 'F11-alertas-fiscales', tenant_id: 'tenant-a', channel: 'whatsapp', severity: 'alta', message: 'Alerta fiscal: Certificado digital: vence en 12 dia(s) (2026-10-25).', idempotency_key: 'F11:tenant-a:certificado_digital:2026-10-25:15' }]
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
      jsCode: "const plat = $('Preparar config').first().json.plataforma;\nconst fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);\nreturn [{ json: { flow: 'F11-alertas-fiscales', tenant_id: plat, channel: 'telegram', severity: 'alta', message: 'F11: fallaron ' + $input.all().length + ' consulta(s) de vencimientos fiscales al backend. Revisa /api/internal y la credencial JRPOS Internal Token.', idempotency_key: 'F11:plataforma:' + fecha } }];"
    },
    position: [2160, 480]
  },
  output: [{ flow: 'F11-alertas-fiscales', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'F11: fallaron 1 consulta(s)', idempotency_key: 'F11:plataforma:2026-10-13' }]
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
  '## MANANA: conectar (F11 Alertas fiscales)\n1) Credencial Header Auth "JRPOS Internal Token" en los 2 nodos HTTP.\n2) Backend, endpoints NUEVOS (contrato en n8n/contracts/F11.md): GET /api/internal/notification-targets?flow=F11 y GET /api/internal/tenants/{id}/fiscal-deadlines.\n3) BD/Backend: hoy SettingsCertificate.expires y SettingsElectronic.fecha_resolucion/rango_hasta son TEXTO. El endpoint debe normalizarlos a fecha ISO (expires_on = YYYY-MM-DD) o devolver null si no se pueden interpretar (el flujo avisa "fecha no interpretable"). Recomendado: migrar esos campos a tipo fecha.\n4) jrpos_config: rellenar backend_base_url. fiscal_alert_days = 30,15,7 (editable).\n5) Idempotencia: la clave incluye documento + fecha + umbral cruzado: si un dia no corre, el siguiente avisa igual; no repite el mismo umbral.\n6) Canal real en I02 y opt-in por tenant. No activar sin confirmacion del propietario.',
  [pedirObjetivos, pedirFechas, avisar],
  { color: 4 }
);

pedirFechas.onError(resumirFallos.to(avisarPlataforma));

export default workflow('jrpos-f11-alertas-fiscales', 'JRPOS F11 - Alertas fiscales')
  .add(programar)
  .to(leerConfig)
  .to(prepararConfig)
  .to(backendListo
    .onTrue(pedirObjetivos.to(separar.to(soloOptIn.to(pedirFechas.to(evaluar.to(avisar)))))
    )
    .onFalse(sinBackend))
  .add(notaConectar);
