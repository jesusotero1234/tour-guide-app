# Plan de implementación: repetición en narración

## Objetivo

Convertir el veredicto unánime del Board en cambios concretos sobre la generación de narraciones largas para que la repetición pase de ser un problema editorial a un `HARD FAIL` dentro del loop de validación y retry ya existente.

## Estado actual relevante

- `pods/llm-pod/src/routes/narrativeLong.ts` ya tiene un backstop de repetición por trigramas en `hasRepetition()` y lo aplica desde `validateSection()`.
- `generateSection()` ya hace hasta 2 intentos y reinyecta feedback vía `missingFacts` cuando `validateSection()` falla.
- `pods/llm-pod/src/prompts/narrative/types.ts` centraliza el prompt de sistema en `sectionSystem()`.
- `pods/llm-pod/src/prompts/narrative/narrativeBrief.ts` ya contiene `forbiddenClaims`, pero el Board ha decidido que estas reglas son de estilo y no deben moverse ahí.

## Cambios propuestos

| Archivo exacto | Función / zona a tocar | Qué añadir o modificar | Verificación |
| --- | --- | --- | --- |
| `pods/llm-pod/src/routes/narrativeLong.ts` | Zona de helpers de validación, junto a `hasRepetition()` | Añadir un detector nuevo de frases repetidas de 5+ palabras. Implementación propuesta: tokenizar igual que `hasRepetition()`, construir n-gramas de longitud 5 hasta un máximo razonable (por ejemplo 8 o hasta el final), y marcar `HARD FAIL` si cualquier frase aparece 2 o más veces dentro de la misma sección. Debe devolver un motivo específico, por ejemplo `repetition-long-phrase`. No sustituye a `hasRepetition()`: lo complementa. | Crear pruebas manuales con una sección que repita exactamente una frase larga dos veces, por ejemplo la misma secuencia de 5-7 palabras en dos oraciones. `validateSection()` debe devolver `repetition-long-phrase`. Confirmar además que una sección sin esa repetición no dispara el error. |
| `pods/llm-pod/src/routes/narrativeLong.ts` | Zona de helpers de validación, cerca de `validateSection()` | Añadir un detector de conectores repetidos con lista cerrada del Board: `Fíjate`, `Observa`, `Mira`, `Nota`, `Imagina`, `Si miras`, `Date cuenta`, `Verás`, `Encontrarás`, `Descubrirás`. Regla exacta: máximo 1 vez por párrafo y máximo 2 veces por narración completa. Como este endpoint genera por secciones, conviene implementarlo en dos capas: 1) validador por sección que falle si un mismo conector aparece más de una vez dentro de la sección; 2) agregación final sobre la narración concatenada para fallar si el total global supera 2. Motivos sugeridos: `repetition-connector-section` y `repetition-connector-total`. | Probar una sección con `Mira... Mira...` en el mismo bloque y verificar fail inmediato por sección. Probar una narración final con conectores válidos por sección pero 3 apariciones totales y verificar fail global por total. Probar una narración con 0-2 apariciones totales y confirmar que pasa. |
| `pods/llm-pod/src/routes/narrativeLong.ts` | `validateSection()` y `generateSection()` | Insertar los nuevos detectores como `HARD FAIL` dentro del flujo existente de retry, manteniendo el detector actual de trigramas como backstop. Orden recomendado en `validateSection()`: frases largas repetidas, conectores repetidos, luego `hasRepetition()` de trigramas. En `generateSection()`, ampliar el mapeo de `validationError -> missingFacts` para que el segundo intento reciba feedback específico, por ejemplo: evitar repetir conectores de apertura y no reutilizar frases de 5+ palabras. No hace falta cambiar la mecánica del retry; solo sus causas y mensajes. | Forzar cada nuevo error y confirmar en logs/traza que: 1) el primer intento falla con el código correcto; 2) se genera un segundo intento; 3) `missingFacts` contiene instrucción correctiva alineada con el error; 4) el detector de trigramas sigue funcionando cuando los nuevos detectores no capturan el caso. |
| `pods/llm-pod/src/routes/narrativeLong.ts` | Ensamblado final de la narración en el `router.post('/stop/long', ...)`, después de reunir las secciones | Añadir una validación final sobre la narración completa concatenada para la cuota global de conectores (`2x` máximo por narración completa). Si falla, el documento recomienda reutilizar el patrón actual del endpoint: marcar razón de validación, registrar el evento y decidir entre dos opciones de implementación. Opción A, preferida por simplicidad: rehacer solo las secciones que contengan el tercer conector o más, no toda la narración. Opción B, mínima en código: si el total global falla tras ensamblar, devolver fallback de la sección problemática. La decisión debe mantenerse consistente con el loop actual por secciones. | Montar una narración de 3-4 secciones con un conector permitido en tres secciones distintas. Verificar que el chequeo por sección pasa, pero el chequeo final global falla. Confirmar que el comportamiento elegido (retry dirigido o fallback) queda trazado en `narrativeLog`/`debugTrace`. |
| `pods/llm-pod/src/prompts/narrative/types.ts` | `sectionSystem()` | Inyectar literalmente la instrucción del Board en el bloque común del system prompt: `No empieces dos oraciones con el mismo conector. No repitas frases de 5+ palabras dentro de la misma narración.` Debe vivir en `sectionSystem()` porque es una regla editorial transversal a arrival/history/significance/transition. No moverla a prompts individuales salvo que después se quiera reforzar algún caso concreto. | Inspección del string final de `sectionSystem()` en una llamada real o test unitario: la instrucción debe aparecer para todos los idiomas o, si se mantiene en español, al menos debe inyectarse de forma consistente en todos los prompts de sección. Confirmar que `arrivalPrompt`, `historyPrompt`, `significancePrompt` y `transitionPrompt` la reciben sin cambios adicionales. |
| `pods/llm-pod/src/prompts/narrative/narrativeBrief.ts` | `extractForbiddenClaims()` y estructura `NarrativeBrief` | No tocar. El Board fue explícito: no ensuciar `forbiddenClaims` con reglas de repetición porque no son restricciones factuales sino reglas de estilo del sistema. Este archivo debe quedar fuera del cambio. | Revisar el diff final y confirmar que `narrativeBrief.ts` no aparece modificado. |

