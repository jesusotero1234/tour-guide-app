# Barcelona: comparación de preparación Mini / DeepSeek — 10/9/2026

**La comparación terminó. DeepSeek es un candidato favorable para sustituir al curador Mini: en esta muestra cuesta un 59,55 % menos y alcanza más cobertura, con un tiempo total prácticamente igual. La prueba no justifica sustituir a Astra ni cambiar los modelos de producción todavía.**

## Resultado medido

Seis paradas nuevas, las mismas fuentes iniciales y una reparación como máximo por parada. Los tiempos suman las llamadas de curación y reparación; no incluyen la auditoría.

| Métrica | GPT-5.4 Mini | DeepSeek V4.1 Flash |
| --- | ---: | ---: |
| Coste de la ejecución completada, USD | 0,100759500 | 0,040761084 |
| Tiempo de llamadas | 60,076 s | 59,156 s |
| Llamadas iniciales + reparaciones | 6 + 3 | 6 + 2 |
| Cobertura requerida inicial, `writerReady` | 3/6 | 4/6 |
| Cobertura requerida final, `writerReady` | 4/6 | 6/6 |
| Riqueza inicial | 4/6 | 5/6 |
| Riqueza final | 6/6 | 6/6 |
| Proposiciones finales admitidas | 72 | 77 |
| Respuestas con formato válido | 9/9 | 8/8 |

El ahorro absoluto es 0,059998416 USD para estas seis fichas. La diferencia temporal es solo 0,920 s: no demuestra una ventaja estable de velocidad. En las seis primeras llamadas Mini fue más rápido (40,265 frente a 45,397 s); la reparación adicional consumió esa ventaja. Sus costes iniciales fueron 0,067454250 y 0,029956248 USD, respectivamente.

| Parada | Wikidata | Mini: cobertura inicial → final; rondas | DeepSeek: cobertura inicial → final; rondas |
| --- | --- | --- | --- |
| Sagrada Familia | Q48435 | Sí → Sí; 1 | Sí → Sí; 1 |
| Casa Milà | Q207870 | Sí → Sí; 1 | Sí → Sí; 1 |
| Casa Batlló | Q461371 | No → Sí; 2 | No → Sí; 2 |
| Palau de la Música | Q327940 | No → No; 2 | No → Sí; 2 |
| Catedral de Barcelona | Q17155 | No → No; 2 | Sí → Sí; 1 |
| Santa María del Mar | Q908802 | Sí → Sí; 1 | Sí → Sí; 1 |

Mini sigue sin aportar el papel de contraste exigido en Palau. En Catedral la reparación intercambia una carencia por otra; el selector existente conserva la primera ronda, que sigue sin contraste. DeepSeek resuelve sus dos carencias, pero su reparación de Palau introduce un calificativo sin respaldo. **Pasar cobertura no equivale a tener una ficha factual aprobada.** Los recuentos de proposiciones tampoco son una medida aislada de calidad: DeepSeek tiende a formular afirmaciones más extensas.

## Auditoría factual independiente

Se usó el auditor existente con Astra low, sobre todas las proposiciones de la ronda final seleccionada, contra sus pasajes, discrepancias y límites. Son doce auditorías con cuota ChatGPT: 176,206 s para Mini y 206,359 s para DeepSeek.

| Clasificación de Astra | Mini | DeepSeek |
| --- | ---: | ---: |
| Respaldadas | 67 | 71 |
| Inferencias autorizadas | 1 | 1 |
| Distorsionadas | 1 | 0 |
| Sin soporte en los pasajes aportados | 1 | 1 |
| Dudosas | 2 | 4 |
| Total revisado | 72 | 77 |

Se revisaron las objeciones contra el material original; no se presentan todas como falsedades:

- **Mini, Casa Milà:** convierte la compra de 1986 en apertura al público desde 1986. El propio material fecha la apertura en 1987. Es una alteración temporal comprobable.
- **Mini, Santa María del Mar:** menciona galerías sin incluir el pasaje que las respalda. La captura completa sí relaciona las galerías con la horizontalidad. Es un fallo de selección de citas, no un dato inventado.
- **Mini, Palau:** conserva «esta fachada» fuera de su contexto. El encabezado original identifica la fachada principal actual; la ficha pierde esa referencia y puede confundirse con la fachada mencionada antes.
- **Mini, Casa Batlló:** la duda sobre 4300 m² totales frente a 450 m² por planta nace de cifras literales de la fuente. La diferencia requiere contexto, no demuestra una invención.
- **DeepSeek, Palau:** añade «posterior» a la fachada oculta por una iglesia. Su cita no sostiene esa ubicación; el contexto original está bajo «Fachada principal actual». El calificativo debe corregirse antes de redactar.
- **DeepSeek, Casa Milà:** dos dudas sobre fin de obras/certificación y medidas de la parcela proceden de la fuente. DeepSeek registra la diferencia 1910/1912; una parcela no rectangular podría explicar las superficies. No se cuentan automáticamente como errores del modelo.
- **DeepSeek, Santa María del Mar:** las dos dudas cronológicas proceden de una captura internamente contradictoria, que menciona muros terminados en 1325 e inicio en 1329. DeepSeek señala explícitamente la contradicción. Mini también la registra, pero sugiere que ambas fechas pueden coexistir de forma aproximada; esa conciliación no queda justificada por el material.

