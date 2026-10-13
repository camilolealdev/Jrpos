# n8n — flujos JRPOS

Estado, decisiones y checklist de conexión: `docs/N8N_FLUJOS_REVISION_OBLIGATORIA.md` (§5, Fase 0.5).

| Flujo | ID en la instancia | Fuente en el repo |
|---|---|---|
| I01 Manejador de errores | `AxXw7DQHR0TVv0dc` | `workflows/I01-manejador-de-errores.sdk.ts` |
| I02 Notificador central | `yQY2jFZ7kyTCw3oi` | `workflows/I02-notificador-central.sdk.ts` |
| I03 Latido de backup | `jvjO3qkLadkOvWXw` | Solo en la instancia (ver abajo) |
| I04 Salud del sistema | `AxadpTIg1fK80wcV` | Solo en la instancia |
| I05 Receptor de eventos | `s3wrzDlNLXaKeyW5` | Solo en la instancia |

- I01 e I02 tienen su fuente en SDK (`create_workflow_from_code`). I03–I05 no se exportaron al repo:
  la fuente de verdad es la instancia (historial de versiones y `get_workflow_details`). Exportarlos
  como JSON es una tarea pendiente si se quiere reproducibilidad fuera de la instancia.
- Los IDs (workflows y Data Tables) son propios de la instancia; al recrear en otra hay que sustituirlos.
- Regla: no versionar secretos. El webhook de GitHub de I04 usa una ruta secreta que vive solo en n8n.
- Todos los flujos están inactivos; activar solo con confirmación del propietario.
