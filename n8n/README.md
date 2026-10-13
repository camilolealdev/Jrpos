# n8n — flujos JRPOS

Estado, decisiones y checklist de conexión: `docs/N8N_FLUJOS_REVISION_OBLIGATORIA.md` (§5, Fase 0.5).

| Flujo | ID en la instancia | Fuente en el repo |
|---|---|---|
| I01 Manejador de errores | `AxXw7DQHR0TVv0dc` | `workflows/I01-manejador-de-errores.sdk.ts` |
| I02 Notificador central | `yQY2jFZ7kyTCw3oi` | `workflows/I02-notificador-central.sdk.ts` |
| I03 Latido de backup | `jvjO3qkLadkOvWXw` | Solo en la instancia (ver abajo) |
| I04 Salud del sistema | `AxadpTIg1fK80wcV` | Solo en la instancia |
| I05 Receptor de eventos | `s3wrzDlNLXaKeyW5` | Solo en la instancia |
| F01 Ciclo de vida del trial | `LUWm0nYxw2ozLDJV` | `workflows/F01-ciclo-trial.sdk.ts` (contrato: `contracts/F01.md`) |
| F02 Reporte diario del dueno | `TipgBLFStSx9c5l2` | `workflows/F02-reporte-diario-dueno.sdk.ts` (`contracts/F02.md`) |
| F03 Soporte | `UWsVfxqJ90BpS5Yu` | `workflows/F03-soporte.sdk.ts` (`contracts/F03.md`) |
| F07 Onboarding de tenant nuevo | `BuUrPXUXpPEWs6k3` | `workflows/F07-onboarding-tenant.sdk.ts` (`contracts/F07.md`) |
| F08 Renovacion y reactivacion | `ti75RBmWMpzzIs8o` | `workflows/F08-renovacion-reactivacion.sdk.ts` (`contracts/F08.md`) |

- I01 e I02 tienen su fuente en SDK (`create_workflow_from_code`). I03–I05 no se exportaron al repo:
  la fuente de verdad es la instancia (historial de versiones y `get_workflow_details`). Exportarlos
  como JSON es una tarea pendiente si se quiere reproducibilidad fuera de la instancia.
- Los IDs (workflows y Data Tables) son propios de la instancia; al recrear en otra hay que sustituirlos.
- Regla: no versionar secretos. El webhook de GitHub de I04 usa una ruta secreta que vive solo en n8n.
- Todos los flujos están inactivos; activar solo con confirmación del propietario.
