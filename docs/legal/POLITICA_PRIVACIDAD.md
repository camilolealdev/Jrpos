# Política de Tratamiento de Datos Personales y Aviso de Privacidad — JRPOS

**Última actualización:** 2026-09-14
**Versión:** 1.0

> ⚠️ **Plantilla legal, no asesoría jurídica.** Este documento fue redactado a partir del funcionamiento real de la plataforma (modelo de datos, integraciones, arquitectura multi-tenant). Antes de publicarlo, completa los campos marcados como `[COMPLETAR: ...]` con los datos reales de la sociedad/persona responsable y haz que un abogado especializado en protección de datos lo revise. No sustituye una revisión legal profesional.

## 1. Identificación del Responsable

| Campo | Valor |
|---|---|
| Razón social | `[COMPLETAR: Razón social / persona natural registrada]` |
| NIT | `[COMPLETAR: NIT]` |
| Domicilio principal | `[COMPLETAR: Ciudad, país]` |
| Correo de contacto (protección de datos / PQR) | `[COMPLETAR: privacidad@tu-dominio.com]` |
| Sitio web / plataforma | JRPOS (Sistema POS multi-tenant para comercio minorista) |

En este documento, "**JRPOS**", "**la Plataforma**", "**nosotros**" se refiere al proveedor identificado arriba, propietario y operador del software JRPOS.

## 2. Marco normativo

Esta política se rige por la legislación colombiana de protección de datos personales, en particular:

- **Constitución Política de Colombia**, artículo 15 (derecho a la intimidad y al habeas data).
- **Ley Estatutaria 1581 de 2012** — Régimen general de protección de datos personales.
- **Decreto 1377 de 2013**, compilado en el **Decreto Único Reglamentario 1074 de 2015**, Título 2, Capítulo 25.
- **Ley 1266 de 2008** (habeas data financiero, crediticio y comercial) — aplicable a la información de créditos/fiados que los comercios registran sobre sus clientes.
- Las circulares e instrucciones vigentes de la **Superintendencia de Industria y Comercio (SIC)**.

Si en el futuro JRPOS presta servicio a usuarios fuera de Colombia, se evaluará la aplicación adicional de normas como el RGPD (UE) u otras leyes locales de protección de datos, y se actualizará esta política en consecuencia.

## 3. Modelo de roles: JRPOS como SaaS multi-tenant

JRPOS es un software como servicio (SaaS) **multi-tenant**: cada negocio (tienda de abarrotes, comercio minorista) que se registra ("**Tenant**" o "**Cliente-Negocio**") opera su propia instancia lógica de datos, aislada de otros tenants mediante control de acceso a nivel de fila (*Row-Level Security*) en la base de datos.

Esto genera **dos roles distintos** frente a la protección de datos, y es importante distinguirlos:

1. **Datos de la relación JRPOS ↔ Tenant** (cuenta de la plataforma, datos del negocio, facturación de la suscripción SaaS): aquí **JRPOS actúa como Responsable del Tratamiento**.
2. **Datos que el Tenant captura en la Plataforma sobre sus propios clientes, proveedores y empleados** (por ejemplo, un cliente de la tienda de abarrotes, o un cajero contratado por el Tenant): aquí **el Tenant es el Responsable del Tratamiento** y **JRPOS actúa únicamente como Encargado del Tratamiento**, procesando esos datos por instrucción del Tenant y solo para prestarle el servicio contratado.

Las condiciones específicas de esta relación Responsable–Encargado se detallan en el **[Acuerdo de Tratamiento de Datos](./ACUERDO_TRATAMIENTO_DATOS.md)**, que forma parte integral de los [Términos y Condiciones](./TERMINOS_Y_CONDICIONES.md).

**Si eres cliente, proveedor o empleado de un negocio que usa JRPOS** (no el administrador de la cuenta), tus derechos como titular de datos deben ejercerse, en primer lugar, ante ese negocio (el Responsable). JRPOS colabora con el Tenant para atender dichas solicitudes en su calidad de Encargado.

## 4. Datos personales que se recolectan

### 4.1 Datos de la cuenta de la Plataforma (usuarios del Tenant)
- Nombre completo, correo electrónico, contraseña (almacenada como *hash* irreversible con `bcrypt`, nunca en texto plano).
- Rol dentro del negocio (administrador, supervisor, cajero, contador, mesero, etc.).
- Identificador de cuenta de Google (`google_id`), si el usuario elige "Ingresar con Google" (OAuth / Google Identity Services). No accedemos a la contraseña de tu cuenta de Google.
- Registros de intentos de inicio de sesión, con fines de seguridad (bloqueo por intentos fallidos).

