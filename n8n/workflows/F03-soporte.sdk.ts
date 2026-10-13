// JRPOS F03 - Soporte. Fuente en n8n Workflow SDK.
// IDs de Data Tables y del subflujo I02 son de la instancia actual; ver n8n/README.md.
import { workflow, node, trigger, ifElse, languageModel, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const TABLA_CONFIG = { __rl: true, mode: 'id', value: 'zDL8AK31GyRpU4YB', cachedResultName: 'jrpos_config' };
const TABLA_LOG = { __rl: true, mode: 'id', value: 'umCskhDEBOVpZ2XE', cachedResultName: 'jrpos_notification_log' };
const NOTIFICADOR = { __rl: true, mode: 'id', value: 'yQY2jFZ7kyTCw3oi', cachedResultName: 'JRPOS I02 - Notificador central' };

const esquemaI02 = [
  { id: 'flow', displayName: 'flow', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
  { id: 'tenant_id', displayName: 'tenant_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
  { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
  { id: 'severity', displayName: 'severity', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
  { id: 'message', displayName: 'message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
  { id: 'idempotency_key', displayName: 'idempotency_key', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
];

const ticketCreado = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Evento ticket.created (desde I05)',
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
    position: [240, 200]
  },
  output: [{ event_id: 'evt-demo-0002', type: 'ticket.created', tenant_id: 't-demo-1', data: { ticket_id: 'tk-101', subject: 'No puedo cerrar la caja', message: 'Al cerrar caja sale un error', priority: 'alta', created_at: '2026-10-13T14:00:00Z' } }]
});

const normalizar = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalizar ticket',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'n1', name: 'ticket_id', value: expr('{{ ($json.data?.ticket_id ?? "").toString() }}'), type: 'string' },
          { id: 'n2', name: 'tenant_id', value: expr('{{ ($json.tenant_id || $json.data?.tenant_id || "").toString() }}'), type: 'string' },
          { id: 'n3', name: 'subject', value: expr('{{ ($json.data?.subject ?? "").toString().slice(0, 200) }}'), type: 'string' },
          { id: 'n4', name: 'message', value: expr('{{ ($json.data?.message ?? "").toString().slice(0, 600) }}'), type: 'string' },
          { id: 'n5', name: 'priority', value: expr('{{ ($json.data?.priority ?? "media").toString().toLowerCase() }}'), type: 'string' }
        ]
      }
    },
    position: [480, 200]
  },
  output: [{ ticket_id: 'tk-101', tenant_id: 't-demo-1', subject: 'No puedo cerrar la caja', message: 'Al cerrar caja sale un error', priority: 'alta' }]
});

const ticketValido = ifElse({
  version: 2.3,
  config: {
    name: 'Ticket con id y tenant',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          { leftValue: expr('{{ $json.ticket_id }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' },
          { leftValue: expr('{{ $json.tenant_id }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }
        ],
        combinator: 'and'
      }
    },
    position: [720, 200]
  }
});

const descartarTicket = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Descartado: ticket incompleto', position: [960, 40] },
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
    position: [960, 280]
  },
  output: [{ id: 6, config_key: 'backend_base_url', config_value: 'https://backend.invalid' }]
});

const leerCanal = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer canal de la plataforma',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLA_CONFIG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'config_key', condition: 'eq', keyValue: 'default_channel' }] },
      limit: 1
    },
    position: [1200, 280]
  },
  output: [{ id: 2, config_key: 'default_channel', config_value: 'telegram' }]
});

const modeloIA = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatMistralCloud',
  version: 1,
  config: {
    name: 'Modelo de urgencia',
    parameters: { model: 'mistral-small-latest', options: { maxTokens: 250, temperature: 0.1 } },
    position: [1440, 480]
  }
});

