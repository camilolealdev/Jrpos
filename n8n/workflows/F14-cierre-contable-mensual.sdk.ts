// JRPOS F14 - Cierre contable mensual. Fuente en n8n Workflow SDK. Sin secretos ni correos reales.
// Dia 1 de cada mes, 6:00 (Bogota). Por tenant con opt-in del dueno Y consentimiento para enviar al contador:
// descarga el accounting-export del mes anterior, lo entrega al contador (marcador PENDIENTE DE CONECTAR) y avisa al dueno.
// Una vez por periodo (clave F14:tenant:YYYY-MM). Contrato: n8n/contracts/F14.md
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
  config: { name: 'Dia 1 de cada mes 6:00', parameters: { rule: { interval: [{ field: 'months', monthsInterval: 1, triggerAtDayOfMonth: 1, triggerAtHour: 6, triggerAtMinute: 0 }] } }, position: [240, 400] },
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
    name: 'Preparar config y periodo',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const filas = $input.all().map(i => i.json);\nconst get = (k, d) => { const f = filas.find(x => x.config_key === k); return f && f.config_value !== undefined && f.config_value !== null && f.config_value !== '' ? String(f.config_value) : d; };\nconst d = new Date(Date.now() - 5 * 3600 * 1000);\nconst y = d.getUTCFullYear();\nconst m = d.getUTCMonth();\nconst py = m === 0 ? y - 1 : y;\nconst pm = m === 0 ? 12 : m;\nreturn [{ json: { base_url: get('backend_base_url', '').replace(/\\/+$/, ''), plataforma: get('platform_tenant_id', 'plataforma'), periodo: py + '-' + String(pm).padStart(2, '0') } }];"
    },
    position: [720, 400]
  },
  output: [{ base_url: 'https://backend.test', plataforma: 'plataforma', periodo: '2026-09' }]
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
  config: { name: 'Sin backend configurado: nada que hacer', position: [1200, 700] },
  output: [{}]
});

const pedirObjetivos = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir tiendas con opt-in y contador',
    parameters: {
      method: 'GET',
      url: expr("{{ $json.base_url + '/api/internal/notification-targets?flow=F14' }}"),
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
  output: [{ tenants: [{ tenant_id: 'tenant-a', notify: { opt_in: true, channel: 'email' }, accountant: { configured: true, opt_in: true } }] }]
});

const separar = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Una fila por tienda', parameters: { fieldToSplitOut: 'tenants', include: 'noOtherFields' }, position: [1440, 300] },
  output: [{ tenant_id: 'tenant-a', notify: { opt_in: true, channel: 'email' }, accountant: { configured: true, opt_in: true } }]
});

const soloConsentidos = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Solo dueno con opt-in y contador consentido',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.notify?.opt_in === true && $json.accountant?.configured === true && $json.accountant?.opt_in === true && !!$json.tenant_id }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1680, 300]
  },
  output: [{ tenant_id: 'tenant-a', notify: { opt_in: true, channel: 'email' }, accountant: { configured: true, opt_in: true } }]
});

const pedirContacto = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir contacto del contador',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Preparar config y periodo').first().json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/accountant-contact' }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueErrorOutput',
    position: [1920, 300]
  },
  output: [{ tenant_id: 'tenant-a', accountant_email: '(oculto)', accountant_opt_in: true }]
});

const descargarExport = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Descargar export contable del mes',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Preparar config y periodo').first().json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/accounting-export?period=' + $('Preparar config y periodo').first().json.periodo + '&format=csv' }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'export' } } }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueErrorOutput',
    position: [2160, 300]
  },
  output: [{}]
});

const entregarContador = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Enviar al contador (PENDIENTE DE CONECTAR)',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'c1', name: 'tenant_id', value: expr("{{ $('Pedir contacto del contador').item.json.tenant_id }}"), type: 'string' },
          { id: 'c2', name: 'periodo', value: expr("{{ $('Preparar config y periodo').first().json.periodo }}"), type: 'string' },
          { id: 'c3', name: 'delivery_status', value: 'pendiente_canal', type: 'string' }
        ]
      }
    },
    position: [2400, 300]
  },
  output: [{ tenant_id: 'tenant-a', periodo: '2026-09', delivery_status: 'pendiente_canal' }]
});

