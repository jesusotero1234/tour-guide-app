# Plan: una entrada más clara para DeepSeek

Fecha: 16 de septiembre de 2026. Estado: **ejecución técnica cerrada; criterios cumplidos, duración insuficiente según el usuario**.

## Objetivo

Comprobar si DeepSeek redacta una historia clara y suficiente cuando recibe hechos realmente seleccionados, un ejemplo coherente y una orientación breve. La mejora buscada es que el episodio aparezca pronto, avance y termine sin volver a contar el desenlace.

Este ensayo parte del [diagnóstico del encargo anterior](diagnostico-encargo-deepseek-20260916.md). Se conserva aquella prueba, cuya revisión posterior distingue una pieza utilizable con contraste ampliado de **cero piezas sobre dos con cumplimiento estricto**. La nueva prueba no reescribe esa evaluación ni sustituye los tours entregados.

## El cambio que vamos a probar

**Codex selecciona y comprueba los hechos → DeepSeek redacta → Codex revisa → una corrección como máximo → audio de las piezas válidas.**

Se cambia la preparación editorial como un conjunto. Mantendremos inicialmente `deepseek-flash`, razonamiento adicional desactivado, temperatura cero y el formato existente de salida con `id` y `text`. Al ejecutar se confirmarán disponibilidad y tarifas; cualquier cambio del modelo servido quedará registrado. No se atribuirá una mejora a una sola frase del nuevo encargo.

### Una ficha breve, con funciones separadas

| Bloque | Contenido |
| --- | --- |
| Encargo editorial | Episodio elegido, orden orientativo y límites de redacción. Aquí van las instrucciones. |
| Hechos admitidos | Tres o cuatro hechos necesarios, con una formulación factual y su respaldo en fragmentos de fuentes ya admitidas. |
| Identidad del lugar | Nombre actual y relación con el edificio, respaldados expresamente. Una dirección o un barrio solo serán narrables si se han admitido antes. |
| Continuidad | Posición en el tour y una indicación mínima de enlace. No se adjunta la narración anterior completa ni se trasladan sus hechos a este edificio. |
| Ejemplo de voz | Una referencia de otra parada que avance hasta su desenlace, sin recapitulación final. |

Los pasajes completos, versiones, licencias y créditos se conservan para comprobar la selección. Los fragmentos enviados deben mantener sus antecedentes claros. Si se separan extractos, se identifican como tales: no se fabrica una cita literal uniendo frases ni se convierte una paráfrasis en cita.

El guion solo puede usar los hechos admitidos en esa ficha. Los títulos, notas de continuidad y metadatos tampoco pueden introducir datos históricos por otra vía. Encontrar después un dato en una fuente más amplia no subsana el incumplimiento del encargo original.

### Dos casos ya elegidos

| Caso y orden | Historia seleccionada | Precaución decisiva |
| --- | --- | --- |
| 1. San Pío V | Finalidad original de formación de sacerdotes; uso como hospital militar durante la Guerra Civil; sede del museo después del conflicto. | Hubo otros usos intermedios. Omitir sus detalles no permite afirmar un paso directo del colegio al hospital ni una continuidad docente hasta la guerra. |
| 2. Colegio de la Seda | Petición de reconocimiento como arte; concesión del título; funciones de regulación de los tejidos. | El título no crea desde cero la institución ni la regulación. Admitir de antemano cualquier dato de ubicación que se quiera mencionar. |

En San Pío V se excluyen del material para narrar la planta, el claustro, el arquitecto y las fechas de construcción. En el Colegio, la espera y el reconocimiento organizan el relato; el nombre histórico y el actual deben distinguirse sin explicar al visitante todas las precauciones editoriales.

Se utilizará **Casa de la Villa** como único ejemplo, conservando su desarrollo hasta «La construcción continuó después» y retirando la última frase recapitulativa. Se registrará como adaptación editorial de una referencia anterior. Su función es mostrar la voz y el avance del relato; no impone su extensión ni aporta hechos sobre Valencia. Los modelos no recibirán nuestras reescrituras de los casos evaluados.

## Encargo propuesto

> Cuenta el episodio indicado usando exclusivamente los hechos admitidos y sus pasajes. En las dos primeras frases presenta su primera situación o cambio significativo y sitúa el edificio en el primer párrafo. Avanza con una cronología comprensible hasta el resultado. No necesitas adelantar todos los cambios en la apertura. Cada parte debe aportar información: cuenta el desenlace una sola vez y termina ahí. Conserva las fechas que orienten al oyente. Sigue la voz del ejemplo, con la extensión que necesiten estos hechos, sin rellenar. No inventes causas, escenas, conversaciones ni motivos. Habla de tú en español, escribe los números como se pronuncian y devuelve únicamente JSON con `id` y `text`.

Las precauciones específicas van en el bloque editorial, fuera de los hechos. No se pedirá otra respuesta de planificación, una explicación del razonamiento ni una autoevaluación. Un episodio con pocos hechos puede producir una pieza corta.

## Tareas y comprobaciones

### T1. Preparar y fijar ambas entradas

- [x] Crear las dos fichas a partir de las [capturas y referencias guardadas](../../backend/tmp/deepseek-episodio-inicio-20260916/inputs.json). Comprobar los fragmentos, los datos de identidad y las omisiones sin alterar la cronología.
- [x] Guardar el ejemplo adaptado, el encargo, los criterios y los límites antes de llamar al modelo, en `backend/tmp/deepseek-entrada-limpia-20260916/`. Reutilizar el ejecutor existente con una identidad de ejecución nueva.