const clasificarIA = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Clasificar urgencia con IA',
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr('Asunto: {{ $("Normalizar ticket").first().json.subject }}\nMensaje: {{ $("Normalizar ticket").first().json.message }}\nPrioridad indicada por el usuario: {{ $("Normalizar ticket").first().json.priority }}'),
      messages: {
        messageValues: [
          {
            type: 'SystemMessagePromptTemplate',
            message: 'Eres el triage de soporte de JRPOS, un punto de venta para tiendas. Clasifica la urgencia del ticket: critica (no pueden vender ni cobrar, perdida de dinero o datos), alta (una funcion clave falla pero hay alternativa), media (error parcial o duda con impacto moderado), baja (consulta o mejora). Responde SOLO con JSON valido, sin texto adicional: {"urgencia":"baja|media|alta|critica","motivo":"max 15 palabras","nota":"respuesta sugerida de maximo 3 frases para el equipo de soporte, sin datos personales"}.'
          }
        ]
      }
    },
    subnodes: { model: modeloIA },
    position: [1440, 280]
  },
  output: [{ text: '{"urgencia":"critica","motivo":"No pueden cerrar caja","nota":"Pedir captura del error y revisar el cierre de caja del tenant."}' }]
});

const parsear = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Resolver urgencia',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: "const t = $('Normalizar ticket').first().json;\nconst canalFila = $('Leer canal de la plataforma').first().json;\nconst canal = (canalFila && canalFila.config_value) ? canalFila.config_value : 'telegram';\nconst raw = ($json.text || '').toString();\nlet ia = null;\ntry { const m = raw.match(/\\{[\\s\\S]*\\}/); ia = m ? JSON.parse(m[0]) : null; } catch (e) { ia = null; }\nconst niveles = ['baja', 'media', 'alta', 'critica'];\nconst porPrioridad = { baja: 'baja', media: 'media', normal: 'media', alta: 'alta', urgente: 'critica', critica: 'critica' };\nconst base = porPrioridad[t.priority] || 'media';\nconst nivelIA = ia && niveles.includes(String(ia.urgencia || '').toLowerCase()) ? String(ia.urgencia).toLowerCase() : null;\nconst urgencia = nivelIA && niveles.indexOf(nivelIA) > niveles.indexOf(base) ? nivelIA : base;\nconst nota = ia && ia.nota ? String(ia.nota).slice(0, 500) : '';\nconst severity = urgencia === 'critica' ? 'critica' : (urgencia === 'alta' ? 'alta' : 'info');\nconst message = 'Ticket nuevo ' + t.ticket_id + ' (tenant ' + t.tenant_id + ') urgencia ' + urgencia + ': ' + t.subject;\nreturn { json: { ticket_id: t.ticket_id, tenant_id: t.tenant_id, subject: t.subject, urgencia, fuente_urgencia: nivelIA ? 'ia' : 'prioridad', nota_sugerida: nota, severity, channel: canal, message: message.slice(0, 500), idempotency_key: 'F03:ticket:' + t.ticket_id + ':nuevo' } };"
    },
    position: [1680, 280]
  },
  output: [{ ticket_id: 'tk-101', tenant_id: 't-demo-1', subject: 'No puedo cerrar la caja', urgencia: 'critica', fuente_urgencia: 'ia', nota_sugerida: 'Pedir captura del error.', severity: 'critica', channel: 'telegram', message: 'Ticket nuevo tk-101 (tenant t-demo-1) urgencia critica: No puedo cerrar la caja', idempotency_key: 'F03:ticket:tk-101:nuevo' }]
});

const yaAvisado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Ticket ya avisado',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'idempotency_key', condition: 'eq', keyValue: expr('{{ $json.idempotency_key }}') }] }
    },
    position: [1920, 160]
  },
  output: [{ ticket_id: 'tk-101', tenant_id: 't-demo-1', urgencia: 'critica', severity: 'critica', channel: 'telegram', message: 'Ticket nuevo tk-101 (tenant t-demo-1) urgencia critica: No puedo cerrar la caja', idempotency_key: 'F03:ticket:tk-101:nuevo' }]
});

const avisarSuperadmin = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Avisar al superadmin (I02)',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'F03-soporte',
          tenant_id: 'plataforma',
          channel: expr('{{ $json.channel }}'),
          severity: expr('{{ $json.severity }}'),
          message: expr('{{ $json.message }}'),
          idempotency_key: expr('{{ $json.idempotency_key }}')
        },
        matchingColumns: [],
        schema: esquemaI02,
        attemptToConvertTypes: false
      }
    },
    onError: 'continueRegularOutput',
    position: [2160, 160]
  },
  output: [{ status: 'pendiente_canal' }]
});

