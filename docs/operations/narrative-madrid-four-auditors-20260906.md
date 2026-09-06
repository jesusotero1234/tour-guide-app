# Madrid: Gemini 2.5 Pro, Hy4 preview, GLM 5.3 Flash y Qwen local

Se reauditaron los textos guardados del canario `codex-Q2807-20260906-115441`, con la misma evidencia, contexto, prompt y validación de salida. No se regeneraron narraciones. Los hashes del checkpoint y del resultado original se verificaron sin cambios.

## Resultados

| Modelo y configuración | Auditorías válidas | Coste reportado USD | Latencia acumulada |
|---|---:|---:|---:|
| GPT-5.4 medium, referencia anterior | 6/6 | 0.5783375 | 256.447 s |
| Gemini 2.5 Pro low, esquema simplificado | 0/1 intentada | 0.06892125 | 49.200 s |
| Hy4 preview none | 6/6 | 0.065613132 | 198.691 s |
| GLM 5.3 Flash low | 6/6 tras reintentar Colón | 0.006864275 | 244.676 s, incluido el 429 |
| Qwen local, transporte habitual | 6/6 | 0 de API | 294.591 s |

Latencias sumadas de las llamadas, no duración del trabajo completo. Hubo ejecución simultánea de Qwen y modelos remotos. Las configuraciones de razonamiento difieren; esta es una comparación de configuraciones prácticas, no un aislamiento experimental del modelo. Qwen local se anuncia como `qwen-local` mediante llama.cpp; no se infirió una versión comercial a partir del alias.

Hy4 none reduce el coste un 88.7% y el tiempo un 22.5% frente a GPT-5.4 en esta muestra. GLM reduce el coste un 98.8%, pero solo reduce el tiempo aproximadamente un 4.6%. Qwen tarda aproximadamente un 14.9% más y no factura API (no se contabilizan electricidad ni hardware).

## Calidad observada

Qwen, Hy4 y GLM aceptan los dos detalles que GPT-5.4 había marcado sin respaldo: que las bóvedas del Palacio Real no se aprecian desde el exterior y que Bretón de los Herreros era escritor. Sus justificaciones respaldan principalmente el hecho central, pero no resuelven la afirmación añadida. Son carencias de trazabilidad respecto al material entregado, no demostraciones de falsedad histórica.

GLM también cuestionó la equivalencia entre el Palacio de Comunicaciones y el Palacio de Cibeles. Los pasajes y proposiciones examinados mencionan los dos nombres por separado sin establecer expresamente la identidad. Es una observación documental razonable que merece revisión; no debe clasificarse automáticamente como error del candidato solo porque GPT-5.4 lo aceptó.

Los restantes cambios observados entre etiquetas `supported` y `authorized_inference` no cambian la aceptación de la frase. GPT-5.4 no constituye verdad de referencia: esta muestra no permite medir precisión general ni demuestra que cualquier modelo detecte todos los errores. Los modelos económicos dejan pasar ambos casos positivos señalados por la referencia.

Para sustituir un auditor estricto no considero suficiente esta prueba. Hy4 es el mejor resultado de velocidad y GLM el mejor de coste remoto; Qwen es una opción local funcional. Antes de decidir, la siguiente calibración debe medir afirmaciones secundarias dentro de frases mixtas, transiciones autorizadas y citas válidas. Si se vuelve a DeepSeek, conviene abordar ese criterio además del agotamiento de tokens de razonamiento.

## Fallos y recuperaciones

- Gemini 2.5 Pro: la primera solicitud recibió HTTP 400 porque el esquema con límites anidados y enumeraciones generaba demasiados estados. Se añadió un esquema de transporte simplificado, manteniendo íntegra la validación local original. La segunda solicitud produjo un informe, pero citó `p-dec5bc9bd44542e9521a`, ausente de los pasajes permitidos. La validación local lo rechazó. No se corrigió ni aceptó esa referencia automáticamente, ni se continuó pagando las otras cinco paradas.
- Hy4 low: agotó los 8000 tokens, todos reportados como razonamiento, sin entregar un informe. Esa llamada costó 0.02497864 USD y tardó 131.948 s. Al usar none, las seis auditorías fueron válidas; la tabla principal muestra esa configuración.
- GLM: cinco primeras paradas válidas; Colón recibió HTTP 429 por saturación temporal de DeepInfra. Se reintentó solo esa parada y pasó. El error no informó coste y el control liberó su reserva; no se repitieron las cinco llamadas exitosas.
- Qwen: seis respuestas válidas con el esquema completo. La parada más lenta fue Cibeles; no requirió reparación ni llamadas remotas de auditoría.

## Costes de esta tanda

Coste adicional reportado: **0.166377297 USD**, incluidas las pruebas fallidas de Hy4 y la respuesta rechazada de Gemini. El primer error de Gemini dejó **0.196821 USD de exposición no verificada**, contabilizada conservadoramente por el control; no es una factura confirmada.

Incluyendo el canario y las pruebas anteriores: **0.884618835188 USD reportados**, más **0.3301206 USD de exposición no verificada**. El control conserva un total conservador de **1.214739435188 USD** frente al límite de 2 USD.

## Artefactos y cambios

Todos los resultados están bajo `backend/tmp/narrative-v8/`:

- `madrid-qwen-audit-20260906`
- `madrid-glm53-20260906` y `madrid-glm53-colon-retry-20260906`
- `madrid-hy4-20260906` (low), `madrid-hy4-none-20260906` (Plaza Mayor) y los cinco directorios `madrid-hy4-none-Q…-20260906`
- `madrid-gemini25pro-20260906` y `madrid-gemini25pro-simple-20260906`

El comando `backend/scripts/validation/narrative-codex-audit-replay-v8.ts` incorpora `--models=qwen-local`, `--stop-id=Q970525` para una sola parada y `--wire-schema=simple` para proveedores con limitaciones de esquema. Conserva el modo sin ejecución por defecto, presupuesto, directorios nuevos y validación completa. No se cambiaron perfiles de producción ni prompts de auditoría.

Se revisó el diff del trabajador, se comprobó compilación y selección local de una parada mediante ejecución sin red, y se verificaron las ejecuciones reales y la conservación de fuentes. La respuesta inválida de Gemini comprobó que la simplificación del transporte no permite aceptar citas ajenas al material.
