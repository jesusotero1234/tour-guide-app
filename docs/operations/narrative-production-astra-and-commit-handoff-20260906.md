# Auditor Astra y preparación del commit — 2026-09-06

## Cambio solicitado

La ruta de generación de la aplicación (`CodexTourProcess` → `narrative-blueprint-author-v8` → `runCodexLiveNarrationV8`) utiliza ahora el auditor `gpt-6-astra`, razonamiento `low`, mediante Codex CLI con cuota ChatGPT. No utiliza Astra por OpenRouter. La preparación existente del perfil `qwen38_hybrid` no se modifica: Mini 5.4 continúa en sus tareas actuales; Nano no se habilita. Los perfiles de experimentación/transportes OpenRouter anteriores no se redefinen globalmente.

El adaptador reutiliza el runner restringido existente, añade esquema de salida, valida localmente JSON/esquema/citas, admite cancelación y un máximo de 180 segundos por auditoría. No hay reintentos ni fallback, ni aprobación automática de publicación. Registra transporte, modelo solicitado, razonamiento y cuota por separado del gasto API (cero para el auditor). No afirma verificar el modelo servido a partir de una respuesta CLI que no lo informa.

Se conserva el contrato multilingüe `requireLanguageReview` de la otra tarea. Narrar una base ya investigada deja de exigir clave/preflight de OpenRouter; la investigación inicial sigue requiriendo sus proveedores. Los temporales privados del auditor se eliminan después de cada intento; la respuesta válida se conserva en el estado de auditoría del tour.

## Archivos de esta entrega

- `backend/scripts/validation/narrative-codex-auditor-v8.ts` (nuevo adaptador).
- `backend/scripts/validation/narrative-codex-live-v8.ts` (conexión y metadatos; conservar trabajo multilingüe previo).
- `backend/scripts/validation/narrative-blueprint-author-v8.ts` (retirar dependencia OpenRouter en narración; archivo creado por la tarea multilingüe).
- `backend/scripts/validation/__tests__/narrative-codex-auditor-v8.test.ts` (nuevo).
- `backend/scripts/validation/__tests__/narrative-codex-live-v8.test.ts` (ajuste de transporte).
- `backend/scripts/validation/__tests__/multilingual-author-contract.test.ts` (ajuste del mock; contrato preservado).
- Este informe.

El worker hizo los parches de conexión y mocks, revisados por Codex; dos fallos del protocolo de creación exigieron implementar directamente el adaptador y su prueba. Se corrigieron dos expectativas erróneas del mock durante la revisión. Las pruebas finales pasan.

## Validación y activación

- 21 pruebas de adaptador, flujo live y contrato multilingüe: PASS.
- 23 pruebas del runner Codex preexistente: PASS.
- `tsc -p tsconfig.generation-worker.json --noEmit`: PASS.
- No se lanzó otro canario de pago ni se certificó un tour completo nuevo con este adaptador. La comparación Astra anterior es evidencia de selección, no prueba de despliegue.
- No se reiniciaron servicios ni se sobrescribió `dist-generation` desde esta tarea: había muestras activas de la tarea multilingüe. Se avisó a su responsable de que el código está listo para su siguiente compilación coordinada. La aplicación ejecuta archivos compilados; el cambio en fuente no basta para afirmar que un proceso ya iniciado usa Astra.

## Cómo consolidar y subir sin mezclar trabajo

Actualización posterior de coordinación: la tarea multilingüe informa que `npm run build` conjunto ya pasó con el adaptador y cambió `MULTILINGUAL_TOUR_PIPELINE` en `backend/src/services/MultilingualTourGenerator.ts` a `codex-blueprint-app-2-astra-audit-` más `NARRATION_POLICY_VERSION` (valor comprobado en fuente). Incluir ese cambio como dependencia del auditor: evita tratar narraciones de la versión anterior como resultados actuales; las bases de evidencias siguen siendo reutilizables. La compilación no equivale a confirmar un reinicio o despliegue de servicios. Francés continúa desactivado, pendiente de validación específica.

Estado observado: rama `codex/narrative-v8-prototype-clean`, HEAD `ef55a94`, sin upstream configurado y sin archivos staged. Remoto `origin`: repositorio `jesusotero1234/tour-guide-app`. Había 73 cambios tracked y 95 entradas untracked, cifras transitorias porque otras tareas seguían trabajando. No había conflictos de merge. No se hizo add, commit ni push.

Las tareas «Analiza flujo de generación de tours» y «Localiza imágenes del tour» comparten este checkout. Se coordinaron archivos y se solicitó entregar manifiestos/validaciones sin commits globales. La tarea multilingüe liberó explícitamente los archivos compartidos editados aquí.

Orden seguro propuesto:

1. Esperar el cierre de las escrituras de cada entrega y reunir sus manifiestos. La tarea de imágenes todavía estaba activa.
2. Revisar cambios por responsabilidad: base narrativa e integración, multilingüe, auditor Astra, imágenes y resultados de experimentos. No asumir que un archivo untracked pertenece íntegramente a una sola tarea.
3. Resolver dependencias antes de separar commits. El adaptador nuevo importa `narrative-codex-author-v8.ts`, también aún untracked; el flujo live depende de assets narrativos y del materializador. El autor de bases requiere la entrega multilingüe y sus migraciones. Comitear solo el adaptador no produciría por sí solo una entrega funcional.
4. Excluir secretos, capturas privadas, salidas temporales y backups accidentales. Revisar explícitamente entradas extrañas como `,`, `ection = ...` e `ize hard limit`; no fueron borradas ni incluidas aquí.
5. Añadir rutas/hunks explícitos, revisar el diff staged, comprobar la compilación y pruebas sobre el contenido exacto del commit (idealmente en un checkout temporal aislado). Las pruebas en el árbol compartido no garantizan que un subconjunto de sus archivos compile.
6. Crear los commits acordados y hacer push normal a esta rama con upstream, después de comprobar el estado remoto. No force-push ni push directo a master. No se ha autorizado ni realizado una limpieza global del árbol.

Pendiente de producto aparte: la tarea multilingüe observó falsos positivos con traducciones fieles bajo el auditor anterior. No se alteró el prompt ni se habilitó francés como parte del cambio de transporte; requiere comprobación específica con Astra.
