# Autoría local con Codex y limpieza — 2026-09-06

## Resultado

- [Edición de Madrid](../tours/madrid-editorial-20260906.md): siete paradas, 4.124 palabras; objetivos originales 4.086. [Registro editorial](narrative-madrid-editorial-review-20260906.md).
- Astra low mediante Codex CLI: prueba real de Plaza Mayor con el mismo prompt del canario. 601 palabras frente a 600 objetivo, una invocación, 34,8 segundos de comando. Sin solicitudes OpenRouter.
- 88 tests pasan en cinco suites de experimentos, incluyendo 23 del transporte nuevo. Pruebas de duración local y agregada de la edición: ambas pasan, sin cambiar bandas.
- Archivadas 96 entradas históricas, 479 archivos, 222.757.649 bytes, sin borrado permanente. `backend/tmp/narrative-v8` pasa de aproximadamente 275 MB a 64 MB según `du`.

## Qué se ha cambiado y qué no

La nueva entrada es `quality:narrative:v8:codex-author`. Recibe un encargo autocontenido en texto y entrega la respuesta usando `gpt-6-astra` con razonamiento `low` a través de Codex CLI 0.153.1, autenticado con ChatGPT.

Es una herramienta de autoría **local**, no un proveedor incorporado al backend comercial. No se ha cambiado el modelo de producción, el RAG, el recorrido ni los controles factuales. Los comandos antiguos `quality:narrative:v8:user-canary` y el coordinador `narrative-author-route-canary-v8.ts` siguen siendo los anteriores y **pueden usar OpenRouter**. No se debe ejecutar el comando antiguo esperando que se haya convertido en gratuito.

La prueba nueva no incluye un auditor automático: se registra `audit: not_run`. El MD editado se revisó editorialmente por separado; el resultado de la prueba de transporte no lo sustituye.

## Cómo usarlo

Desde `backend`, con Node 22 y `codex login status` indicando ChatGPT:

```bash
npm run quality:narrative:v8:codex-author -- \
  --prompt=tmp/narrative-author-route-canary-v8/madrid-author-astra-low-20260906-1/1/author-prompt.md \
  --out-dir=tmp/plaza-mayor-codex-low-nuevo
```

Sin `--execute` solo valida las entradas y muestra la configuración. Para generar, añade `--execute`. El directorio de salida debe ser nuevo y su carpeta padre debe existir. El prompt es intercambiable: puede contener otro lugar, otras fuentes y otro objetivo. No hay Madrid hardcodeado en el transporte.

Se guardan prompt exacto, eventos, errores, respuesta y resultado. No hay reintentos ni fallback a una API de pago. Hay límite de 180 segundos y de salida capturada. Una respuesta parcial o una herramienta ejecutada no se acepta como éxito.

Se ignora la configuración de usuario de Codex para esta invocación, se desactivan herramientas/plugins, se usa modo solo lectura y se filtra el entorno para no pasar claves de OpenRouter/OpenAI API. Se conserva la autenticación existente de ChatGPT: **consume cuota de la cuenta**, no es capacidad ilimitada ni se ha medido un coste USD de esa cuota.

### Evidencia de la prueba

`backend/tmp/plaza-mayor-codex-low-20260906-1/`

- `narration.md`: respuesta original de 601 palabras.
- `result.private.json`: estado, modelo/razonamiento solicitados, tiempo y uso.
- `events.private.jsonl`: un mensaje final y un turno completado; ninguna llamada a herramientas.
- `prompt.private.md`: coincide byte a byte con el prompt congelado.
- Uso reportado: 11.339 tokens de entrada, 803 de salida; 0 tokens de razonamiento reportados. Este último dato no permite inferir la profundidad interna del modelo.

La versión de Codex añade sus propias instrucciones de sistema, por lo que cambiar el transporte no garantiza textos idénticos a OpenRouter, incluso con el mismo prompt de usuario.

## Limpieza de POI

Se trasladaron cuatro tests de pilotos a `backend/scripts/validation/__tests__/`, junto a la herramienta que prueban:

- `NarrativeAuthorCanaryMaterialV8.test.ts`
- `NarrativeAuthorRouteCanaryV8.test.ts`
- `NarrativePlainWriterPilotV8.test.ts`
- `NarrativeEditorialPacketPilotV8.test.ts`

Se ajustaron importaciones y mocks, y Jest descubre automáticamente la ubicación nueva. No se eliminó ningún test ni ningún servicio de producción. La carpeta POI no contenía canarios ni archivos generados ajenos a TypeScript; los números V6/V8 no bastan para declarar muerto un módulo. Sigue siendo grande: no se ha hecho una reorganización arquitectónica masiva disfrazada de limpieza.

## Archivo recuperable

Destino local fuera del repositorio:

`/home/jesusotero/coding/tour-guide-app-archive/narrative-cleanup-20260906-1`

[Manifiesto completo](narrative-cleanup-manifest-20260906.json), copiado también en el archivo. Cada entrada conserva ruta, número de archivos, bytes y digest del árbol. Los 96 digests se verificaron antes y después de mover.

Se apartaron 93 entradas de canarios históricos de septiembre 1–4 y tres ZIP antiguos de investigación en la raíz. No se destruyeron: **siguen ocupando disco en el archivo**, pero ya no ensucian la carpeta de trabajo.

Se conservaron expresamente:

- El canario Astra exitoso, sus siete respuestas, sus auditorías y el ledger de gasto.
- `madrid-v8-staged-20260905-015959`, fuente de la ruta y de la edición.
- `madrid-v8-richness-complete-20260903-31`, todavía usado por defecto por el benchmark.
- `madrid-v8-integrity-20260905-1`, usado por el replay del curator.
- Los runs/comparativas del RAG y el material reciente de septiembre 5–6.
- Fixtures, fuentes de código y cambios no relacionados que ya estaban en el worktree.

Los enlaces de informes históricos a runs archivados requieren localizar la misma ruta relativa dentro del archivo o restaurarla. No se han reescrito los informes como si sus rutas originales nunca hubieran existido.

### Restaurar una entrada

Consulta su `source` en el manifiesto. El archivo reproduce exactamente esa ruta bajo el destino de archivo. Copia o mueve esa entrada a su ubicación original **solo si no existe ya**; no sobrescribas un run nuevo. El manifiesto incluye el digest para comprobar la restauración. No se ejecutó una restauración completa, que desharía la limpieza.

## Límites pendientes

Escuchar y probar el recorrido físicamente antes de publicarlo. La calidad factual de cada generación sigue necesitando revisión. La llamada de Codex demostrada es de una parada, no un nuevo canario integral con investigación/RAG/TTS.

Qwen se utilizó para evidencia y tareas mecánicas. Su primer borrador del transporte tenía errores de protocolo y tests, y el intento de corrección se truncó; Codex asumió la corrección acotada, revisó el diff y ejecutó los tests antes de la prueba real. No se pasó por alto ese fallo ni se atribuyó al modelo narrador.