**Verificación:** cada hecho narrable tiene respaldo enviado al modelo; las instrucciones están separadas de la evidencia; no hay guiones humanos del caso ni cierres recapitulativos en los ejemplos. Comprobación local de formato, integridad y límites sin API. **Dependencias:** ninguna. **Alcance:** pequeño; entradas y ejecutor local.

### T2. Probar San Pío V

- [x] Generar una pieza y revisar los cuatro criterios fijados abajo. Si falla, pedir una sola corrección, señalando los defectos y su propio borrador, sin proporcionar frases de sustitución.
- [x] Guardar los textos intactos y la revisión de cada intento. Si persiste un defecto, cerrar el ensayo con ese resultado y no ampliar las llamadas buscando otra variante.

**Verificación:** los cuatro criterios cumplidos sin editar el guion, o fallo documentado. **Dependencias:** T1. **Alcance:** una pieza y sus registros. Si pasa, continuar con T3 dentro de la misma ejecución autorizada.

### T3. Comprobar el Colegio de la Seda

- [x] Aplicar el mismo encargo y la segunda ficha ya fijada, sin incorporar al prompt lo aprendido de la primera salida. Una generación y, si hace falta, una corrección.
- [x] Revisar especialmente ubicación, nombre histórico, espera y regulación. Registrar por separado si pasa al primer intento o después de corregir.

**Verificación:** los mismos cuatro criterios y cero cambios humanos de la narración. **Dependencias:** T2 superada. **Alcance:** una pieza y sus registros. Si falla, se conserva el caso válido y se informa del alcance limitado.

### T4. Entregar y cerrar

- [x] Generar audio únicamente de las piezas que cumplen, con la misma voz VoxCPM2. Reutilizar fotografías, créditos y audios anteriores en una comparación local. Si ninguna cumple, entregar el informe y los textos sin sintetizarlos.
- [x] Registrar resultado, llamadas, coste estimado y trabajo editorial real. Comparar por separado el borrador anterior, la entrega anterior con edición humana y la nueva salida intacta.
- [x] Registrar la valoración recibida: duración insuficiente para una historia. La escucha detallada no está confirmada; véase el informe.

**Verificación:** correspondencia entre respuesta, guion presentado y texto enviado a voz; reproducción y fotografías visibles cuando haya audio; informe con fallos y límites. **Dependencias:** T2 y T3 cuando proceda. **Alcance:** comparación local e informe en `docs/tours`. El feedback pendiente no bloquea la entrega técnica.

## Criterio de aceptación fijado antes de generar

Cada revisión responderá con sí/no y una evidencia breve:

1. **Inicio claro:** las dos primeras frases presentan la primera situación o cambio significativo del episodio seleccionado; el edificio se sitúa en el primer párrafo.
2. **Relato comprensible:** se entiende qué ocurrió y qué cambió; los saltos temporales y las omisiones no inventan continuidad ni causalidad.
3. **Avance sin doble desenlace:** el desarrollo aporta información y el cierre no vuelve a contar la misma sucesión. Identificar al principio el museo actual no equivale automáticamente a repetir después la historia de su instalación.
4. **Fidelidad a la ficha:** todas las afirmaciones históricas y de ubicación se apoyan en los hechos y pasajes enviados. No se incorporan datos de memoria, de los ejemplos o de una comprobación posterior más amplia.

El criterio de apertura de esta nueva prueba permite comenzar por una situación inicial significativa; no exige adelantar el desenlace. No se usa para cambiar la evaluación de ensayos anteriores. Tampoco se imponen cuotas de fechas o palabras.

Una pieza cuenta como válida solo si cumple los cuatro puntos. Los guiones evaluados no reciben recortes ni reescrituras humanas. Codex sí prepara la ficha, adapta el ejemplo de otra parada y revisa: esa intervención previa se declara, y el resultado no se presenta como autonomía completa.

## Límites y decisión

- **Máximo cuatro solicitudes físicas en total y dos por pieza**, incluidos fallos y correcciones. Tope de exposición de **1 USD de API** mediante el control existente, sin reintentos ocultos. Preparación, revisión y voz se registran aparte.
- Las fichas, el encargo y los criterios de ambos casos se fijan antes de la primera llamada. Una reparación identifica defectos; no abre una nueva ronda de diseño del prompt.
- Si ambos casos cumplen, probar la comparación de escucha y considerar el encargo para nuevas paradas supervisadas. Un resultado parcial se informa como tal. Si falla el primero tras reparar, no se ejecuta el segundo.
- No se activará el razonamiento adicional ni se cambiará de modelo dentro de esta prueba. Esas opciones quedarían para una decisión posterior con resultados comparables.

El plan y las tareas se mantienen juntos en `docs/tours`. Ejecución: dos llamadas de generación, dos piezas aceptadas al primer intento, dos audios nuevos y cero ediciones humanas de las narraciones. [Resultado, límites y comparación de escucha](resultado-deepseek-entrada-limpia-20260916.md). La valoración recibida considera insuficiente la duración para una historia. La incorporación al catálogo y la sustitución de los tours actuales quedan fuera de este ensayo.