const backendListoNota = ifElse({
  version: 2.3,
  config: {
    name: 'Backend configurado (nota)',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          { leftValue: expr('{{ $("Leer backend_base_url").first().json.config_value || "" }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' },
          { leftValue: expr('{{ $json.nota_sugerida }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }
        ],
        combinator: 'and'
      }
    },
    position: [1920, 400]
  }
});

const sinNota = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin nota que guardar', position: [2160, 520] },
  output: [{}]
});

const guardarNota = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Guardar triage en el ticket',
    parameters: {
      method: 'PUT',
      url: expr('{{ $("Leer backend_base_url").first().json.config_value }}/api/internal/tickets/{{ $json.ticket_id }}/triage'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $json.tenant_id, urgency: $json.urgencia, urgency_source: $json.fuente_urgencia, suggested_note: $json.nota_sugerida }) }}'),
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    onError: 'continueRegularOutput',
    position: [2160, 380]
  },
  output: [{ ticket_id: 'tk-101', saved: true }]
});

const recordatorioHora = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Cada hora entre 8 y 20',
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '17 8-20 * * *' }] } },
    position: [240, 760]
  },
  output: [{}]
});

const leerBaseRecordatorio = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer backend_base_url (recordatorios)',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLA_CONFIG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'config_key', condition: 'eq', keyValue: 'backend_base_url' }] },
      limit: 1
    },
    position: [480, 760]
  },
  output: [{ id: 6, config_key: 'backend_base_url', config_value: 'https://backend.invalid' }]
});

const leerCanalRecordatorio = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer canal (recordatorios)',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLA_CONFIG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'config_key', condition: 'eq', keyValue: 'default_channel' }] },
      limit: 1
    },
    position: [720, 760]
  },
  output: [{ id: 2, config_key: 'default_channel', config_value: 'telegram' }]
});

const backendListoRecordatorio = ifElse({
  version: 2.3,
  config: {
    name: 'Backend configurado (recordatorios)',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $("Leer backend_base_url (recordatorios)").first().json.config_value || "" }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [960, 760]
  }
});

const sinBackendRecordatorio = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Sin backend (recordatorios)', position: [1200, 900] },
  output: [{}]
});

const consultarAbiertos = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Consultar tickets abiertos',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Leer backend_base_url (recordatorios)").first().json.config_value }}/api/internal/tickets/open'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'older_than_hours', value: '24' }] },
      options: { timeout: 15000 }
    },
    credentials: { httpHeaderAuth: newCredential('JRPOS Internal Token') },
    position: [1200, 660]
  },
  output: [{ tickets: [{ ticket_id: 'tk-090', tenant_id: 't-demo-1', status: 'abierto', urgency: 'alta', subject: 'Impresora no imprime', age_hours: 30 }] }]
});

const separarAbiertos = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Separar tickets', parameters: { fieldToSplitOut: 'tickets', include: 'noOtherFields' }, position: [1440, 660] },
  output: [{ ticket_id: 'tk-090', tenant_id: 't-demo-1', status: 'abierto', urgency: 'alta', subject: 'Impresora no imprime', age_hours: 30 }]
});

const filtroAbiertos = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Abierto hace mas de 24 h',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          { leftValue: expr('{{ $json.status }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'abierto' },
          { leftValue: expr('{{ $json.age_hours }}'), operator: { type: 'number', operation: 'gte' }, rightValue: 24 }
        ],
        combinator: 'and'
      }
    },
    position: [1680, 660]
  },
  output: [{ ticket_id: 'tk-090', tenant_id: 't-demo-1', status: 'abierto', urgency: 'alta', subject: 'Impresora no imprime', age_hours: 30 }]
});