## Orden de implementación recomendado

1. Añadir helpers nuevos en `narrativeLong.ts` para detectar `repetition-long-phrase` y repetición de conectores por sección.
2. Integrarlos en `validateSection()` sin eliminar `hasRepetition()`.
3. Extender `generateSection()` para que los nuevos errores disparen retry con feedback específico.
4. Añadir chequeo global de cuota de conectores sobre la narración ensamblada.
5. Inyectar la instrucción editorial en `sectionSystem()`.
6. Verificar que `narrativeBrief.ts` permanece intacto.

## Criterios de aceptación

- Una frase de 5 o más palabras repetida 2 veces dentro de una sección provoca retry.
- Un mismo conector repetido 2 veces en una sección provoca retry.
- Más de 2 conectores de la lista en la narración completa provoca fail global.
- El detector de trigramas actual sigue activo como backstop.
- La instrucción editorial vive en `sectionSystem()`.
- `NarrativeBrief.forbiddenClaims` no recibe reglas nuevas de repetición.

## Riesgos y decisión práctica

- El punto menos trivial es la cuota global de conectores porque el pipeline valida por sección, no por narración completa.
- Para minimizar código y riesgo, conviene que el detector global solo cuente conectores de apertura claramente delimitados al inicio de oración, no cualquier aparición casual dentro de una frase.
- Si hubiera ambiguedad con párrafos frente a secciones, este plan asume que cada sección generada es un único párrafo lógico; si en runtime hubiera saltos de línea internos, el contador por párrafo debe usar esos delimitadores reales.
