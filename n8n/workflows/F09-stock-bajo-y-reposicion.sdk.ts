// JRPOS F09 - Stock bajo y reposicion. Fuente en n8n Workflow SDK. Sin secretos.
// Diario 7:00 (Bogota). Por tenant con opt-in: stock bajo -> borrador de OC (estado "borrador") -> UN aviso al dueno
// con enlace para aprobar en la app. Nunca se envia nada al proveedor desde n8n. Contrato: n8n/contracts/F09.md
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
  config: { name: 'Diario 7:00', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 0 }] } }, position: [240, 400] },
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
      jsCode: "const filas = $input.all().map(i => i.json);\nconst get = (k, d) => { const f = filas.find(x => x.config_key === k); return f && f.config_value !== undefined && f.config_value !== null && f.config_value !== '' ? String(f.config_value) : d; };\nreturn [{ json: { base_url: get('backend_base_url', '').replace(/\\/+$/, ''), app_url: get('app_base_url', '').replace(/\\/+$/, ''), plataforma: get('platform_tenant_id', 'plataforma') } }];"
    },
    position: [720, 400]
  },
  output: [{ base_url: 'https://backend.test', app_url: 'https://app.test', plataforma: 'plataforma' }]
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
      url: expr("{{ $json.base_url + '/api/internal/notification-targets?flow=F09' }}"),
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

const pedirStock = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir stock bajo por tienda',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Preparar config').first().json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/low-stock' }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueErrorOutput',
    position: [1920, 300]
  },
  output: [{ tenant_id: 'tenant-a', items: [{ product_id: 'p1', name: 'Producto 1', stock: 2, min_stock: 10, suggested_qty: 20, supplier_id: 's1', supplier_name: 'Proveedor 1', unit_cost: 1500 }] }]
});

const agrupar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Agrupar por proveedor',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const objetivos = $('Solo tenants con opt-in').all().map(i => i.json);\nconst fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);\nconst out = [];\nfor (const it of $input.all()) {\n  const r = it.json || {};\n  if (!r.tenant_id || !Array.isArray(r.items) || r.items.length === 0) { continue; }\n  if (!objetivos.some(o => String(o.tenant_id) === String(r.tenant_id))) { continue; }\n  const grupos = {};\n  for (const p of r.items) {\n    const k = p.supplier_id || 'sin_proveedor';\n    if (!grupos[k]) { grupos[k] = { supplier_id: p.supplier_id || null, supplier_name: String(p.supplier_name || 'Sin proveedor').slice(0, 60), lines: [] }; }\n    const falta = Number(p.min_stock) - Number(p.stock);\n    const qty = Number(p.suggested_qty) > 0 ? Number(p.suggested_qty) : Math.max(1, Number.isFinite(falta) ? falta : 1);\n    grupos[k].lines.push({ product_id: p.product_id, qty, unit_cost: p.unit_cost === undefined ? null : p.unit_cost });\n  }\n  out.push({ json: { tenant_id: r.tenant_id, items_count: r.items.length, top_names: r.items.slice(0, 3).map(p => String(p.name || '').slice(0, 40)), drafts: Object.values(grupos), idempotency_key: 'F09:' + r.tenant_id + ':' + fecha } });\n}\nreturn out;"
    },
    position: [2160, 200]
  },
  output: [{ tenant_id: 'tenant-a', items_count: 1, top_names: ['Producto 1'], drafts: [{ supplier_id: 's1', supplier_name: 'Proveedor 1', lines: [{ product_id: 'p1', qty: 20, unit_cost: 1500 }] }], idempotency_key: 'F09:tenant-a:2026-10-13' }]
});

const crearBorrador = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Crear borrador de OC',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Preparar config').first().json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/purchase-orders/draft' }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ idempotency_key: $json.idempotency_key, source: 'n8n-F09', orders: $json.drafts }) }}"),
      options: { timeout: 20000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueErrorOutput',
    position: [2400, 200]
  },
  output: [{ tenant_id: 'tenant-a', created: true, orders: [{ id: 'oc-1', supplier_name: 'Proveedor 1', lines_count: 1, total_estimate: 30000, status: 'borrador' }] }]
});

