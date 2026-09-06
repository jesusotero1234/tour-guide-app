# Propuesta: preparar el contenido antes de generar la audioguía

Fecha: 2026-09-05. Estado: plan para revisión y ejecución separada; **no implementado ni probado**.

## 1. Decisión recomendada

No reescribir toda la aplicación, no añadir otra cadena de agentes y no lanzar otro canario completo como siguiente paso. Probar una intervención editorial concreta sobre el pipeline existente: **resolver y seleccionar el contenido antes de escribir, y permitir que la historia determine la estructura de cada parada**.

El primer producto es un tour reutilizable preparado con IA y revisión editorial explícita. Automatizar esa preparación es un objetivo posterior que deberá demostrar su valor. No presentar una preparación manual como generación automática ni rebautizar un borrador con errores como tour aprobado.

No reactivar ahora el goal amplio anterior. Primero ejecutar un hito acotado de preparación y una comparación con salida de continuar/parar. Un goal posterior puede servir para integrar una solución demostrada; no puede compensar una hipótesis sin comprobar.

Esta propuesta no renueva presupuesto. El goal anterior quedó bloqueado: 4,46891230 USD contabilizados de 5; saldo conservador 0,53108770 USD. No hay autorización nueva para una campaña pagada. La fase 0 es local; la fase pagada requiere autorización explícita y un máximo total antes de empezar. No reiniciar contadores ni considerar esos 5 USD disponibles otra vez.

## 2. Qué sabemos y qué no

Base inspeccionada: rama `codex/narrative-v8-prototype-clean`, HEAD `ef55a94ddbd58fb95b77b7e99f55f66d86303ed1`, con modificaciones posteriores sin commit. El ejecutor debe conservarlas y registrar su estado; no asumir que HEAD representa todo el código evaluado.

Evidencia existente:

- El canario final tuvo 19 solicitudes: arquitecto, siete escritores, siete verificadores, revisión global, dos reparadores y una reverificación. Se detuvo antes de otra verificación por reserva de presupuesto. No demuestra un bucle ilimitado dentro de ese run.
- Hubo un resultado 6/7 a la primera que no detectaba una cronología contradictoria. La aprobación del juez no es una referencia suficiente de factualidad.
- Ya existen dossier, proposiciones, fichas de evidencia, arco, permisos de transición y auditoría por frase. Añadir esos nombres de nuevo no cambia el problema.
- El escritor puede utilizar proposiciones y detalles de pasajes locales. No es cierto que solo reciba fichas sin pasajes. El paquete también contiene restricciones y un orden predefinido de beats; se omiten beats vacíos, pero se exige un segmento por cada beat retenido.
- La redacción conjunta de tres paradas y el briefing genérico de mayor concreción ya se ensayaron sin resolver el conjunto. Esta propuesta no consiste en repetirlos.
- RAG no tiene un nuevo A/B final suficiente para demostrar beneficio o inutilidad. Una fuente recuperada puede ser irrelevante, contradictoria o insuficiente para una afirmación.

Referencias locales:

- [Resultados anteriores](narrative-goal-result-20260905.md), especialmente comparación, defectos y presupuesto.
- [Contrato de escritura](../../backend/src/services/poi/NarrativeWriterContractV8.ts): `buildNarrativeWriterPlanV8`, `NARRATIVE_BEAT_ORDER_V8`.
- [Proyección](../../backend/src/services/poi/NarrativeEditorialEvidenceProjectionV8.ts): `projectPerStopInput`, `buildWriterSuffix`, permisos locales y de puente.
- [Verificador](../../backend/src/services/poi/NarrativeCompactVerificationV8.ts): `verifyNarrativeCompactV8` y prompt de consistencia factual.

Hipótesis, no hecho demostrado: una selección editorial resuelta y una composición menos rígida producirán mejores primeras versiones con el escritor actual. La comparación evalúa ambas juntas; no aislará cuál causa la mejora. Solo haríamos una separación adicional si esa distinción cambia una decisión de implementación.

## 3. Resultado que buscamos

Una audioguía completa que alguien pueda disfrutar en el lugar: hechos respaldados, episodios concretos cuando existan, orientación prudente, variedad entre paradas, transiciones correctas y tiempo coherente. No debe sonar a informe de fuentes ni a la misma reflexión sobre memoria/poder repetida siete veces.