### 4.2 Datos del negocio (Tenant)
- Razón social, NIT/RUT, teléfono, correo electrónico, tipo de comercio.
- Datos de sucursales: nombre, dirección, ciudad, teléfono.
- Configuración de facturación (mensaje de ticket, personalización de tema, resolución DIAN si aplica).

### 4.3 Datos de clientes y proveedores del negocio (capturados por el Tenant)
- Nombre, tipo y número de documento (CC/NIT), correo, teléfono, dirección, ciudad.
- Historial de compras, saldos y cupos de crédito ("fiados"), abonos y estado de cartera — **dato de naturaleza financiera y crediticia**, sujeto también a la Ley 1266 de 2008.
- Recordatorios de cartera generados desde la Plataforma, que el propio usuario del Tenant decide enviar a través de WhatsApp (JRPOS prepara el mensaje; el envío ocurre desde el WhatsApp personal/comercial del usuario, no mediante un servicio automatizado de mensajería operado por JRPOS).

### 4.4 Datos de empleados del negocio
- Nombre y rol de empleados/cajeros para control de marcación (hora de entrada/salida, tardanzas). **No se captura información biométrica** (huella, rostro, etc.); el registro de marcación se realiza mediante inicio de sesión del propio usuario.
- Datos del módulo de Nómina Electrónica (**en modo simulado**, ver sección 4.6): nombre del empleado, período, salario, bonificaciones, deducciones, neto a pagar.
- Reglas de comisiones por vendedor.