const armarAviso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Armar aviso al dueno',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const objetivos = $('Solo dueno con opt-in y contador consentido').all().map(i => i.json);\nconst out = [];\nfor (const it of $input.all()) {\n  const r = it.json || {};\n  const o = objetivos.find(x => String(x.tenant_id) === String(r.tenant_id));\n  if (!o || o.notify.opt_in !== true || !r.periodo) { continue; }\n  const entregado = r.delivery_status === 'enviado';\n  const message = 'Cierre contable ' + r.periodo + ': el archivo de exportacion ' + (entregado ? 'se envio a tu contador.' : 'quedo preparado para tu contador (envio pendiente de activar).') + ' Si algo no cuadra, revisalo en la app antes de la declaracion.';\n  out.push({ json: { flow: 'F14-cierre-contable', tenant_id: r.tenant_id, channel: o.notify.channel ? String(o.notify.channel).toLowerCase() : 'email', severity: 'info', message, idempotency_key: 'F14:' + r.tenant_id + ':' + r.periodo } });\n}\nreturn out;"
    },
    position: [2640, 300]
  },
  output: [{ flow: 'F14-cierre-contable', tenant_id: 'tenant-a', channel: 'email', severity: 'info', message: 'Cierre contable 2026-09: el archivo de exportacion quedo preparado.', idempotency_key: 'F14:tenant-a:2026-09' }]
});

const avisar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar al dueno (I02)',
    parameters: { mode: 'each', source: 'database', workflowId: SUBFLUJO_NOTIFICADOR, workflowInputs: ENTRADA_I02 },
    onError: 'continueRegularOutput',
    position: [2880, 300]
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
      jsCode: "const cfg = $('Preparar config y periodo').first().json;\nreturn [{ json: { flow: 'F14-cierre-contable', tenant_id: cfg.plataforma, channel: 'telegram', severity: 'alta', message: 'F14: fallaron ' + $input.all().length + ' llamada(s) al backend (contacto o export contable ' + cfg.periodo + '). Revisa /api/internal y la credencial JRPOS Internal Token.', idempotency_key: 'F14:plataforma:' + cfg.periodo } }];"
    },
    position: [2160, 600]
  },
  output: [{ flow: 'F14-cierre-contable', tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'F14: fallaron 1 llamada(s)', idempotency_key: 'F14:plataforma:2026-09' }]
});

const avisarPlataforma = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar a la plataforma (I02)',
    parameters: { mode: 'once', source: 'database', workflowId: SUBFLUJO_NOTIFICADOR, workflowInputs: ENTRADA_I02 },
    onError: 'continueRegularOutput',
    position: [2400, 600]
  },
  output: [{ status: 'pendiente_canal' }]
});

const notaConectar = sticky(
  '## MANANA: conectar (F14 Cierre contable mensual)\n1) Credencial Header Auth "JRPOS Internal Token" en los 4 nodos HTTP.\n2) Backend, endpoints NUEVOS (contrato en n8n/contracts/F14.md): GET /api/internal/notification-targets?flow=F14 (incluye accountant.configured/opt_in), GET /api/internal/tenants/{id}/accountant-contact, GET /api/internal/tenants/{id}/accounting-export?period=YYYY-MM&format=csv (reusa /api/reports/accounting-export).\n3) BD faltante: email del contador por tenant + consentimiento del dueno para enviarle datos (notification_prefs.accountant_email / accountant_opt_in). El contador es un TERCERO: sin consentimiento explicito no se envia nada.\n4) Reemplazar el marcador "Enviar al contador (PENDIENTE DE CONECTAR)" por un nodo Email (SMTP) con adjunto = binario "export", destinatario = accountant_email de "Pedir contacto del contador" y delivery_status = enviado. El correo del contador no se guarda en el repo ni en tablas n8n.\n5) La clave F14:tenant:periodo asegura un solo aviso por mes. Canal real en I02. No activar sin confirmacion del propietario.',
  [pedirObjetivos, pedirContacto, descargarExport, entregarContador, avisar],
  { color: 4 }
);

pedirContacto.onError(resumirFallos.to(avisarPlataforma));
descargarExport.onError(resumirFallos);

export default workflow('jrpos-f14-cierre-contable', 'JRPOS F14 - Cierre contable mensual')
  .add(programar)
  .to(leerConfig)
  .to(prepararConfig)
  .to(backendListo
    .onTrue(pedirObjetivos.to(separar.to(soloConsentidos.to(pedirContacto.to(descargarExport.to(entregarContador.to(armarAviso.to(avisar)))))))
    )
    .onFalse(sinBackend))
  .add(notaConectar);