«One-shot» significa una primera escritura utilizable sin reescritura factual o estructural importante. No significa una sola llamada para investigar, redactar y certificar todo el tour. La verificación sigue siendo necesaria; una preferencia menor de estilo no invalida por sí sola una primera versión.

Separar tres resultados en todos los informes:

1. Se produjo un guion completo.
2. La revisión no encontró errores materiales pendientes dentro del alcance comprobado.
3. La experiencia narrativa resulta suficientemente buena para un piloto humano.

Ninguno implica automáticamente los otros. La referencia humana también puede equivocarse: registra fuentes, alcance y desacuerdos; no es una garantía universal de verdad.

## 4. El cambio editorial concreto

### 4.1 Un paquete preparado sobre el dossier existente

No crear otra base de datos ni otro RAG. Para el piloto, un archivo de decisiones editoriales referencia los IDs y huellas del dossier congelado. Contendrá:

| Campo | Contenido y límite |
| --- | --- |
| Identidad y versión | stopId, huella de dossier, idioma y orden de ruta. Sin nombres de ciudades en lógica de producción. |
| Pregunta o episodio central | Qué merece descubrir el visitante aquí; no obliga a inventar conflicto ni personajes. |
| Material elegido | Proposición/afirmación y pasajes que la respaldan; detalles útiles de contexto, con alcance histórico y físico explícito. |
| Decisiones de incertidumbre | Qué dato se omite, se atribuye o permanece pendiente; motivo y pasajes originales. No reescribir las fuentes para hacerlas consistentes. |
| Posibilidades narrativas | Detalles observables acreditados, episodios humanos documentados y relaciones prudentes; no diálogos, emociones o intenciones inventadas. |
| Continuidad | Qué se ha contado antes, qué aporta esta parada y siguiente stopId. Los hechos del puente llevan sus referencias autorizadas. |
| Tiempo y capacidad | Objetivo acordado antes de escribir y evaluación editorial de si el material lo sostiene. No derivar calidad del número de fichas. |

En el candidato, los hechos seleccionados y sus pasajes de soporte constituyen el material para redactar. El verificador mantiene el corpus original relevante, incluidos los conflictos, además de las referencias editoriales: **no ocultar evidencia adversa para conseguir aprobación**. Las notas editoriales no sustituyen fuentes ni conceden permisos a afirmaciones sin respaldo.

Si un detalle interesante necesita una fuente adicional, se registra esa necesidad. No se completa con memoria del modelo. En la comparación inicial no se añade información nueva a un solo brazo.

### 4.2 Libertad de composición, trazabilidad conservada

La nueva variante experimental no exige cubrir seis categorías ni reproducir una estructura universal. El escritor puede ordenar los párrafos según el episodio elegido y el contexto de la visita. Un anclaje concreto y una transición útil son orientaciones editoriales, no cuotas de segmentos que disparen reintentos.

Salida experimental mínima: párrafos de texto con referencias a las fichas seleccionadas. El backend compone el texto y asigna sentenceIds con el helper existente. Las referencias declaradas no demuestran soporte semántico: el auditor y la revisión siguen comprobándolo.

No imponer al candidato el parser de beats antiguo: sería medir conformidad con la plantilla que se quiere cuestionar. Ambos brazos deben convertirse al mismo formato de guion/frases para evaluación; límites de transporte, IDs válidos y texto no vacío permanecen.

No eliminar cobertura de hechos esenciales acordados ni modificar silenciosamente el contrato de producción. La comparación con prosa flexible vive primero en el arnés experimental.

### 4.3 Tiempo: mantenerlo sin fabricar contenido

Primero se evalúa la capacidad del material; después se fija el reparto. Ambos brazos reciben los mismos objetivos congelados. No declarar ganador un texto bonito que consigue serlo omitiendo la mitad de la narración.

Se reutiliza `evaluateNarrationDeliveryV8`: margen local provisional de ±20% y agregado de ±10%. Se informa también el desvío exacto, sin promover el estrecho objetivo del writer a bloqueo adicional. En tres casos separados, la suma solo es un indicador del lote, no prueba un recorrido completo.

En la integración, comprobar tanto narración total como geometría/tiempo estructural de ruta. Caminar, escuchar y observar son actividades distintas; no sumar dos veces actividades simultáneas ni rellenar el déficit con pausas ficticias. Los 120 minutos solicitados no equivalen a 120 minutos de voz.