### 4.5 Imágenes procesadas con Inteligencia Artificial (OCR de facturas)
El módulo "Escanear Factura IA" envía la imagen de la factura de compra que el usuario del Tenant decide cargar a la **API de Google Gemini (Vision)** para extraer automáticamente proveedor, NIT y productos. Estas imágenes pueden contener datos personales del proveedor (nombre, NIT, dirección). El Tenant es responsable de no cargar imágenes que contengan datos personales innecesarios o de terceros sin autorización. Google procesa esta información conforme a sus propias políticas ([Google Privacy Policy](https://policies.google.com/privacy) y términos de la API de Gemini); JRPOS no controla ni almacena de forma permanente estas imágenes más allá de lo necesario para completar el procesamiento y guardar el resultado (los productos extraídos) en el inventario del Tenant.

### 4.6 Datos de facturación electrónica DIAN — aviso de modo simulado
Los módulos de Facturación Electrónica, POS Electrónica, Nómina Electrónica, RADIAN, Notas Crédito/Débito y Certificado Digital calculan el CUFE/CUNE con el algoritmo oficial (SHA-384) y generan una estructura XML de práctica, **pero actualmente no transmiten información a los servicios web reales de la DIAN ni a un proveedor tecnológico autorizado**. Cualquier dato fiscal generado en estos módulos permanece únicamente en la base de datos de JRPOS con fines de demostración/preparación, y **no constituye una transmisión de datos a una entidad pública**. Ver el aviso legal completo en la sección "Facturación electrónica" de los [Términos y Condiciones](./TERMINOS_Y_CONDICIONES.md).

### 4.7 Datos técnicos y de seguridad
- Cookie de sesión (JWT) `HttpOnly`, con atributo `Secure` en producción y `SameSite` configurado, usada exclusivamente para mantener la sesión autenticada. Ver sección 10 (Cookies).
- Dirección IP y registros de auditoría (`tenant_audit_logs`): usuario, acción, tipo de entidad afectada, fecha — con fines de seguridad, trazabilidad y prevención de fraude.
- Datos de tickets de soporte: nombre, correo, teléfono, mensaje, prioridad.

### 4.8 Datos de pago de la suscripción SaaS
Los pagos de la suscripción de la Plataforma se realizan actualmente de forma **manual** (transferencia bancaria, código QR, Nequi, Bre-B) mostrados en la pantalla de pago (*paywall*); JRPOS **no almacena números de tarjeta ni credenciales bancarias**. Si en el futuro se habilita una pasarela de pago automatizada (p. ej. ePayco, Wompi, Stripe), dicha pasarela procesará los datos de pago directamente bajo sus propias políticas de seguridad (cumplimiento PCI-DSS), y JRPOS solo recibirá una confirmación del evento de pago (identificador de transacción, monto, estado), nunca el número completo de la tarjeta.

## 5. Finalidades del tratamiento

Usamos los datos personales descritos para:

1. Crear y administrar la cuenta del Tenant y de sus usuarios; autenticar el acceso a la Plataforma.
2. Prestar las funcionalidades del software: punto de venta, inventario, clientes/proveedores, créditos, caja, reportes, marcación, nómina (simulada), facturación (simulada), soporte, etc.
3. Generar comprobantes de venta, tickets térmicos y documentos internos (remisiones, cuentas de cobro, cotizaciones).
4. Procesar imágenes de facturas mediante IA para agilizar la carga de inventario.
5. Enviar comunicaciones operativas: recuperación de contraseña, avisos de vencimiento del período de prueba o la suscripción, alertas de seguridad, respuestas de soporte.
6. Gestionar el cobro de la suscripción y llevar registro de pagos.
7. Prevenir fraude, abuso de la Plataforma y accesos no autorizados (registro de intentos de login, auditoría).
8. Cumplir obligaciones legales, contables y tributarias que recaigan sobre JRPOS o, cuando corresponda, facilitar que el Tenant cumpla las suyas.
9. Mejorar la Plataforma (analítica agregada de uso, corrección de errores).

No usamos los datos personales de clientes/proveedores/empleados capturados por un Tenant para publicidad de terceros, ni los vendemos ni los cedemos a otros Tenants.

## 6. Terceros, encargados y transferencia/transmisión de datos

Para prestar el servicio, JRPOS se apoya en los siguientes terceros, que pueden actuar como sub-encargados o procesar datos bajo sus propias políticas:

| Tercero | Función | Datos involucrados |
|---|---|---|
| **Google (Identity Services / OAuth)** | Inicio de sesión con Google | Correo, nombre, identificador de cuenta de Google |
| **Google Gemini API** | OCR de facturas de compra | Imagen de la factura cargada por el usuario |
| Proveedor de infraestructura en la nube / VPS (hosting, base de datos PostgreSQL, contenedores Docker) | Alojamiento de la aplicación y la base de datos | Todos los datos almacenados en la Plataforma |
| Eventual pasarela de pago (ePayco, Wompi, Stripe u otra) | Procesamiento de pagos de la suscripción, si se habilita | Datos de pago (no gestionados directamente por JRPOS) |

Cuando estos terceros se encuentren fuera de Colombia, dicha transferencia/transmisión internacional se realiza conforme al artículo 26 de la Ley 1581 de 2012: verificando que el país de destino cuente con un nivel adecuado de protección de datos según la SIC, o mediante cláusulas contractuales, garantías o el consentimiento del titular cuando la ley lo exija.

No compartimos datos personales con terceros para fines comerciales o publicitarios ajenos a la prestación del servicio.

## 7. Datos sensibles y menores de edad

JRPOS **no está diseñado para recolectar datos sensibles** (salud, origen racial/étnico, ideología política o religiosa, orientación sexual, datos biométricos). El módulo de marcación de asistencia funciona mediante inicio de sesión, sin captura de huella ni reconocimiento facial.

La Plataforma no está dirigida a menores de edad. Para registrar un negocio y usar JRPOS se requiere ser mayor de edad y tener capacidad legal para representar al Tenant.

## 8. Derechos de los titulares de datos personales

Conforme al artículo 8 de la Ley 1581 de 2012, todo titular de datos personales tiene derecho a:

- **Conocer, actualizar y rectificar** sus datos personales frente a los Responsables o Encargados.
- **Solicitar prueba** de la autorización otorgada para el tratamiento.
- **Ser informado**, previa solicitud, respecto del uso que se ha dado a sus datos.
- **Presentar quejas ante la SIC** por infracciones a la ley.
- **Revocar la autorización y/o solicitar la supresión** del dato, cuando no exista un deber legal o contractual que impida eliminarlo.
- **Acceder de forma gratuita** a sus datos personales que hayan sido objeto de tratamiento.

### Cómo ejercerlos
Envía tu solicitud al correo `[COMPLETAR: privacidad@tu-dominio.com]`, indicando tu nombre, el dato/derecho que quieres ejercer y, si eres cliente/proveedor/empleado de un negocio que usa JRPOS, el nombre de dicho negocio. Si tu solicitud corresponde a datos capturados por un Tenant específico, te orientaremos para dirigirla también a ese negocio como Responsable.

**Plazos de respuesta** (art. 14 y 15, Ley 1581/2012):
- Consultas: máximo **10 días hábiles** desde la recepción (prorrogable 5 días hábiles adicionales, informando el motivo).
- Reclamos: máximo **15 días hábiles** desde la recepción (si falta información, se solicitará al peticionario completar la solicitud dentro de los 5 días siguientes; el reclamo se entenderá desistido si no se completa en 2 meses).

## 9. Seguridad de la información

Implementamos medidas técnicas y organizativas razonables, entre ellas:

- Contraseñas almacenadas únicamente como *hash* (`bcrypt`), nunca en texto plano.
- Autenticación basada en **JWT** con cookies `HttpOnly` (no accesibles desde JavaScript) y `Secure` en producción (requiere HTTPS).
- **Aislamiento de datos entre negocios (multi-tenant)** mediante *Row-Level Security* de PostgreSQL, forzado incluso a nivel de base de datos y no solo en el código de la aplicación, con un rol de conexión de base de datos sin privilegios de superusuario.
- Control de acceso basado en roles (RBAC) dentro de cada negocio.
- Limitador de intentos de inicio de sesión para mitigar ataques de fuerza bruta.
- Registro de auditoría de acciones relevantes por Tenant.

Ninguna medida de seguridad es infalible. En caso de un incidente de seguridad que comprometa datos personales, JRPOS notificará a los Tenants afectados y, cuando corresponda, a la autoridad competente, conforme a la normativa vigente.

## 10. Cookies y tecnologías similares

JRPOS utiliza únicamente **cookies estrictamente necesarias** para el funcionamiento del servicio:

| Cookie | Finalidad | Duración |
|---|---|---|
| Cookie de sesión (JWT) | Mantener la sesión autenticada del usuario | Sesión / según expiración del token configurada |

No utilizamos cookies de publicidad ni de rastreo de terceros por defecto. Si en el futuro se incorporan herramientas de analítica o marketing que usen cookies adicionales, esta sección se actualizará y, cuando la ley lo exija, se solicitará el consentimiento correspondiente mediante un banner de cookies.

La Plataforma también usa **almacenamiento local del navegador (IndexedDB)** para su funcionamiento offline-first (cola de ventas sin conexión), que permanece únicamente en el dispositivo del usuario y se sincroniza con el servidor al recuperar la conexión.

## 11. Conservación y eliminación de los datos

- Mientras la cuenta del Tenant esté activa, los datos se conservan para permitir el uso continuo del servicio.
- Los documentos con relevancia contable/tributaria (ventas, facturas, notas crédito/débito) pueden estar sujetos a plazos legales de conservación bajo el Código de Comercio colombiano (generalmente hasta 10 años), aun si el Tenant solicita la eliminación de otros datos.
- Si el Tenant cancela su cuenta, JRPOS conservará los datos por un período de gracia razonable (para permitir exportación o reactivación) y luego procederá a eliminarlos o anonimizarlos, salvo obligación legal de conservarlos por más tiempo.
- Los registros de auditoría e intentos de acceso se conservan por motivos de seguridad durante un plazo razonable.

## 12. Deberes del Tenant frente a los datos de sus propios clientes, proveedores y empleados

Al registrar información de terceros (clientes, proveedores, empleados) en JRPOS, el Tenant declara y se obliga a:

- Contar con la autorización previa, expresa e informada de dichos titulares para el tratamiento de sus datos, cuando la ley lo exija.
- Informar a esos titulares su propio aviso de privacidad como Responsable del tratamiento.
- No cargar en la Plataforma datos personales obtenidos de forma ilícita.
- Responder directamente ante sus clientes/proveedores/empleados por el cumplimiento de la normativa de protección de datos, en su calidad de Responsable.

## 13. Cambios a esta política

Podemos actualizar esta política para reflejar cambios normativos, nuevas funcionalidades o nuevos terceros/encargados. Los cambios materiales se notificarán a los administradores de cada Tenant por correo electrónico o mediante un aviso dentro de la Plataforma, con una fecha de vigencia. La versión vigente siempre estará disponible en este mismo documento.

## 14. Contacto y PQR

Para preguntas, solicitudes relacionadas con datos personales (peticiones, quejas y reclamos — PQR), o para reportar un incidente de seguridad:

- Correo: `[COMPLETAR: privacidad@tu-dominio.com]`
- Soporte general: módulo "Soporte" dentro de la Plataforma.

---
Ver también: [Términos y Condiciones](./TERMINOS_Y_CONDICIONES.md) · [Acuerdo de Tratamiento de Datos](./ACUERDO_TRATAMIENTO_DATOS.md)
