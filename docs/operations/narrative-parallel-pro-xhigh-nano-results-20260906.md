# Luna Pro, Luna xhigh y GPT-5.4 nano — 2026-09-06

## Alcance y resultado comparable

Se interpretó «mini nano» como `openai/gpt-5.4-nano`, disponible en el catálogo de OpenRouter. Es una prueba como **auditor**, no una sustitución del modelo preparador de evidencia ni un cambio en producción. Se usó low en las dos pruebas OpenRouter y xhigh (Extra high, no el nivel distinto max) en Codex.

| Configuración | Auditorías válidas | Tiempo acumulado | Gasto API de la ejecución comparable |
|---|---:|---:|---:|
| openai/gpt-5.6-luna-pro, OpenRouter low | 6/6; 225 frases | 184,869 s | 0,08834776 USD |
| openai/gpt-5.4-nano, OpenRouter low | 6/6; 225 frases | 111,728 s | 0,0303099 USD |
| gpt-5.6-luna, Codex xhigh | 2/6; 79 frases | 537,857 s incluyendo timeout | 0 USD; cuota Codex |

Luna xhigh completó Plaza Mayor y Palacio, pero superó el timeout configurado de 180 s al auditar Plaza de España. Se paró tras esa tercera llamada; las otras tres no se ejecutaron. No se reparó la respuesta, amplió el plazo ni reintentó. El fallo limita la evaluación de calidad; no demuestra incapacidad del modelo con otro plazo.

## Qué cambia en la valoración

### Luna Pro

Seis frases rechazadas en la ejecución comparable:

- **Plaza Mayor S007:** falso positivo al separar «la villa» de Madrid, aunque el contexto identifica la ciudad.
- **Palacio S013:** detecta falta de soporte específico para visibilidad exterior. Es el caso donde Astra admite una inferencia explícita y razonada.
- **Plaza de España S017:** detecta que los pasajes no identifican a Cervantes como escritor. La falta del calificativo tiene fundamento bajo el contrato sin memoria externa, aunque exigir además una formulación explícita del homenaje resulta demasiado literal.
- **Cibeles S032:** detecta que no se explicita la identidad Palacio de Comunicaciones = Palacio de Cibeles.
- **Alcalá S028:** detecta el calificativo «escritor» sin respaldo para Bretón de los Herreros.
- **Colón S019:** objeción excesivamente literal a «Allí se abrió el amplio espacio conocido como Jardines del Descubrimiento». El pasaje documenta el espacio abierto desde 1975 construido sobre el solar anterior; la frase no fija una fecha de inauguración, aunque el motivo del rechazo se centra en ella.

Pro aporta detecciones útiles adicionales frente a Astra, pero también dos rechazos injustificados según esta revisión. Es un candidato API serio, rápido y de bajo coste en esta muestra; no un reemplazo inequívocamente mejor.

### GPT-5.4 nano

Deja pasar tanto la visibilidad del Palacio como «escritor» en Alcalá. Rechaza otras tres frases, sin una objeción fundada tras revisar los pasajes:

- Cibeles S012: los pasajes sí permiten combinar conjunto escultórico y abastecimiento entre 1782 y 1895, más de cien años.
- Alcalá S007: «recibir ... con solemnidad» es síntesis prudente de entrada triunfal, comitivas y festividades documentadas.
- Alcalá S015: están documentadas las quejas durante la construcción y las de Sabatini por su lentitud; el texto no inventa un actor identificado nuevo.

No lo elegiría como auditor estricto por su combinación de omisiones y falsos positivos. Esto no evalúa su idoneidad como preparador u otras tareas.

### Luna xhigh

Corrige el falso rechazo villa/Madrid observado con Luna low. En Palacio detecta la cláusula de visibilidad, pero también rechaza S017, una imagen narrativa sobre el fuego que «encuentra ... una respuesta ... hecha arquitectura», interpretándola como causalidad histórica de diseño. Esta última es discutible; el texto no atribuye expresamente intención al arquitecto. El timeout impide saber cómo habría evaluado Alcalá, Cibeles y Colón. La primera parada reporta 6.732 tokens de razonamiento frente a 242 de la anterior ejecución low; no hay consumo completo fiable de la llamada interrumpida.

## Decisión

Mantendría **Astra low por Codex como preferencia práctica provisional** por el equilibrio observado. Pro merece considerarse si se prioriza velocidad y disponibilidad por API, pero sus detecciones extra no eliminan el coste de falsos positivos. Nano no supera el nivel buscado. Xhigh no demuestra una mejora global y no completa el recorrido con el plazo configurado.

No es un ranking general ni una medición estadística. GPT-5.4 no es verdad establecida, los detalles sin respaldo no son necesariamente históricamente falsos y Astra también fue el escritor del tour. Ningún resultado autoriza publicación automática.

## Reproducibilidad y paralelismo

El primer lanzamiento mediante llamadas simultáneas al worker quedó serializado. Se detectó y se lanzaron los procesos independientes de Nano y Codex mientras Pro seguía activo; se comprobó solapamiento real. Las llamadas que aún estaban en cola después rechazaron las salidas ya existentes en preflight, sin ejecutar modelos ni sobrescribir resultados.

La comprobación posterior descubrió un cambio ajeno en el generador de materiales: las primeras ejecuciones OpenRouter añadían `researchLanguage: es` y una instrucción sobre traducción. Sus textos y pasajes eran iguales, pero no el prompt exacto. Se conservaron como evidencia separada y se repitieron ambas en procesos paralelos con `--frozen-inputs`, mientras Codex continuaba. **La comparación principal de este informe usa sólo las repeticiones exactas y Codex.**

Se verificó igualdad profunda de los casos finales con el snapshot usado por Astra, y hashes originales sin cambios. Los resultados iniciales variaron: Nano aprobó todas las frases; Pro cuestionó «hoy» y el plural «canciones». No se atribuye esa variación exclusivamente a la instrucción adicional: no hay réplicas controladas para hacerlo.

Sólo se ampliaron los scripts experimentales `narrative-astra-audit-replay-v8.ts` (selección low/xhigh) y `narrative-codex-audit-replay-v8.ts` (entradas congeladas). Se revisaron los diffs de Qwen, corrigieron los defectos y validaron selección efectiva del modelo/esfuerzo, conservación de restricciones, rechazo de configuración inválida, carga TypeScript, dry-run y entradas finales. Se preservaron los cambios ajenos; no se modificó producción.

## Gasto y artefactos

Primeras ejecuciones: Pro 0,08938072 USD y Nano 0,0308497 USD. Repeticiones exactas: Pro 0,08834776 USD y Nano 0,0303099 USD. **Total nuevo: 0,23888808 USD.** Codex consumió cuota, sin gasto API adicional; el consumo de la llamada interrumpida no se convierte a dólares.

Acumulado conservador: **1,743584590828 USD / 2 USD**, incluida exposición anterior no confirmada de 0,3301206 USD. Reportado sin esa exposición: 1,413463990828 USD. Los presupuestos paralelos se repartieron: 0,24 USD por rama inicialmente y 0,16 USD por rama en la repetición, sin duplicar el presupuesto común disponible.

Artefactos bajo `backend/tmp/narrative-v8/`:

- Comparables: `madrid-luna-pro-frozen-20260906`, `madrid-nano54-frozen-20260906`, `madrid-luna-xhigh-audit-20260906`.
- Iniciales con instrucción adicional: `madrid-luna-pro-openrouter-20260906`, `madrid-nano54-openrouter-20260906`.

Cada directorio conserva entradas, resultados, gasto cuando corresponde y respuestas originales. El de Codex mantiene estado incomplete por el timeout.