Si una parada no sostiene su objetivo, antes de generar se puede redistribuir tiempo hacia otras con material suficiente, buscar evidencia concreta o ajustar el recorrido. Si el conjunto sigue sin sostener la duración, se informa como no viable con el material actual. No se degrada silenciosamente a un tour más corto. La comparación no cambia objetivos de un solo brazo después de leer sus resultados.

## 5. Fase 0: preparar una prueba que pueda desmentir la hipótesis

Trabajo local y sin nuevas llamadas pagadas. No tocar producción.

### Casos y fuentes iniciales

Usar artefactos privados existentes como solo lectura; no sobrescribir checkpoints, prompts guardados ni revisiones.

1. **Madrid, Palacio Real, Q171517**: `backend/tmp/narrative-v8/madrid-v8-goal-final-20260905-1/`. El checkpoint tiene 11 proposiciones y 10 pasajes; objetivo guardado 600 palabras. Caso de desarrollo narrativo de un lugar rico, sujeto a comprobar que los pasajes realmente ofrecen episodios útiles.
2. **Madrid, Plaza Mayor, Q1123493**: mismo directorio. 13 proposiciones, 13 pasajes y objetivo 600. Caso con la contradicción ya documentada y transición. Preparar la resolución con los originales, no copiar el parche final como referencia suficiente.
3. **Málaga, La Malagueta, Q523311**: `backend/tmp/narrative-v8/malaga-v8-goal-material-20260905-2/`. 9 proposiciones y 8 pasajes. Permite contraste fuera de Madrid y tiene menos proposiciones que las otras paradas de ese checkpoint. **Eso no demuestra escasez narrativa**: leer antes de clasificar y conservar el objetivo del checkpoint salvo decisión previa documentada para ambos brazos.

Además, una prueba gratuita de escasez deliberada usa una copia reducida y etiquetada como sintética del tercer dossier. Conserva referencias consistentes y elimina suficiente material para que el objetivo no se sostenga. La evaluación editorial la marca explícitamente como insuficiente; el arnés debe respetar esa decisión y no pedir redacción, sin inventar ni cambiar la fuente original. Esto prueba el tratamiento de insuficiencia declarada, no un detector automático de capacidad narrativa. No contar este fixture como prueba de calidad en otra ciudad real.

### Entregables de preparación

Directorio propuesto nuevo: `backend/tmp/narrative-editorial-first-v8/preparation-<id>/`, protegido y exclusivo para esa preparación:

- `cases.private.json`: rutas originales, IDs, huellas, modelos/configuraciones, objetivos y condiciones fijadas.
- `editorial-packets.private.json`: los tres paquetes anteriores y sus decisiones justificadas.
- `reference.private.md`: hechos materiales esperados, errores conocidos, afirmaciones no autorizadas y posibilidades narrativas. No exigir que el modelo copie un guion de referencia.
- `reference-tour-fragment.md`: una muestra editorial de una parada con las fuentes al lado, para mostrar qué entendemos por buena audioguía. Etiquetar autoría/asistencia y no usarla como si fuera salida del candidato.
- `comparison-plan.md`: criterios fijados, llamadas previstas, configuración y coste máximo calculado antes de autorizar ejecución.

El responsable técnico toma las decisiones editoriales; Qwen puede extraer pasajes y comprobar IDs. Ni Qwen ni un ejecutor mecánico deben decidir silenciosamente qué contradicción ignorar.

Si no conseguimos preparar un paquete convincente con ese material, la fase termina con el déficit identificado. Esa conclusión ya cambia la siguiente acción: mejorar investigación/selección, no afinar otra vez al escritor.

## 6. Fase 1: comparación cerrada, sin reparaciones

Solo tras aprobar la preparación y disponer de autorización de gasto válida.

