# Prueba DeepSeek V4.1 Flash — 10 de septiembre de 2026

Preparada y comprobada localmente el 9/9. El 10/9 se confirmó V4.1 Flash y se completó la comparación directa con `deepseek-flash` en `https://api.deepseek.com`. [Resultados y decisión por fase](narrative-deepseek-v41-results-20260910.md): candidato para preparación sin razonamiento; mantener Astra en redacción y auditoría. Los modelos del producto siguen igual.

## Qué compara

Usa las seis paradas del tour guardado de Madrid, sin repetir búsquedas ni cambiar las fuentes:

| Fase | Candidato | Referencia | Llamadas nuevas |
| --- | --- | --- | ---: |
| Núcleo | DeepSeek, tres permutaciones | Mini guardado con entrada y prompt comprobados | 3 DeepSeek |
| Curación | DeepSeek, seis paradas | Mini guardado de primera respuesta, misma entrada y prompt | 6 DeepSeek |
| Arco | DeepSeek sobre dossiers fijos | Arco histórico; falta una primera respuesta Mini comparable | 1 DeepSeek |
| Redacción | DeepSeek, encargos originales completos | Textos Astra low guardados, incluido su historial de estilo | 6 DeepSeek + 6 auditorías Astra |
| Auditoría | DeepSeek sobre textos Astra idénticos | Auditoría Astra low nueva sobre las mismas entradas | 6 DeepSeek + 6 auditorías Astra |

Total: **22 llamadas DeepSeek y 12 auditorías Astra**. DeepSeek usa razonamiento `low` por defecto; se puede repetir con `--thinking=disabled`. Con razonamiento, la API requiere `tool_choice=auto`; la respuesta sigue teniendo que contener exactamente la función prevista y superar el esquema completo. Mini histórico usó `none`. Son comparaciones de configuraciones y fases, no de un tour generado enteramente por DeepSeek.

La auditoría histórica de este tour era GPT-5.4: se conserva como referencia etiquetada y se compara con Astra de nuevo. Nunca se presenta aquella respuesta como si fuera Astra. El candidato no se aprueba a sí mismo.

## Antes de la ejecución real

El correo anuncia las nuevas tarifas desde **10/9/2026 04:00 UTC (06:00 Madrid)**; el script rechaza ejecuciones anteriores. Esa hora corresponde al precio, no garantiza que el modelo ya esté publicado.