const armarRecordatorio = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Armar recordatorio',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'q1', name: 'tenant_id', value: 'plataforma', type: 'string' },
          { id: 'q2', name: 'channel', value: expr('{{ $("Leer canal (recordatorios)").first().json.config_value || "telegram" }}'), type: 'string' },
          { id: 'q3', name: 'severity', value: 'alta', type: 'string' },
          { id: 'q4', name: 'message', value: expr('{{ "Recordatorio: el ticket " + $json.ticket_id + " (tenant " + $json.tenant_id + ", urgencia " + ($json.urgency || "sin clasificar") + ") sigue abierto hace " + Math.floor($json.age_hours) + " h: " + ($json.subject || "").toString().slice(0, 120) }}'), type: 'string' },
          { id: 'q5', name: 'idempotency_key', value: expr('{{ "F03:ticket:" + $json.ticket_id + ":recordatorio-24h" }}'), type: 'string' }
        ]
      }
    },
    position: [1920, 660]
  },
  output: [{ tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Recordatorio: el ticket tk-090 sigue abierto hace 30 h.', idempotency_key: 'F03:ticket:tk-090:recordatorio-24h' }]
});

const recordatorioYaEnviado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Recordatorio ya enviado',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: TABLA_LOG,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'idempotency_key', condition: 'eq', keyValue: expr('{{ $json.idempotency_key }}') }] }
    },
    position: [2160, 660]
  },
  output: [{ tenant_id: 'plataforma', channel: 'telegram', severity: 'alta', message: 'Recordatorio: el ticket tk-090 sigue abierto hace 30 h.', idempotency_key: 'F03:ticket:tk-090:recordatorio-24h' }]
});

const enviarRecordatorio = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Enviar recordatorio (I02)',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: NOTIFICADOR,
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          flow: 'F03-soporte-recordatorio',
          tenant_id: 'plataforma',
          channel: expr('{{ $json.channel }}'),
          severity: expr('{{ $json.severity }}'),
          message: expr('{{ $json.message }}'),
          idempotency_key: expr('{{ $json.idempotency_key }}')
        },
        matchingColumns: [],
        schema: esquemaI02,
        attemptToConvertTypes: false
      }
    },
    onError: 'continueRegularOutput',
    position: [2400, 660]
  },
  output: [{ status: 'pendiente_canal' }]
});

const notaConectar = sticky(
  '## MANANA: conectar\n1) En I05, sustituir el nodo "Destino F03 soporte" por Execute Workflow a este flujo (entradas: event_id, type, tenant_id, data con ticket_id, subject, message, priority). El backend debe emitir el evento ticket.created.\n2) Credencial Header Auth "JRPOS Internal Token" en los 2 nodos HTTP y fila backend_base_url en jrpos_config.\n3) Backend: PUT /api/internal/tickets/{id}/triage y GET /api/internal/tickets/open?older_than_hours=24 (contrato en n8n/contracts/F03.md).\n4) Canal de la plataforma (Telegram o WhatsApp al superadmin): fila default_channel de jrpos_config + conectar el canal en I02.\n5) IA: "Modelo de urgencia" es un marcador sin credencial (nodo Mistral elegido a proposito: no hay credencial Mistral en la instancia y asi no se enlaza una ajena). Sustituirlo por el modelo de tu preferencia con credencial propia de JRPOS y reconectarlo a "Clasificar urgencia con IA". Sin IA el flujo usa la prioridad del usuario.\n6) Recordatorio: una sola vez por ticket (clave :recordatorio-24h), de 8 a 20 h.\n7) Probar con un ticket de prueba; activar solo con confirmacion del propietario.',
  [ticketCreado, modeloIA, guardarNota, consultarAbiertos],
  { color: 4 }
);

export default workflow('jrpos-f03-soporte', 'JRPOS F03 - Soporte')
  .add(ticketCreado)
  .to(normalizar)
  .to(ticketValido
    .onTrue(leerBase.to(leerCanal.to(clasificarIA.to(parsear.to(yaAvisado.to(avisarSuperadmin))))))
    .onFalse(descartarTicket))
  .add(parsear)
  .to(backendListoNota.onTrue(guardarNota).onFalse(sinNota))
  .add(recordatorioHora)
  .to(leerBaseRecordatorio)
  .to(leerCanalRecordatorio)
  .to(backendListoRecordatorio
    .onTrue(consultarAbiertos.to(separarAbiertos.to(filtroAbiertos.to(armarRecordatorio.to(recordatorioYaEnviado.to(enviarRecordatorio))))))
    .onFalse(sinBackendRecordatorio))
  .add(notaConectar);
