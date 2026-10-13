// JRPOS F10 - Descuadre de caja (subflujo). Fuente en n8n Workflow SDK. Sin secretos.
// Lo llamara I05 (destino "cash.closed") con: tenant_id, event_id, session_id. NO se modifica I05 desde aqui.
// IDs (I02, tabla jrpos_config) son de la instancia actual; ver n8n/README.md. Contrato: n8n/contracts/F10.md
import { workflow, node, trigger, ifElse, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const TABLA_CONFIG = { __rl: true, mode: 'id', value: 'zDL8AK31GyRpU4YB', cachedResultName: 'jrpos_config' };
const SUBFLUJO_NOTIFICADOR = { __rl: true, mode: 'id', value: 'yQY2jFZ7kyTCw3oi', cachedResultName: 'JRPOS I02 - Notificador central' };

const recibir = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Recibir cierre de caja',
    parameters: {
      inputSource: 'workflowInputs',
      workflowInputs: { values: [{ name: 'tenant_id', type: 'string' }, { name: 'event_id', type: 'string' }, { name: 'session_id', type: 'string' }] }
    },
    position: [240, 400]
  },
  output: [{ tenant_id: 'tenant-prueba', event_id: 'evt-0001-prueba', session_id: 'ses-100' }]
});

const leerConfig = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer configuracion',
    parameters: { resource: 'row', operation: 'get', dataTableId: TABLA_CONFIG, returnAll: true },
    position: [480, 400]
  },
  output: [{ config_key: 'backend_base_url', config_value: 'https://backend.test' }, { config_key: 'cash_diff_threshold_default', config_value: '20000' }]
});

const prepararConfig = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparar config',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const t = $('Recibir cierre de caja').first().json;\nconst filas = $input.all().map(i => i.json);\nconst get = (k, d) => { const f = filas.find(x => x.config_key === k); return f && f.config_value !== undefined && f.config_value !== null && f.config_value !== '' ? f.config_value : d; };\nconst base = String(get('backend_base_url', '')).replace(/\\/+$/, '');\nconst umbral = Number(get('cash_diff_threshold_default', '20000'));\nreturn [{ json: { tenant_id: t.tenant_id, event_id: t.event_id, session_id: t.session_id, base_url: base, threshold_default: Number.isFinite(umbral) && umbral > 0 ? umbral : 20000 } }];"
    },
    position: [720, 400]
  },
  output: [{ tenant_id: 'tenant-prueba', event_id: 'evt-0001-prueba', session_id: 'ses-100', base_url: 'https://backend.test', threshold_default: 20000 }]
});

const backendListo = ifElse({
  version: 2.3,
  config: {
    name: 'Backend configurado y datos completos',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ !!($json.base_url && $json.tenant_id && $json.session_id) }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [960, 400]
  }
});

const sinBackend = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin backend configurado: nada que hacer', position: [1200, 560] },
  output: [{}]
});

const pedirCierre = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Pedir resumen del cierre',
    parameters: {
      method: 'GET',
      url: expr("{{ $json.base_url + '/api/internal/tenants/' + encodeURIComponent($json.tenant_id) + '/cash-sessions/' + encodeURIComponent($json.session_id) + '/closing-summary' }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    position: [1200, 300]
  },
  output: [{ tenant_id: 'tenant-prueba', session_id: 'ses-100', register_name: 'Caja 1', closed_at_local: '2026-10-13 21:05', difference: -45000, threshold: 20000, currency: 'COP', notify: { opt_in: true, channel: 'whatsapp' } }]
});