La revisión encontró fallos en ambos y límites del propio auditor. No permite afirmar una superioridad factual general. Sí respalda mantener la revisión Astra y resolver contradicciones con nuevas fuentes antes de publicar.

## Condiciones y límites

Se capturaron nuevamente seis artículos de Wikipedia en español y se comprobaron sus identidades mediante Wikidata. Se conservan revisión, contenido, autoridades y huellas SHA-256. Se verificó por igualdad exacta que las seis solicitudes iniciales comparten fuentes, instrucciones, entrada, esquema y nombre de herramienta. Las reparaciones reciben prioridades derivadas de las carencias de cada candidato.

Ambos usan el curador, la normalización, la admisión y el selector existentes, con objetivo de 600 palabras / 300 segundos por parada y límite de 6000 tokens por respuesta. DeepSeek usa `deepseek-flash`, razonamiento desactivado, temperatura 0 y llamada de función; se verificaron catálogo y modelo devuelto, siempre mediante **api.deepseek.com directamente**. El lanzamiento figura en las [actualizaciones oficiales de DeepSeek](https://api-docs.deepseek.com/updates/).

Mini usa `openai/gpt-5.4-mini` por OpenRouter, autorizado por el usuario, con razonamiento desactivado y JSON estricto como el cliente existente. No admite el parámetro temperatura usado inicialmente. Las nueve respuestas completadas identifican proveedor OpenAI, nivel default y el modelo Mini esperado; se deshabilitaron los fallbacks. El formato de transporte difiere por compatibilidad, manteniendo el mismo contrato de contenido.

**Alcance: curación y reparación sobre fuentes congeladas, seguida de auditoría de afirmaciones.** No se ejecutaron selección de ruta, búsqueda adaptativa, arco, redacción final ni audio. SearXNG y Firecrawl locales no respondían; el arranque de Firecrawl falló al conectar con la sesión systemd/D-Bus. Cada parada tiene una sola fuente editorial. Es una ejecución por candidato, sin repeticiones ni orden aleatorio; los porcentajes no son una estimación estadística de producción.

## Costes y trazabilidad

El coste Mini procede de `usage.cost`; el de DeepSeek se calcula con los tokens reales y las [tarifas oficiales](https://api-docs.deepseek.com/quick_start/pricing) del horario punta aplicable. No se convierte la cuota ChatGPT de Astra en un precio API.

Un intento previo de Mini fue rechazado con HTTP 404 por parámetros incompatibles, antes de obtener una respuesta de modelo. No tiene consumo confirmado. Se conserva una exposición prudente de **0,062403750 USD**, aparte de los resultados comparables; no se cuenta como fallo de calidad ni como tiempo de generación. El intento corregido incorpora esa exposición al límite de 1 USD de Mini. DeepSeek tiene otro límite de 1 USD.

Total de curación calculado a partir del consumo confirmado: **0,141520584 USD**. Total conservador incluyendo la exposición desconocida: **0,203924334 USD**, más doce auditorías con cuota ChatGPT.

Artefactos locales en `backend/tmp/narrative-v8/barcelona-mini-deepseek-20260910/`:

- `sources.private.json`: corpus congelado, identidades y revisiones.
- `deepseek/results.private.json` y `mini-fixed/results.private.json`: rondas, admisión, tiempos, costes, solicitudes y respuestas.
- `deepseek-astra-audit/results.private.json` y `mini-astra-audit/results.private.json`: auditorías finales completas.
- `mini/`: intento incompatible, conservado sin sobrescribir.

Los artefactos privados están ignorados por Git; una reproducción necesita conservarlos o capturar un corpus nuevo, que constituiría otro experimento.

## Reproducción y validación

Desde `backend`, la curación con un directorio nuevo se ejecuta así; sin `--execute` comprueba la preparación sin red ni gasto:

```bash
node -r ts-node/register scripts/validation/narrative-barcelona-curation-v8.cjs \
  tmp/narrative-v8/barcelona-mini-deepseek-20260910/sources.private.json \
  tmp/narrative-v8/barcelona-repetition-deepseek deepseek --execute
```

El proveedor `mini` utiliza `OPENROUTER_API_KEY`; DeepSeek utiliza `DEEPSEEK_API_KEY`. Nunca reutilizar una carpeta existente. Para continuar un presupuesto previo, como en el intento corregido, invocar `main(args, {priorSpendUsd: 0.06240375})`; una ejecución nueva no debe ocultar exposición anterior.

```bash
node -r ts-node/register scripts/validation/narrative-curation-audit-v8.cjs \
  tmp/narrative-v8/barcelona-repetition-deepseek/results.private.json \
  tmp/narrative-v8/barcelona-repetition-deepseek-audit --execute
node -r ts-node/register --test scripts/validation/narrative-barcelona-curation-v8.test.cjs
```

La comprobación local pasó (1/1), incluyendo formato compatible de Mini, presupuesto heredado, exposición conservada ante fallo, ocultación de claves, destino directo DeepSeek y conservación de una primera ronda mejor. Las 17 llamadas de curación y 12 auditorías completadas pasaron sus validaciones de formato. Se verificaron las huellas de fuentes y resultados auditados. No se cambió ningún modelo de producción ni se publicó ningún tour.
