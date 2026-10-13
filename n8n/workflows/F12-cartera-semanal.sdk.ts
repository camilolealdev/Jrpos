// JRPOS F12 - Cartera semanal. Fuente en n8n Workflow SDK. Sin secretos.
// Lunes 8:00 (Bogota). Por tenant con opt-in: UN resumen al dueno con sus mayores deudores. NUNCA escribe a los deudores.
// Contrato: n8n/contracts/F12.md
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
  config: { name: 'Lunes 8:00', parameters: { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 8, triggerAtMinute: 0 }] } }, position: [240, 400] },
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
      jsCode: "const filas = $input.all().map(i => i.json);\nconst get = (k, d) => { const f = filas.find(x => x.config_key === k); return f && f.config_value !== undefined && f.config_value !== null && f.config_value !== '' ? String(f.config_value) : d; };\nconst n = Number(get('cartera_top_n', '5'));\nreturn [{ json: { base_url: get('backend_base_url', '').replace(/\\/+$/, ''), app_url: get('app_base_url', '').replace(/\\/+$/, ''), plataforma: get('platform_tenant_id', 'plataforma'), top_n: Number.isFinite(n) && n >= 1 && n <= 20 ? Math.floor(n) : 5, incluir_wa: get('cartera_include_wa_links', 'false').toLowerCase() === 'true' } }];"
    },
    position: [720, 400]
  },
  output: [{ base_url: 'https://backend.test', app_url: 'https://app.test', plataforma: 'plataforma', top_n: 5, incluir_wa: false }]
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
      url: expr("{{ $json.base_url + '/api/internal/notification-targets?flow=F12' }}"),
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

const pedirCartera = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir mayores deudores por tienda',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Preparar config').first().json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/credits/top-debtors?limit=' + $('Preparar config').first().json.top_n }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueErrorOutput',
    position: [1920, 300]
  },
  output: [{ tenant_id: 'tenant-a', total_outstanding: 1500000, debtors_count: 8, overdue_total: 600000, debtors: [{ customer_id: 'c1', display_name: 'Maria P.', balance: 400000, days_overdue: 20, wa_me_link: null }] }]
});

const armarResumen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Armar resumen por tienda',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const cfg = $('Preparar config').first().json;\nconst objetivos = $('Solo tenants con opt-in').all().map(i => i.json);\nconst fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');\nconst d = new Date(Date.now() - 5 * 3600 * 1000);\nconst t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));\nt.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));\nconst y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));\nconst semana = Math.ceil(((t - y0) / 86400000 + 1) / 7);\nconst clave = t.getUTCFullYear() + '-W' + String(semana).padStart(2, '0');\nconst out = [];\nfor (const it of $input.all()) {\n  const r = it.json || {};\n  const o = objetivos.find(x => String(x.tenant_id) === String(r.tenant_id));\n  const deud = Array.isArray(r.debtors) ? r.debtors : [];\n  if (!o || o.notify.opt_in !== true || !(Number(r.total_outstanding) > 0) || deud.length === 0) { continue; }\n  const lineas = deud.slice(0, cfg.top_n).map((x, i) => {\n    const link = cfg.incluir_wa && x.wa_me_link ? x.wa_me_link : (cfg.app_url && x.customer_id ? cfg.app_url + '/credits/customer/' + x.customer_id : '');\n    return (i + 1) + ') ' + String(x.display_name || 'Cliente').slice(0, 30) + ' $' + fmt(x.balance) + (Number(x.days_overdue) > 0 ? ' (' + x.days_overdue + ' d)' : '') + (link ? ' ' + link : '');\n  });\n  const cab = 'Cartera semanal: $' + fmt(r.total_outstanding) + ' por cobrar a ' + (r.debtors_count || deud.length) + ' cliente(s)' + (Number(r.overdue_total) > 0 ? ', $' + fmt(r.overdue_total) + ' vencido' : '') + '. Mayores deudores:';\n  while (lineas.length > 1 && (cab + '\\n' + lineas.join('\\n')).length > 1400) { lineas.pop(); }\n  out.push({ json: { flow: 'F12-cartera', tenant_id: r.tenant_id, channel: o.notify.channel ? String(o.notify.channel).toLowerCase() : 'whatsapp', severity: 'info', message: cab + '\\n' + lineas.join('\\n'), idempotency_key: 'F12:' + r.tenant_id + ':' + clave } });\n}\nreturn out;"
    },
    position: [2160, 200]
  },
  output: [{ flow: 'F12-cartera', tenant_id: 'tenant-a', channel: 'whatsapp', severity: 'info', message: 'Cartera semanal: $1.500.000 por cobrar a 8 cliente(s).', idempotency_key: 'F12:tenant-a:2026-W42' }]
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
      jsCode: "const plat = $('Preparar config').first().json.plataforma;\nconst fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);\nreturn [{ json: { flow: 'F12-cartera', tenant_id: plat, channel: 'telegram', severity: 'alta', message: 'F12: fallaron ' + $input.all().length + ' consulta(s) de cartera al backend. Revisa /api/internal y la credencial JRPOS Internal Token.', idempotency_key: 'F12:plataforma:' + fecha } }];"
    },
    position: [2160, 480]
  },
  output: [{ flow: 'F12-cartera', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'F12: fallaron 1 consulta(s)', idempotency_key: 'F12:plataforma:2026-10-13' }]
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
  '## MANANA: conectar (F12 Cartera semanal)\n1) Credencial Header Auth "JRPOS Internal Token" en los 2 nodos HTTP.\n2) Backend, endpoints NUEVOS (contrato en n8n/contracts/F12.md): GET /api/internal/notification-targets?flow=F12 y GET /api/internal/tenants/{id}/credits/top-debtors?limit=N (reusa la logica de /api/credits/summary).\n3) jrpos_config: rellenar backend_base_url y app_base_url (enlace por deudor = {app_base_url}/credits/customer/{id}). cartera_top_n (5) ajusta cuantos se listan. cartera_include_wa_links=false por defecto: true hace pasar telefonos de deudores por n8n.\n4) Regla: SOLO se escribe al dueno. Jamas a los deudores (fiado a deudores sigue siendo wa.me manual).\n5) Canal real en I02 y opt-in por tenant. Un mensaje por tienda por semana (clave F12:tenant:semana ISO). No activar sin confirmacion del propietario.',
  [pedirObjetivos, pedirCartera, avisar],
  { color: 4 }
);

pedirCartera.onError(resumirFallos.to(avisarPlataforma));

export default workflow('jrpos-f12-cartera-semanal', 'JRPOS F12 - Cartera semanal')
  .add(programar)
  .to(leerConfig)
  .to(prepararConfig)
  .to(backendListo
    .onTrue(pedirObjetivos.to(separar.to(soloOptIn.to(pedirCartera.to(armarResumen.to(avisar)))))
    )
    .onFalse(sinBackend))
  .add(notaConectar);