const armarAviso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Armar aviso por tienda',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const objetivos = $('Solo tenants con opt-in').all().map(i => i.json);\nconst ctx = $('Agrupar por proveedor').all().map(i => i.json);\nconst app = $('Preparar config').first().json.app_url;\nconst fmt = (n) => String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');\nconst out = [];\nfor (const it of $input.all()) {\n  const r = it.json || {};\n  const c = ctx.find(x => String(x.tenant_id) === String(r.tenant_id));\n  const o = objetivos.find(x => String(x.tenant_id) === String(r.tenant_id));\n  if (!c || !o || !o.notify || o.notify.opt_in !== true || !Array.isArray(r.orders) || r.orders.length === 0) { continue; }\n  const total = r.orders.reduce((s, x) => s + (Number(x.total_estimate) || 0), 0);\n  const lista = c.top_names.join(', ') + (c.items_count > 3 ? ' y ' + (c.items_count - 3) + ' mas' : '');\n  const msg = 'Stock bajo: ' + c.items_count + ' producto(s) bajo el minimo (' + lista + '). Deje ' + r.orders.length + ' borrador(es) de orden de compra por ~$' + fmt(total) + '. No se envia nada al proveedor hasta que lo apruebes' + (app ? ': ' + app + '/compras' : ' en la app') + '.';\n  out.push({ json: { flow: 'F09-stock-bajo', tenant_id: r.tenant_id, channel: o.notify.channel ? String(o.notify.channel).toLowerCase() : 'whatsapp', severity: 'info', message: msg, idempotency_key: c.idempotency_key } });\n}\nreturn out;"
    },
    position: [2640, 200]
  },
  output: [{ flow: 'F09-stock-bajo', tenant_id: 'tenant-a', channel: 'whatsapp', severity: 'info', message: 'Stock bajo: 1 producto(s) bajo el minimo.', idempotency_key: 'F09:tenant-a:2026-10-13' }]
});

const avisar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar al dueno (I02)',
    parameters: { mode: 'each', source: 'database', workflowId: SUBFLUJO_NOTIFICADOR, workflowInputs: ENTRADA_I02 },
    onError: 'continueRegularOutput',
    position: [2880, 200]
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
      jsCode: "const plat = $('Preparar config').first().json.plataforma;\nconst fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);\nreturn [{ json: { flow: 'F09-stock-bajo', tenant_id: plat, channel: 'telegram', severity: 'alta', message: 'F09: fallaron ' + $input.all().length + ' consulta(s) al backend (stock bajo o borrador de OC). Revisa /api/internal y la credencial JRPOS Internal Token.', idempotency_key: 'F09:plataforma:' + fecha } }];"
    },
    position: [2160, 480]
  },
  output: [{ flow: 'F09-stock-bajo', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'F09: fallaron 1 consulta(s)', idempotency_key: 'F09:plataforma:2026-10-13' }]
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
  '## MANANA: conectar (F09 Stock bajo y reposicion)\n1) Credencial Header Auth "JRPOS Internal Token" en los 3 nodos HTTP (Pedir tiendas, Pedir stock bajo, Crear borrador de OC).\n2) Backend, endpoints NUEVOS (contrato en n8n/contracts/F09.md): GET /api/internal/notification-targets?flow=F09, GET /api/internal/tenants/{id}/low-stock, POST /api/internal/tenants/{id}/purchase-orders/draft (idempotente por idempotency_key).\n3) BD faltante: products.min_stock (stock minimo por producto) y estado "borrador" en purchase_orders (hoy nace "enviada"). Sin eso el endpoint no puede decidir ni crear borradores.\n4) jrpos_config: rellenar backend_base_url y app_base_url (el enlace del aviso es {app_base_url}/compras).\n5) Aprobacion: el dueno aprueba el borrador DENTRO de la app. Este flujo nunca envia la OC al proveedor.\n6) Canal real en I02 y opt-in por tenant. Un mensaje resumen por tienda y dia. No activar sin confirmacion del propietario.',
  [pedirObjetivos, pedirStock, crearBorrador, avisar],
  { color: 4 }
);

pedirStock.onError(resumirFallos.to(avisarPlataforma));
crearBorrador.onError(resumirFallos);

export default workflow('jrpos-f09-stock-bajo', 'JRPOS F09 - Stock bajo y reposicion')
  .add(programar)
  .to(leerConfig)
  .to(prepararConfig)
  .to(backendListo
    .onTrue(pedirObjetivos.to(separar.to(soloOptIn.to(pedirStock.to(agrupar.to(crearBorrador.to(armarAviso.to(avisar)))))))
    )
    .onFalse(sinBackend))
  .add(notaConectar);