La [documentación oficial de modelos](https://api-docs.deepseek.com/quick_start/pricing/) y el [registro de cambios](https://api-docs.deepseek.com/updates/) consultados el 9/9 todavía identificaban V4. Confirma allí el lanzamiento y el nombre o alias que realmente apunta a V4.1. El 10/9 el anuncio y el catálogo autenticado confirmaron el ID definitivo `deepseek-flash`; se utiliza ese nombre directamente. No se utiliza el alias beta que caduca el 10/9.

El script exige `--model`, consulta su disponibilidad en `/models` y comprueba el campo `model` de cada respuesta. Si un alias devuelve un identificador distinto, solo usa `--expected-model=IDENTIFICADOR_CONFIRMADO` tras comprobarlo. No hay sustitución automática de modelos. La coincidencia de un alias **no prueba por sí sola** que sea V4.1: `releaseVersionVerified` permanece `false`, para que la confirmación externa forme parte de la revisión.

Requisitos: Node 22, dependencias actuales del backend, `DEEPSEEK_API_KEY` en el entorno o `backend/.env`, y sesión ChatGPT de Codex para las auditorías Astra. No hace falta una nueva clave OpenRouter: se reutilizan los resultados Mini. Las entradas originales están en `backend/tmp`, son privadas y locales; otro checkout necesita esos artefactos, no solo el código.

## Comandos

Comprobación sin red, autenticación ni gasto; el alias de este ejemplo sirve para preparar los casos, no certifica la nueva versión:

```bash
cd /home/jesusotero/coding/tour-guide-app/backend
node -r ts-node/register scripts/validation/narrative-deepseek-replay-v8.cjs \
  --source=tmp/narrative-v8/codex-Q2807-20260906-115441 \
  --prep=tmp/narrative-v8/mini-nano-preparation-fixed-20260906 \
  --out-dir=tmp/narrative-v8/deepseek-v41-20260910 \
  --model=deepseek-flash
```

Después de confirmar el lanzamiento, define `DEEPSEEK_TEST_MODEL` con el ID o alias oficial verificado y ejecuta:

```bash
node -r ts-node/register scripts/validation/narrative-deepseek-replay-v8.cjs \
  --source=tmp/narrative-v8/codex-Q2807-20260906-115441 \
  --prep=tmp/narrative-v8/mini-nano-preparation-fixed-20260906 \
  --out-dir=tmp/narrative-v8/deepseek-v41-20260910 \
  --model="${DEEPSEEK_TEST_MODEL:?Define el modelo oficial confirmado}" \
  --prior-spend-usd=0 --spend-limit-usd=2 --execute
```

El límite predeterminado es **2 USD de exposición estimada DeepSeek**, más cuota ChatGPT para Astra. No es una estimación de que vaya a costar 2 USD ni un precio garantizado por el proveedor. La contabilidad usa las tarifas del correo: hit/miss/output por millón = 0.003/0.15/0.6 fuera de punta y 0.006/0.3/1.2 en punta; lunes a viernes UTC 01–04 y 06–10. Distingue caché y no cuenta dos veces los tokens de razonamiento. Las reservas usan las tarifas máximas anunciadas; revisa que sigan vigentes antes de ejecutar.

Una repetición necesita otra carpeta. Si comparte presupuesto con una ejecución anterior, conserva el gasto previo en `--prior-spend-usd`; poner cero declara un experimento independiente. `--phase=preparation`, `--phase=writer` o `--phase=auditor` permiten ejecutar solo una parte. `--max-tokens` incluye el razonamiento, por defecto 6000; una respuesta truncada queda como fallo. En la ejecución real, el núcleo agotó los 6000 tokens en razonamiento; la comparación siguiente utiliza `--max-tokens=16000` y conserva aquel intento en el gasto acumulado. No hay reintentos, reparaciones ni publicación automática. Los fallos de red sin consumo verificable conservan la reserva máxima y detienen la prueba.

## Resultados y decisión

En la carpeta de salida: `comparison.md` muestra tiempos, costes, textos Astra/DeepSeek y desacuerdos de auditoría; `results.private.json` conserva validaciones, admisiones del curador, auditorías y presupuesto. `inputs.private.json` y las peticiones/respuestas numeradas permiten revisar el caso exacto. Se verifican las huellas de las fuentes antes y después. `complete_needs_review` significa que terminó la ejecución; `incomplete` significa que falta parte de la comparación.

Para proponer una sustitución, revisar por separado:

- **Preparación:** cumplimiento del esquema completo, IDs y citas válidos, admisión/cobertura de evidencia y estabilidad del núcleo entre las tres permutaciones. Leer los pasajes: una cita admitida puede no sostener toda la proposición.
- **Redacción:** fidelidad factual, voz natural al escuchar, repetición, transiciones y ajuste a objetivos de duración. Comparar el texto con Astra y revisar los hallazgos de la auditoría independiente; su JSON válido no significa cero objeciones.
- **Auditoría:** resolver cada desacuerdo contra las fuentes, en especial hechos no respaldados que DeepSeek considere válidos. Astra tampoco es una verdad de referencia. Antes de reemplazar al auditor, ampliar con ejemplos alterados de error conocido y comprobar falsos negativos.
- **Coste y velocidad:** comparar Mini con las llamadas equivalentes; sus resultados son históricos y no controlan variaciones de carga. Los tiempos históricos del escritor Astra están en `codex-author/1..6/result.private.json` (`elapsedMs`); usa Codex CLI y cuota ChatGPT. Se puede comparar el tiempo observado, explicitando transporte y fechas, pero no convertir su cuota en un ahorro monetario porcentual.

Esta muestra de Madrid no aprueba una migración global. Si sale bien, el siguiente paso es un canario completo con otra ciudad y después decidir por fase. La bienvenida, TTS, búsqueda, otras lenguas y los bucles completos de curación quedan fuera de esta comparación. `publicationPassed` y `replacementApproved` siempre permanecen `false`.

## Validación local

```bash
cd /home/jesusotero/coding/tour-guide-app/backend
node -r ts-node/register --test scripts/validation/narrative-deepseek-replay-v8.test.cjs
```

Cuatro pruebas locales cubren el cálculo UTC/caché, preparación sin red, presupuesto, modelo no disponible o distinto, truncamiento, errores de transporte, auditor independiente y desacuerdos visibles. La preparación real de los 22 casos pasó sin red; las nueve respuestas Mini comparables se vuelven a validar desde su respuesta original y sus prompts/entradas coinciden. El 10/9 se completaron los experimentos reales descritos en el informe de resultados, incluidos los intentos fallidos y las pruebas adicionales. No se modificó el servicio del producto.
