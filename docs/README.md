# Documentación de Nomuvia

Punto de entrada. El sistema actual está descrito en [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Por dónde empezar

| Quiero... | Voy a... |
|---|---|
| Entender el sistema | [`ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Ver el plan y los informes de la última tanda de trabajo | [`plans/20261001-audio-paradas-ui-backend/`](./plans/20261001-audio-paradas-ui-backend/README.md) |
| Generar o regenerar contenido | [`backend/scripts/admin/README.md`](../backend/scripts/admin/README.md) |
| Publicar en producción | [`deployment/pilot/catalog/README.md`](../deployment/pilot/catalog/README.md) y [`deployment/pilot/hetzner-status.md`](../deployment/pilot/hetzner-status.md) |
| Operar el servidor | [`operations/`](./operations/) |
| Revisar la parte legal y de privacidad | [`legal/`](./legal/) y [`security/`](./security/) |

## Carpetas

- [`architecture/`](./architecture/): documentos de diseño que siguen vigentes (corpus histórico, internacionalización, rúbrica y pruebas de calidad).
- [`plans/`](./plans/): planes de trabajo con sus informes en `resultados/`.
- [`operations/`](./operations/): runbooks y resultados de operación.
- [`tours/`](./tours/): reglas editoriales y publicaciones de tours.
- [`archive/`](./archive/): documentos históricos que describen el pipeline anterior a septiembre de 2026. Se conservan, pero no describen el sistema actual.
- [`working/`](./working/): notas de trabajo de agentes, sin garantía de estar al día.

Los documentos que el código lee al ejecutarse (por ejemplo `tours/regla-editorial-fechas-audioguias.md`) no se mueven: véase el plan 07 §7.7.
