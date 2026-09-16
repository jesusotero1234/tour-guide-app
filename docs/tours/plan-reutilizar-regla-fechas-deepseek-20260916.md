# Plan: reutilizar la regla de fechas con DeepSeek

Fecha: 16 de septiembre de 2026. Estado: T1–T3 implementadas; T4 ejecutada sin superar aceptación. T5–T6 pendientes por el resultado editorial.

[Informe de ejecución y evidencia](ejecucion-regla-fechas-deepseek-20260916.md).

## Objetivo y alcance

Conseguir que DeepSeek redacte historia real con una cronología fácil de seguir y una selección deliberada de las fechas que se escuchan. Reutilizar la [regla editorial existente](regla-editorial-fechas-audioguias.md) en distintos tours, manteniendo las fechas completas y sus fuentes en la investigación.

Este plan continúa los [tours históricos por ciudad](plan-tours-tematicos-y-fuentes-20260916.md) y se centra en su redacción. Las tareas se registran aquí, en `docs`, conforme a la ubicación solicitada para este trabajo. No sustituye el plan de otro proyecto que está en `tasks/`.

La primera entrega será una prueba reproducible en español con la regla compartida. La integración en la app dependerá de sus resultados. El descubrimiento de nuevos conceptos por ciudad continúa en el plan temático; no es necesario resolverlo para probar esta regla.

## Lo que sabemos

La [comparación de Madrid de los Austrias](madrid-austrias-fechas-deepseek-20260916.md) pasó de 14 menciones de años completos a una, conservando cinco episodios y una extensión parecida: 722 frente a 716 palabras. DeepSeek hizo las reformulaciones; Codex afinó las instrucciones y revisó el resultado. Hubo un intento demasiado conservador, una respuesta inválida y correcciones posteriores.

Eso respalda continuar. Todavía no demuestra ejecución fiable a la primera ni preferencia de distintos oyentes. El intervalo de una a cuatro menciones se probó para un audio de unas 700 palabras: no será un límite universal, ni se trasladará directamente a tours largos.

La inspección del código distingue dos caminos:

| Parte existente | Reutilización prevista |
| --- | --- |
| `CodexTourProcess.ts` → `narrative-blueprint-author-v8.ts` → `narrative-codex-live-v8.ts` | Entrada actual de narración de la app. Usa Astra; seleccionar `deepseek_control` en preparación no cambia por sí solo este redactor. |
| `narrative-author-canary-material-v8.ts` y `narrative-tour-welcome-v8.ts` | Preparan instrucciones y evidencia para las paradas y la bienvenida. Son los puntos principales para incorporar la regla. |
| Auditoría asociada a esos materiales y `NarrativeCompactVerificationV8.ts` | Reciben también la intención editorial para distinguir una omisión válida de una relación temporal falsa. |
| Cliente DeepSeek, registros de consumo y pruebas de repetición existentes | Ejecutar comparaciones con solicitudes y respuestas conservadas. |
| `LocalVoxCpmRenderer.ts` | Generar audio solo después de aceptar el texto. |

El camino editorial estructurado V8 también tiene redacción y reparación propias. Se comprobarán sus consumidores antes de extender la regla; cambiar sus instrucciones únicamente no garantiza que la narración de la app la reciba.

## Decisiones

1. **Una sola regla mantenida.** El documento editorial será la fuente canónica. Se delimitará su bloque de instrucciones para cargarlo como recurso del mecanismo existente de materiales. Redactor, revisor y reparación recibirán el mismo contenido aplicable; los informes históricos del experimento quedarán fuera del mensaje al modelo.
2. **Incluir la bienvenida y el conjunto del tour.** Elegir anclajes considerando las repeticiones entre capítulos y los retrocesos del recorrido. Utilizar el contexto de ruta y el historial de redacción ya disponibles.
3. **Mantener el rigor en ambas preferencias.** La propuesta inicial selecciona fechas según su utilidad narrativa. Un estilo más cronológico puede conservar más, pero ambos necesitan hechos respaldados. De momento se comparan variantes internas; una preferencia visible en la app se decidirá tras escuchar.
4. **Separar estilo y cambio de modelo.** Primero medir el efecto de la regla usando DeepSeek en ambos brazos de la comparación. Después comprobar su encaje como redactor de la app, manteniendo una revisión separada. La autoevaluación de DeepSeek no será la única condición de aceptación.
5. **Reutilizar investigación, créditos y controles.** La regla no amplía las fuentes admitidas ni los usos autorizados. No se vuelve a investigar una ciudad para producir otra variante del mismo guion.
6. **No añadir una reescritura obligatoria al final.** Incorporar la regla desde la redacción inicial. Corregir solo problemas detectados, con límites de intentos y gasto, y auditar de nuevo el texto corregido antes de generar voz.