- Brazo A: contrato actual, reconstruido desde el checkpoint congelado y registrado.
- Brazo B: mismo corpus de origen y objetivos, paquete editorial preparado y composición flexible.
- Mismo modelo escritor y parámetros: el writer de `qwen38_hybrid`, GPT-5.4 Mini, mientras se revalida que la configuración local siga siendo esa. No cambiar escritor y auditor a la vez.
- Misma configuración de auditor para ambos brazos, fijada y guardada antes de empezar. La actual usa GPT-5.4; es una medición auxiliar, no la referencia humana. Conservar controles conocidos donde Mini dejó pasar un error.
- Tres casos por dos brazos: **seis escrituras y seis auditorías**, sin global scorecard adicional ni reparadores en esta fase. Contar aparte cualquier control nuevo que se ejecute; no esconderlo en el total.
- Un intento de generación por caso/brazo. Un fallo de transporte queda clasificado como tal; no reintentar a escondidas ni excluir una salida mala. Cualquier repetición requiere motivo registrado y saldo suficiente, no búsqueda del mejor de varios resultados.
- No se pretende significación estadística con tres pares. Si la diferencia es pequeña o inconsistente, resultado inconcluso: no escalar por entusiasmo.

Revisar los textos con etiquetas A/B ocultas y orden de presentación fijado. El usuario o un revisor humano decide la experiencia narrativa; Codex entrega el contraste de afirmaciones/pasajes y una recomendación. Si falta esa revisión, no declarar demostrado el gusto del visitante ni autorizar promoción automática.

Registrar por salida:

- Afirmaciones materiales incorrectas/no respaldadas y su localización; separado de preferencias de estilo y falsos positivos del auditor.
- Si resuelve u omite de forma adecuada el conflicto conocido.
- Concreción, interés, repetición, naturalidad oral y continuidad, con ejemplos de texto y juicio breve; no inventar un umbral decimal de calidad.
- Palabras, objetivo y desvío; tiempo estimado, sin llamarlo TTS medido.
- Llamadas, tokens, coste reportado/exposición, tiempo de generación, minutos de preparación y revisión humana.

### Regla de decisión previa

Continuar a integración solo si B no introduce errores materiales nuevos, resuelve los defectos de control, respeta los objetivos y tiene una mejora narrativa clara en al menos dos casos sin regresión importante en el otro. El revisor documenta la comparación; no basta un score del LLM.

Si ambos brazos tienen un problema de evidencia, volver al diagnóstico de la preparación, no generar varias versiones hasta que alguna pase. Si el paquete bien preparado no mejora, no promoverlo: queda fundamento para una comparación separada de escritor o de composición, no una orden de gastar indefinidamente.

Si solo mejora el estilo pero empeora factualidad o duración, no ha ganado. Si funciona con trabajo humano importante, puede ser válido para catálogo asistido, pero no prueba curación autónoma ni one-shot desde investigación cruda.

## 7. Implementación acotada para el agente ejecutor

### Primera entrega: únicamente preparación y arnés

Reutilizar `backend/scripts/validation/narrative-writer-briefing-pilot-v8.ts`, que ya tiene dry-run, casos congelados, variantes y `NarrativeProgressSpendGuardV6`. No crear un cuarto framework de benchmarks ni usar los topes históricos de otro script como presupuesto nuevo.

Extensión decidida para el piloto:

1. Añadir variante experimental `editorial_packet` y entrada explícita del archivo preparado; conservar `baseline`, `concrete` y `grouped` sin cambiar su significado.
2. En `editorial_packet`, reemplazar las instrucciones de forma del escritor por el contrato editorial experimental; no anexar instrucciones incompatibles al molde antiguo. No introducir un resolvedor genérico de prompts.
3. Validar IDs/huellas/targets y compilar los párrafos al guion común con `assignNarrativeSentenceIdsV6`. No pasar la salida flexible por el parser que exige beats.
4. Mantener la misma evidencia fuente para auditoría, con las decisiones editoriales como datos y los pasajes en conflicto visibles. No tratar `supportCardIds` como prueba automática de verdad.
5. Añadir medición con el evaluador de duración de entrega, preservando el desvío estrecho solo como diagnóstico. Guardar todos los resultados, también fallos y pendientes, sin borrar borradores útiles.
6. Dry-run debe enumerar casos/modelos/objetivos/llamadas y detenerse antes de HTTP. Ejecutar no es el comportamiento por defecto.

Conservar `--source` como entrada de un checkpoint: no construir un cargador general de múltiples ciudades. La comparación se puede ejecutar en cuatro invocaciones serializadas (Madrid A/B con dos paradas; Málaga A/B con una), seleccionando las entradas correspondientes del paquete. Todas comparten techo de campaña y arrastran el acumulado real de la anterior; nunca usar cuatro presupuestos independientes. El manifiesto de preparación vincula cada caso al checkpoint correcto.

