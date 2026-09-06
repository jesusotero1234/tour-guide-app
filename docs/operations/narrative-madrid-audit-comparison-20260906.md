# Madrid: costes del canario y comparación de auditores

Fuente: `backend/tmp/narrative-v8/codex-Q2807-20260906-115441`.

## Canario original

| Modelo | Función | Llamadas | Coste reportado USD | Latencia acumulada |
|---|---|---:|---:|---:|
| GPT-5.4 | Auditor B | 6 | 0.5783375 | 256.447 s |
| GPT-5.4-mini | Auditoría base, curator, architect | 12 | 0.1349265 | 102.857 s |
| Qwen local | Planner | 1 | 0 | 7.416 s |
| Astra low mediante Codex | Escritura | 6 | Cuota ChatGPT; sin importe USD en este registro | No agregada aquí |

Total API reportado: **0.713264 USD**. GPT-5.4 representa el 81.1%. El canario completo duró 11 min 9 s; las latencias acumuladas por modelo no equivalen al tiempo total porque hay concurrencia y fases adicionales.

GPT-5.4-mini: auditoría base 0.035037 USD, curator 0.08409 USD, architect 0.0157995 USD.

El modo Codex termina siempre en `complete_needs_review` tras completar las paradas y fija `publicationPassed=false`. No es un rechazo de calidad emitido por GPT-5.4. La evaluación global no se ejecutó.

El texto tiene 3491 palabras, unos 29.1 minutos de voz estimada para un recorrido solicitado de 120 minutos. El ajuste narrativo y el control de duración de ruta pasan; TTS no se ha medido.

Valoración editorial: aperturas concretas y un hilo útil sobre transformación de usos. Repite instrucciones al oyente («imagina», «quédate», «piensa») y algunas cautelas editoriales que restan naturalidad. El final de Colón cierra esa parada, pero podría recuperar mejor el conjunto del recorrido. Cinco de seis paradas dependen de Wikipedia como única fuente capturada.

GPT-5.4 encontró dos afirmaciones sin respaldo suficiente en los pasajes: la visibilidad exterior de las bóvedas del Palacio Real y la profesión de Bretón de los Herreros. Eso no demuestra que sean históricamente falsas.

## Pruebas realizadas

Se reutilizaron los textos, IDs de frases, evidencia, contexto, prompt y esquema del canario. Los hashes del checkpoint y del resultado original se verificaron sin cambios. GPT-5.4 es una referencia comparativa, no verdad establecida.

1. DeepSeek V4 Flash 0731 con razonamiento medium: una respuesta rechazada por el identificador fechado del endpoint. Coste 0.00091598346 USD. Se corrigió la compatibilidad consultando los alias del catálogo de endpoints.
2. Gemini 3.8 Flash con medium: HTTP 400 `INVALID_ARGUMENT`; sin resultado evaluable.
3. DeepSeek V4 Flash 0731 con low: tres auditorías válidas; la cuarta, Cibeles, truncada al agotar 8000 tokens (7375 de razonamiento). Coste de las cuatro llamadas: 0.004061554728 USD; latencia 129.466 s. Las últimas dos paradas no se ejecutaron porque el comando se detiene al primer fallo.
4. Gemini 3.8 Flash con low: HTTP 400 `INVALID_ARGUMENT`; sin resultado evaluable. La causa exacta del argumento incompatible sigue sin aislarse.

DeepSeek coincidió en todas las clasificaciones de Plaza Mayor. En Palacio Real aceptó la frase sobre visibilidad que GPT-5.4 cuestionó, justificando únicamente las bóvedas sin madera. En Plaza de España marcó como `unclear` el enlace hacia Cibeles, pese a que el contexto canónico lo autoriza. El resto de diferencias observadas fueron entre dos categorías aceptables: `supported` y `authorized_inference`.

Conclusión: DeepSeek ofrece un ahorro considerable, pero esta prueba no valida una sustitución directa. Hay que resolver el límite de razonamiento y comprobar las afirmaciones mixtas y las transiciones autorizadas. Gemini queda sin conclusión de calidad por incompatibilidad de solicitud. Esta comparación es parcial y cambia el razonamiento de medium en la referencia a low en la prueba principal.

Coste adicional reportado de estas pruebas: **0.004977538188 USD**. Los errores de Gemini no informaron coste; el control de presupuesto contabilizó conservadoramente **0.1332996 USD de exposición no verificada**, que no debe confundirse con gasto facturado. Total reportado, incluido el original: **0.718241538188 USD**.

## Comando configurable

Desde el directorio backend, con Node 22:

```bash
node -r ts-node/register scripts/validation/narrative-codex-audit-replay-v8.ts \
  --source=tmp/narrative-v8/codex-Q2807-20260906-115441 \
  --out-dir=tmp/narrative-v8/madrid-audit-new-run \
  --models=deepseek/deepseek-v4-flash-0731,google/gemini-3.8-flash \
  --reasoning=low \
  --prior-spend-usd=0.851541138188 --spend-limit-usd=2
```

Por defecto solo valida y muestra el plan. Añadir `--execute` hace las llamadas. Cada ejecución necesita un directorio nuevo y un gasto previo actualizado. `--models` permite cambiar los identificadores. Un fallo conserva resultados parciales y detiene las siguientes llamadas. No regenera el tour.

Validación: compilación mediante ts-node, ejecución local sin red, rechazo de presupuesto inválido y directorio existente, llamadas reales con resultados persistidos y verificación de hashes del origen.