## Tareas en orden

### T1. Preparar la regla como recurso compartido

- [x] Delimitar el bloque reutilizable en el documento actual y cargarlo mediante la preparación de materiales existente, con versión o huella registrada. Incluirlo en los recursos distribuidos con el backend; detectar su ausencia antes de llamar al modelo.
- [x] Mantener Madrid, sus cifras y el presupuesto experimental fuera de las instrucciones generales. Una revisión editorial debe poder hacerse en un único lugar.

**Verificación:** comprobar carga en el entorno compilado y error claro si falta el recurso; revisar el contenido exacto enviado. **Dependencias:** ninguna. **Alcance:** pequeño/medio, hasta cinco archivos; documento, carga de materiales, empaquetado si lo necesita y prueba enfocada.

### T2. Aplicar la misma intención a redacción y revisión

- [x] Incorporar la regla a paradas, bienvenida y auditoría del camino activo. El revisor debe admitir omitir un año cuando se conservan los hechos, y exigir claridad cuando cambian los referentes temporales.
- [x] Conservar evidencia, idioma, duración, contratos de salida y límites de reparación. Guardar la huella de la regla con el guion para impedir que una respuesta anterior se presente como una ejecución de la regla nueva.

**Verificación:** pruebas enfocadas de preparación de materiales y bienvenida, más una inspección de las solicitudes finales. **Dependencia:** T1. **Archivos previstos:** `narrative-author-canary-material-v8.ts`, `narrative-tour-welcome-v8.ts`, integración de auditoría utilizada y sus pruebas; máximo cinco por entrega.

### Comprobación A

- [x] La regla llega al redactor real, a la bienvenida y a su revisión; el artefacto compilado puede cargarla.
- [x] La documentación y la narración usan la misma versión; los contratos existentes siguen pasando.

### T3. Verificar los casos temporales que pueden cambiar el significado

- [x] Preparar casos con resultado editorial esperado: licencia de 1629 → inicio en 1644; ocupación parcial posterior; fundación → apertura con iglesia sin terminar; regreso de Felipe IV a Felipe III; una fecha imprescindible; fechas aproximadas o discrepantes.
- [x] Comprobar tanto aceptaciones como rechazos: «quince años hasta empezar» es admisible con esos hitos; «quince años de construcción» no. Omitir 1656 manteniendo la ocupación parcial no borra ese hecho. Una fecha aproximada no permite afirmar un intervalo exacto.

**Verificación:** repetir la revisión sobre ejemplos válidos y versiones alteradas; cualquier error factual que pase debe quedar como fallo pendiente. Contar cifras no sustituye esta revisión semántica. **Dependencia:** T2. **Alcance:** pequeño, casos y prueba/informe.

**Compatibilidad a resolver en esta tarea:** el auditor numérico V8 comprueba literales autorizados y no valida por sí solo todos los números escritos con palabras. No se autorizarán intervalos nuevos solo porque una resta sea correcta o porque se escriban en letras. Cuando un camino exija una proposición autorizada, la relación y sus dos hitos deberán quedar admitidos con evidencia, o se conservará una formulación ya respaldada. No se relajará el control general de números para pasar este ensayo.

### T4. Repetir la prueba con DeepSeek en tres tours