const evaluar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Evaluar descuadre',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const ctx = $('Preparar config').first().json;\nconst r = $input.first().json || {};\nconst fmt = (n) => String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');\nconst base = { tenant_id: ctx.tenant_id, session_id: ctx.session_id, idempotency_key: 'F10:' + ctx.tenant_id + ':' + ctx.session_id, alerta: false, opt_in: false, channel: 'whatsapp', severity: 'alta', message: '', motivo: '' };\nif (String(r.tenant_id) !== String(ctx.tenant_id)) { return [{ json: { ...base, motivo: 'respuesta de otro tenant o sin tenant: descartada' } }]; }\nconst diff = r.difference === null || r.difference === undefined || r.difference === '' ? NaN : Number(r.difference);\nif (!Number.isFinite(diff)) { return [{ json: { ...base, motivo: 'respuesta sin diferencia numerica' } }]; }\nconst thrT = r.threshold === null || r.threshold === undefined || r.threshold === '' ? NaN : Number(r.threshold);\nconst umbral = Number.isFinite(thrT) && thrT > 0 ? thrT : ctx.threshold_default;\nconst abs = Math.abs(diff);\nconst optIn = !!(r.notify && r.notify.opt_in);\nconst canal = (r.notify && r.notify.channel) ? String(r.notify.channel).toLowerCase() : 'whatsapp';\nconst alerta = abs > umbral;\nconst tipo = diff < 0 ? 'faltante' : 'sobrante';\nconst caja = r.register_name ? String(r.register_name).slice(0, 40) : 'la caja';\nconst cuando = r.closed_at_local ? ' (cierre ' + String(r.closed_at_local).slice(0, 25) + ')' : '';\nconst message = 'Descuadre de caja: ' + tipo + ' de $' + fmt(abs) + ' en ' + caja + cuando + '. Umbral: $' + fmt(umbral) + '. Revisa el cierre en la app.';\nreturn [{ json: { ...base, alerta, opt_in: optIn, channel: canal, severity: abs > umbral * 5 ? 'critica' : 'alta', message, motivo: alerta ? (optIn ? '' : 'sin opt-in') : 'bajo umbral', diferencia: diff, umbral } }];"
    },
    position: [1440, 300]
  },
  output: [{ tenant_id: 'tenant-prueba', session_id: 'ses-100', idempotency_key: 'F10:tenant-prueba:ses-100', alerta: true, opt_in: true, channel: 'whatsapp', severity: 'alta', message: 'Descuadre de caja: faltante de $45.000 en Caja 1.', motivo: '', diferencia: -45000, umbral: 20000 }]
});

const hayAviso = ifElse({
  version: 2.3,
  config: {
    name: 'Supera umbral y hay opt-in',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.alerta === true && $json.opt_in === true }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1680, 300]
  }
});

const sinAviso = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin aviso (bajo umbral, sin opt-in o respuesta invalida)', position: [1920, 440] },
  output: [{}]
});

const avisar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar al dueno (I02)',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: SUBFLUJO_NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'F10-descuadre-caja',
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
    position: [1920, 200]
  },
  output: [{ status: 'pendiente_canal' }]
});

const notaConectar = sticky(
  '## MANANA: conectar (F10 Descuadre de caja)\n1) Credencial Header Auth "JRPOS Internal Token" (Authorization: Bearer ...) en el nodo "Pedir resumen del cierre".\n2) Backend: crear GET /api/internal/tenants/{tenant_id}/cash-sessions/{session_id}/closing-summary (contrato en n8n/contracts/F10.md). Aun NO existe.\n3) jrpos_config: rellenar backend_base_url. cash_diff_threshold_default (20000 COP) es el umbral por defecto; el endpoint puede devolver el umbral propio del tenant.\n4) I05: reemplazar el NoOp "Destino F10 caja" por Execute Workflow hacia este flujo con tenant_id, event_id y session_id (= data.session_id del evento cash.closed). I05 NO se toco.\n5) Canal real en I02 y opt-in por tenant (notify.opt_in) en el backend. Sin opt-in no se avisa.\n6) Idempotencia: clave F10:tenant:sesion (I02 deduplica). No activar sin confirmacion del propietario.',
  [pedirCierre, evaluar, avisar],
  { color: 4 }
);

export default workflow('jrpos-f10-descuadre-caja', 'JRPOS F10 - Descuadre de caja')
  .add(recibir)
  .to(leerConfig)
  .to(prepararConfig)
  .to(backendListo
    .onTrue(pedirCierre.to(evaluar.to(hayAviso
      .onTrue(avisar)
      .onFalse(sinAviso))))
    .onFalse(sinBackend))
  .add(notaConectar);