Allow-list inicial: ese script y su nuevo test adyacente `backend/scripts/validation/narrative-writer-briefing-pilot-v8.test.ts` (comprobar inexistencia antes de crearlo). Los datos de preparación viven en el directorio privado indicado, no en cambios de producción. El script ya protege `main` con `require.main === module`: preservar ese comportamiento al hacer importables los helpers mínimos para el test.

Regresiones mínimas en ese test:

- Un párrafo o número variable de párrafos válidos no falla por no usar los seis beats; IDs/huellas ajenos sí fallan.
- Un dato conflictivo omitido del material de escritura continúa visible en el input del auditor.
- Mismos objetivos A/B; no altera pasajes ni checkpoints; no promueve el candidato por contar IDs.
- El modo sin `--execute` no envía HTTP ni consume presupuesto; el límite no autoriza llamadas que no caben.
- La construcción de un resultado no convierte revisión pendiente en aprobación.

Validación local prevista desde `backend`, tras crear el test y comprobar el runner existente:

```bash
npx jest --runInBand --runTestsByPath scripts/validation/narrative-writer-briefing-pilot-v8.test.ts src/services/poi/NarrativeWriterContractV8.test.ts src/services/poi/NarrativeDurationTargetsV8.test.ts
npx tsc --noEmit
git diff --check
```

No ofrecer todavía un comando pagado del modo nuevo: los flags aún no existen. El ejecutor debe entregar el comando real comprobado en dry-run, usando saldo y techo acumulados correctos, antes de solicitar su ejecución.

### Segunda entrega, condicionada a evidencia favorable

Integrar el paquete preparado como entrada explícita opcional al canario; por defecto mantener el camino actual. Nombre propuesto: `--editorial-packet=<path>`; **no existe aún**. Debe validar la relación con ruta, dossiers e idioma actuales. Un paquete incompatible no se adapta silenciosamente.

Puntos de cambio previsibles, a dividir en tareas coherentes y revisar antes de escribir:

- `NarrativeWriterContractV8.ts`: contrato alternativo y parsing; no romper contratos/checkpoints anteriores.
- `NarrativeEditorialEvidenceProjectionV8.ts`: una proyección coherente del paquete y los puentes.
- `NarrativeEditorialAgentsV8.ts`: seleccionar el contrato y actualizar huella de política; no fingir compatibilidad de auditorías viejas.
- `narrative-user-canary-v8.ts`: entrada del paquete y guardado reproducible.
- Tests de contrato/proyección/staged: preservar reanudación, fallos visibles y elección de versiones verificadas.

No cambiar aún la curación automática para imitar a un editor humano. Esa automatización necesita otra medición de calidad del paquete. La primera integración puede producir un catálogo asistido útil sin fingir que todo se decide solo.

Mantener la reparación material acotada ya existente; no añadir rondas. Si queda un error material, guardar el guion y marcar revisión pendiente. No llamar éxito al mero hecho de producir Markdown.

No implementar reverificación selectiva en esta intervención. Es una optimización diferente con riesgos propios; mantener su coste visible evita mezclar causas.

## 8. RAG: lugar concreto y límites

El RAG entra al preparar el contenido, cuando se necesita un episodio, detalle o contexto concreto. Sus resultados pasan por la admisión existente y deben aparecer como evidencia trazable que realmente cambia el paquete. No meter más texto al final del escritor por si ayuda.

Conservar `--rag=off|on` y la infraestructura actual. No modificar índices, embeddings, servicio, esquema ni trabajo de otro agente. El primer A/B usa fuentes congeladas y el mismo modo RAG para ambos brazos, para no mezclar el efecto del contenido con el de la recuperación.

Después, una comparación RAG on/off puede medir qué evidencia nueva se admite, qué aporta al relato y cuánto cuesta. Si nada nuevo es útil, declararlo y continuar sin él; no es obligatorio que RAG gane. Cambiar la evidencia invalida un paquete preparado contra otra huella y requiere revisarlo, no forzar la compatibilidad.

Pruebas existentes que no deben perderse: `NarrativeHistoricalCorpusV8.test.ts` y `NarrativeHistoricalCorpusV8.queue.test.ts` bajo `backend/src/services/poi/`.