- [x] Congelar Madrid de los Austrias y dos tours de otras ciudades con material ya admitido; Barcelona y Sevilla son candidatas, sujetas a disponibilidad y suficiencia de sus fichas. Definir antes de ejecutar los hechos que cada versión debe conservar y las referencias temporales esenciales.
- [x] Producir para cada tour dos versiones con el mismo DeepSeek, evidencia y extensión objetivo: instrucciones actuales frente a instrucciones con la regla. Seis resultados de texto en total; máximo una reparación por pieza afectada dentro de los límites existentes. Sin correcciones manuales silenciosas.
- [x] Registrar modelo realmente devuelto, regla, intentos, errores, intervenciones, tiempo y consumo, incluidos descartes. Fijar previamente un tope con el control de gasto existente y verificar las tarifas al ejecutar; al agotarlo, registrar el resultado incompleto.

**Verificación:** revisión independiente de los hechos y relaciones, conteo de años con repeticiones y conservación de protagonistas, acontecimientos y longitud. Criterio para avanzar: los tres tours completan ambos brazos dentro de sus límites y la variante con regla queda sin errores factuales pendientes, sin perder hechos esenciales y con cada cambio temporal respaldado. No se impondrá una reducción de fechas a un caso que ya use pocas y necesarias. **Dependencia:** T3. **Alcance:** medio; reutilizar cliente y registros del experimento, con un ejecutor acotado y un informe, sin crear otro motor de tours.

### Comprobación B

- [x] Los resultados separan cumplimiento de formato, exactitud, efecto editorial y coste.
- [ ] Si hace falta afinar la regla tras ver los casos, repetir los afectados y reservar un caso adicional sin usar para afinarla. No presentar la calibración como validación independiente.

### T5. Comparar la experiencia de escucha

- [ ] Generar con VoxCPM2 y la misma voz las versiones aceptadas. Comparar con etiquetas A/B y orden alternado, empezando por vosotros dos.
- [ ] Recoger por separado interés, facilidad para situarse en el tiempo, sensación de exceso de datos y una breve explicación de qué sucedió antes y qué cambió.

**Verificación:** dejar resultados individuales y ejemplos de confusión o preferencia en el informe. Si preferís versiones distintas, eso respalda explorar una elección de estilo; no obliga a imponer una sola. Dos oyentes ofrecen orientación para el siguiente piloto, no validación general del público. **Dependencia:** T4. **Alcance:** pequeño, audios e informe.

### T6. Incorporar el resultado al flujo de la app

- [ ] Si T4 y T5 respaldan avanzar, conectar DeepSeek como redactor en la entrada de narración identificada, conservando contratos, revisión, bienvenida, cancelación, presupuesto y procedencia. Reutilizar el cliente disponible y mantener la misma regla compartida.
- [ ] Probar primero un tour nuevo desde un blueprint conservado hasta texto revisado y audio; después verificar el flujo normal. El contenido histórico y las fuentes siguen vinculados al mismo concepto.
- [ ] Activar inicialmente para el piloto elegido, con una forma explícita de volver al comportamiento anterior. Registrar la política con los artefactos para no mezclar guiones o audios antiguos con la nueva variante.

**Verificación:** pruebas de integración y compilación; recorrido completo de generación y escucha; comprobar que el modelo registrado coincide con quien escribió el texto. **Dependencias:** T4 y T5. **Alcance:** dos entregas pequeñas: selección del redactor y prueba del recorrido completo. Puntos previstos: entrada `narrative-blueprint-author-v8.ts`, ejecución `narrative-codex-live-v8.ts` y pruebas relacionadas. No sustituir los modelos de otras etapas como efecto lateral.

## Cierre y siguiente acción

- [ ] Una misma regla se reutiliza en redacción, bienvenida, revisión y correcciones.
- [ ] La prueba de DeepSeek es reproducible y conserva los fallos, no solo el mejor resultado.
- [ ] Hay evidencia de exactitud y escucha antes de elegir el comportamiento por defecto.
- [ ] La app puede generar un tour del piloto con esa política y sus artefactos identificados.

La ejecución de T4 quedó rechazada tras la única corrección prevista. La regla está disponible mediante activación explícita para pruebas, desactivada por defecto. T5 y T6 no avanzan hasta superar la aceptación editorial; el informe conserva los fallos y propone el siguiente ensayo.
