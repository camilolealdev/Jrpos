// JRPOS F13 - Rotacion y merma. Fuente en n8n Workflow SDK. Sin secretos.
// Lunes 9:00 (Bogota). Por tenant con opt-in: productos sin ventas en N dias (90) + anomalias de merma, UN resumen semanal.
// Contrato: n8n/contracts/F13.md
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
  config: { name: 'Lunes 9:00', parameters: { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 9, triggerAtMinute: 0 }] } }, position: [240, 400] },
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
      jsCode: "const filas = $input.all().map(i => i.json);\nconst get = (k, d) => { const f = filas.find(x => x.config_key === k); return f && f.config_value !== undefined && f.config_value !== null && f.config_value !== '' ? String(f.config_value) : d; };\nconst dias = Number(get('rotation_no_sales_days', '90'));\nconst ratio = Number(get('merma_anomaly_ratio', '2'));\nreturn [{ json: { base_url: get('backend_base_url', '').replace(/\\/+$/, ''), plataforma: get('platform_tenant_id', 'plataforma'), dias: Number.isFinite(dias) && dias >= 7 && dias <= 365 ? Math.floor(dias) : 90, ratio: Number.isFinite(ratio) && ratio > 1 ? ratio : 2 } }];"
    },
    position: [720, 400]
  },
  output: [{ base_url: 'https://backend.test', plataforma: 'plataforma', dias: 90, ratio: 2 }]
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
      url: expr("{{ $json.base_url + '/api/internal/notification-targets?flow=F13' }}"),
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

const pedirRotacion = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir rotacion y merma por tienda',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Preparar config').first().json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/inventory/rotation-merma?no_sales_days=' + $('Preparar config').first().json.dias + '&merma_days=30' }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 30000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueErrorOutput',
    position: [1920, 300]
  },
  output: [{ tenant_id: 'tenant-a', no_sales: { days: 90, count: 14, stock_value: 1200000, top: [{ name: 'Producto X', stock_value: 300000 }] }, merma: { window_days: 30, total_value: 180000, products: [{ name: 'Leche', window_value: 90000, avg_window_value: 30000 }] } }]
});

const armarResumen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Armar resumen semanal',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const cfg = $('Preparar config').first().json;\nconst objetivos = $('Solo tenants con opt-in').all().map(i => i.json);\nconst fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');\nconst d = new Date(Date.now() - 5 * 3600 * 1000);\nconst t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));\nt.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));\nconst y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));\nconst semana = Math.ceil(((t - y0) / 86400000 + 1) / 7);\nconst clave = t.getUTCFullYear() + '-W' + String(semana).padStart(2, '0');\nconst out = [];\nfor (const it of $input.all()) {\n  const r = it.json || {};\n  const o = objetivos.find(x => String(x.tenant_id) === String(r.tenant_id));\n  if (!o || o.notify.opt_in !== true) { continue; }\n  const no = r.no_sales || {};\n  const m = r.merma || {};\n  const cnt = Number(no.count) || 0;\n  const prods = Array.isArray(m.products) ? m.products : [];\n  const anom = prods.filter(p => { const w = Number(p.window_value) || 0; const a = Number(p.avg_window_value) || 0; return w > 0 && (a > 0 ? w / a >= cfg.ratio : true); }).sort((a, b) => Number(b.window_value) - Number(a.window_value));\n  if (cnt === 0 && anom.length === 0) { continue; }\n  const partes = [];\n  if (cnt > 0) {\n    const top = Array.isArray(no.top) ? no.top.slice(0, 3).map(p => String(p.name || '').slice(0, 40)).join(', ') : '';\n    partes.push('Sin ventas en ' + (no.days || cfg.dias) + ' dias: ' + cnt + ' producto(s), $' + fmt(no.stock_value) + ' inmovilizado' + (top ? ' (ej. ' + top + ')' : ''));\n  }\n  if (anom.length > 0) {\n    const lista = anom.slice(0, 3).map(p => { const a = Number(p.avg_window_value) || 0; const w = Number(p.window_value) || 0; return String(p.name || '').slice(0, 40) + ' $' + fmt(w) + (a > 0 ? ' (' + (w / a).toFixed(1) + 'x lo normal)' : ' (nuevo)'); }).join(', ');\n    partes.push('Merma atipica (' + (m.window_days || 30) + ' d): ' + lista + (anom.length > 3 ? ' y ' + (anom.length - 3) + ' mas' : '') + '. Merma total $' + fmt(m.total_value));\n  }\n  out.push({ json: { flow: 'F13-rotacion-merma', tenant_id: r.tenant_id, channel: o.notify.channel ? String(o.notify.channel).toLowerCase() : 'whatsapp', severity: 'info', message: ('Revision semanal de inventario: ' + partes.join(' | ')).slice(0, 1400), idempotency_key: 'F13:' + r.tenant_id + ':' + clave } });\n}\nreturn out;"
    },
    position: [2160, 200]
  },
  output: [{ flow: 'F13-rotacion-merma', tenant_id: 'tenant-a', channel: 'whatsapp', severity: 'info', message: 'Revision semanal de inventario: Sin ventas en 90 dias: 14 producto(s).', idempotency_key: 'F13:tenant-a:2026-W42' }]
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
      jsCode: "const plat = $('Preparar config').first().json.plataforma;\nconst fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);\nreturn [{ json: { flow: 'F13-rotacion-merma', tenant_id: plat, channel: 'telegram', severity: 'alta', message: 'F13: fallaron ' + $input.all().length + ' consulta(s) de rotacion/merma al backend. Revisa /api/internal y la credencial JRPOS Internal Token.', idempotency_key: 'F13:plataforma:' + fecha } }];"
    },
    position: [2160, 480]
  },
  output: [{ flow: 'F13-rotacion-merma', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'F13: fallaron 1 consulta(s)', idempotency_key: 'F13:plataforma:2026-10-13' }]
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
  '## MANANA: conectar (F13 Rotacion y merma)\n1) Credencial Header Auth "JRPOS Internal Token" en los 2 nodos HTTP.\n2) Backend, endpoints NUEVOS (contrato en n8n/contracts/F13.md): GET /api/internal/notification-targets?flow=F13 y GET /api/internal/tenants/{id}/inventory/rotation-merma?no_sales_days=N&merma_days=30 (la parte de merma debe cuadrar con /api/reports/merma; la de rotacion es consulta NUEVA: ultimo movimiento de venta por producto).\n3) jrpos_config: rellenar backend_base_url. rotation_no_sales_days (90) y merma_anomaly_ratio (2) ajustan la regla; la anomalia se calcula aqui: valor de merma de la ventana >= ratio x promedio historico.\n4) Si el tenant no tiene anomalias ni productos sin rotacion, NO se envia nada. Un resumen por tienda y semana (clave F13:tenant:semana ISO).\n5) Canal real en I02 y opt-in. No activar sin confirmacion del propietario.',
  [pedirObjetivos, pedirRotacion, avisar],
  { color: 4 }
);

pedirRotacion.onError(resumirFallos.to(avisarPlataforma));

export default workflow('jrpos-f13-rotacion-merma', 'JRPOS F13 - Rotacion y merma')
  .add(programar)
  .to(leerConfig)
  .to(prepararConfig)
  .to(backendListo
    .onTrue(pedirObjetivos.to(separar.to(soloOptIn.to(pedirRotacion.to(armarResumen.to(avisar)))))
    )
    .onFalse(sinBackend))
  .add(notaConectar);