## 9. Validación de producto posterior, no sustituible por los tres casos

Si la comparación gana y la integración se autoriza:

1. Preparar un paquete del recorrido completo y generar un canario Madrid con todos los guiones, revisión factual y duración de conjunto. Sin retoques específicos de ciudad en producción.
2. Entregar el Markdown completo y una lectura editorial. Registrar primera pasada, reparaciones y defectos pendientes; al menos 6/7 sin reparación material sigue siendo objetivo orientativo, no excusa para ocultar el séptimo.
3. Comprobar otro recorrido completo fuera de Madrid antes de afirmar generalización. Los ejemplos sueltos de Málaga no sustituyen ese recorrido.
4. Mantener la prueba de evidencia insuficiente: debe fallar de forma útil antes de fabricar contenido, no aparentar que un resultado más corto cumple el pedido.
5. El TTS y la prueba caminando quedan pendientes explícitos para publicación comercial; no confundir estimaciones con tiempos o visibilidad medidos.

No declarar que tres paradas demuestran una arquitectura universal, que el RAG mejora por estar conectado o que el coste de un run incompleto es el coste de un tour terminado.

## 10. Presupuesto, continuidad y salida del ciclo

Antes de cualquier campaña pagada, reservar capacidad para toda la comparación elegida, incluyendo auditorías y controles, con los mecanismos existentes y precios verificados en preflight. No basta poder pagar la primera escritura. No bajar máximos arbitrariamente para eludir la reserva que bloqueó la tanda anterior.

En ausencia de presupuesto adicional, terminar preparación, tests y dry-run y entregar los artefactos. No usar otro proveedor ni descontar exposición antigua para hacerla caber.

Límites deliberados de esta propuesta:

- Una comparación inicial, no una búsqueda interminable de prompts.
- Ninguna promoción a producción solo por tests o aprobación de otro modelo.
- Ninguna nueva infraestructura ni cambio de modelo por defecto.
- No gastar en canarios completos antes de saber si el briefing preparado ayuda.
- El tiempo editorial humano se contabiliza; una solución asistida puede valer la pena sin ser autónoma.

## 11. Encargo para un ejecutor separado

Mensaje listo para copiar:

> Lee `docs/operations/narrative-editorial-first-proposal-20260905.md` y el `AGENTS.md` vigente. Ejecuta únicamente la fase 0 y la primera entrega local de la sección 7: prepara los tres casos con evidencia y decisiones editoriales explícitas, implementa la variante experimental en el arnés existente y entrega tests, muestras y dry-run. No modifiques producción, infraestructura/RAG ni modelos por defecto. No ejecutes llamadas pagadas ni reutilices como nuevo el presupuesto anterior. Conserva cambios ajenos y todos los checkpoints. El responsable técnico decide los paquetes; Qwen puede ayudar con extracción/implementación acotada según AGENTS.md. No añadas skills retiradas por el usuario. Al terminar entrega los archivos, comandos reales verificados, discrepancias encontradas y lo que queda pendiente para comparar A/B. Si el material no permite un buen briefing para la duración, explica el déficit: no lo escondas con relleno, una cuota menor o una nueva cadena de agentes.

Un goal posterior debe tener por hito primero **concluir la comparación y tomar una decisión sustentada**, no «seguir hasta que todo pase». El resultado negativo o inconcluso es una conclusión válida de investigación; no equivale a lograr el objetivo comercial. Solo después de decidir integrar tiene sentido un goal de entrega del tour completo, con aceptación humana y presupuesto de ejecución definidos.

## 12. Respuesta honesta a «¿esto nos dará el tour?»

Esta propuesta ofrece una vía comprobable, no una promesa. Ataca una limitación distinta de los ajustes de palabras: la calidad del material editorial que recibe el escritor y la libertad para contarlo. Conserva los arreglos útiles de integridad, gasto y duración.

Si una buena preparación manual produce una audioguía convincente con la cadena actual, ya tenemos una ruta hacia un catálogo asistido y sabemos qué trabajo intentar automatizar. Si ni así funciona, evitamos otra gran integración y tendremos evidencia para cambiar la composición o el escritor. Lo que no haría es prometer que añadir un agente o volver a ejecutar el canario solucionará la falta de una historia bien preparada.
