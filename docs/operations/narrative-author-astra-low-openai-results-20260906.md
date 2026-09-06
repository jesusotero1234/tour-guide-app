# Astra low — resultado de la prueba sin exigir ZDR

Fecha: 2026-09-06. Caso: La Malagueta, Málaga (Q523311). Es una narración de parada, no un canario de tour completo.

## Veredicto

**Esta vez Astra completó la narración a la primera.** Entregó 546 palabras con un objetivo aproximado de 562, sin reparaciones ni ajuste de longitud. Pasó las bandas de duración estimada existentes.

Mi valoración editorial: es una buena primera versión, suficientemente próxima a un guion utilizable para que no tenga sentido entrar en otra cadena de regeneraciones. No equivale a publicación certificada: conserva dos observaciones automáticas, explicadas abajo. Tampoco demuestra todavía fiabilidad entre ciudades o en un tour entero.

En esta muestra prefiero el equilibrio entre fidelidad y claridad de Astra al de Sol y Opus: evita la causalidad arquitectónica no acreditada del texto de Opus y la referencia explícita a «estos datos» del de Sol. Es una valoración de estas respuestas, no un ranking general de modelos. La voz de Astra sigue siendo algo explicativa; no diría que supera claramente la referencia de audioguía que aprobó el usuario.

## Qué se probó y qué cambió

- Modelo solicitado y devuelto: `openai/gpt-6-astra`; razonamiento solicitado: `low`.
- Servicio: OpenRouter; proveedor que atendió la petición: OpenAI, nivel `default`, snapshot `openai/gpt-6-astra-20260903`.
- Una llamada de escritor y una de auditor GPT-5.4 medium. Ninguna reparación, fallback ni repetición automática.
- Mismo prompt exacto, fuentes congeladas, referencia de voz y límite numérico de 5.000 tokens que los intentos previos de Astra.
- Excepción explícita y limitada al escritor experimental: `zdr:false`, `data_collection:allow`, `only:[openai]`; variantes Fast y Flex excluidas.
- El proveedor OpenAI anuncia `max_tokens`, mientras que Azure anuncia `max_completion_tokens`. Se mantuvo el número 5.000, adaptando el nombre del campo al proveedor.

Los intentos previos de Astra habían devuelto errores 502 de Azure con texto parcial. Este intento terminó correctamente en OpenAI. Eso permite afirmar que la ruta nueva funcionó en esta ocasión, **no que ZDR por sí mismo causara los errores**: cambiaron proveedor y parámetro de transporte.

OpenRouter documenta la [selección de proveedor y políticas por petición](https://openrouter.ai/docs/guides/routing/provider-selection), así como que los [niveles no estándar requieren activación explícita](https://openrouter.ai/docs/guides/features/service-tiers). No se cambiaron ajustes globales de privacidad, producción, RAG ni el modelo por defecto.

## Resultado medido

| Medida | Resultado |
|---|---:|
| Palabras | 546 frente a 562 objetivo |
| Desviación | −16 palabras, aproximadamente −2,85 % |
| Tiempo estimado a 120 palabras/minuto | 4 min 33 s; objetivo 4 min 41 s |
| Escritura | 16,46 s |
| Auditoría | 56,75 s |
| Ejecución completa, incluido preflight | 74,93 s |
| Coste del escritor | $0,080555 |
| Coste del auditor | $0,124760 |
| Total informado | $0,205315 |
| Llamadas de inferencia | 2 |
| Frases revisadas | 37 |
| Observaciones automáticas | 2 |

No es una medición TTS. No se modificaron bandas para aceptar este texto. El escritor informó 3.465 tokens de entrada y 745 de salida, con cero tokens de razonamiento reportados: consta que se pidió `low`, pero no cabe deducir una cantidad de razonamiento interno a partir de esa etiqueta.

La auditoría consumió aproximadamente el 61 % del coste y el 76 % del tiempo total. En este ensayo la generación ya no es un bucle de muchas llamadas; la mayor parte del tiempo está en la revisión.

## Las dos observaciones, sin esconderlas ni sobredimensionarlas

1. **«Estás junto a una plaza de toros...»** El auditor reclama evidencia sobre la posición del oyente. Sin embargo, el encargo del escritor dice expresamente que la persona está junto al edificio. Es contexto de reproducción, no un dato histórico que Wikipedia deba acreditar. Lo considero una objeción de contexto en este piloto, no una invención histórica. En producción, esa frase necesita que el modo de reproducción efectivamente sitúe al visitante allí; no sirve como garantía GPS en una escucha remota.
2. **«La plaza reabrió al público en 2019».** El extracto dice «abriendo al público en el año 2019». «Reabrió» sugiere un cierre previo que ese extracto no detalla. Es una precisión editorial menor: «abrió al público en 2019» se ajusta a la evidencia entregada. No exige regenerar 546 palabras ni declarar fallida toda la narración.

El artefacto conserva `review_required`: es el estado que este piloto guarda para los textos auditados y no significa que la ejecución se haya caído. La auditoría terminó con contrato válido; hubo dos hallazgos, no un fallo técnico.

Nota de trazabilidad: el valor interno `audit.value.auditor=deepseek_pro` es una etiqueta heredada del resultado de auditoría. Los eventos de esta ejecución registran el modelo solicitado y real `openai/gpt-5.4`; no se llamó a DeepSeek para revisarlo.

## Mi lectura del texto

Lo que funciona:

- Distingue 1939 de 1943 y mantiene que hubo detención, no alojamiento voluntario.
- No usa el aforo de 2010 para inventar cuántos prisioneros hubo en 1939.
- Explica el equipamiento taurino sin convertirlo en un motivo histórico inventado para escoger la plaza como campo.
- Describe las obras culturales como espacios preparados y un propósito; no promete actividad actual durante todo el año.
- Conecta fachada, cambios de uso y cierre sin inventar las paradas anteriores.

Lo que aún podría pulirse, sin bloquear por gusto:

- «No hace falta imaginar escenas ni situarlas en un rincón concreto» deja asomar la precaución editorial dentro de la voz del guía.
- «Conviene mantener juntas esas dos ideas» tiene un tono más de explicación que de conversación.
- El cierre es coherente, aunque algo abstracto. No hay que confundir fidelidad factual con una voz ya excepcional.

No he cambiado esas frases ni corregido el original a escondidas.

## Comparación limitada con las dos pruebas anteriores

Mismo encargo y auditor, una respuesta por escritor; modelos, esfuerzo de razonamiento y proveedores distintos. Los hallazgos automáticos no son una puntuación de calidad comparable sin leerlos.

| Escritor | Palabras | Escritura | Coste escritor | Total con auditor |
|---|---:|---:|---:|---:|
| Sol medium | 569 | 16,3 s | $0,056213 | $0,157748 |
| Opus 5 medium | 575 | 28,6 s | $0,077505 | $0,176003 |
| Astra low, OpenAI sin exigir ZDR | 546 | 16,5 s | $0,080555 | $0,205315 |

Astra costó unos 2,4 céntimos más que Sol como escritor y unos 0,3 céntimos más que Opus. En este caso no es una diferencia grande por una parada reutilizable, pero no autoriza extrapolar idéntico coste o calidad a un tour completo.

Mi recomendación es usar este texto para la valoración del usuario y conservar Astra como candidato. Si se continúa investigando, la prueba útil sería otro lugar con el mismo protocolo y contexto canónico compartido con el auditor, no gastar el resto en reintentar esta parada hasta conseguir cero observaciones. No he ejecutado esa prueba adicional.

## Gasto y cambios de código

Esta ejecución gastó $0,205315 informados por OpenRouter. Del último presupuesto adicional de $2 se han contabilizado $0,539065 entre Sol, Opus y este Astra; quedan **$1,460935**. Los dos fallos anteriores de Astra reportaron `usage.cost=0`. Se conservan las exposiciones históricas anteriores; no se reinició el presupuesto ni se liberaron importes desconocidos.

Se añadió únicamente una opción experimental desactivada por defecto, `--experimental-astra-openai-no-zdr`, al [piloto](../../backend/scripts/validation/narrative-plain-writer-pilot-v8.ts). Incluye el cálculo de reserva según los endpoints permitidos y la adaptación del límite de salida. [33 tests locales pasan](../../backend/src/services/poi/NarrativePlainWriterPilotV8.test.ts), incluidos la privacidad por defecto y el rechazo de la excepción para otros modelos.

## Evidencia reproducible

Directorio: `backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-openai-20260906-1/`.

- [Narración original](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-openai-20260906-1/narration.md)
- [Petición y preflight guardados](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-openai-20260906-1/inputs.private.json)
- [Respuesta completa del escritor](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-openai-20260906-1/writer-response.private.json)
- [Auditoría](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-openai-20260906-1/audit.private.json)
- [Resultados y presupuesto](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-openai-20260906-1/results.private.json)
- [Eventos](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-astra-low-openai-20260906-1/progress.private.jsonl)

SHA-256 del prompt: `023aece5b25e69a910119614a067b7890d9a2d849dd92bfb20e342bdea3547e0`. Se comprobó igualdad literal con el intento anterior de Astra y que el Markdown contiene exactamente la respuesta recibida. El original se reproduce a continuación, sin repararlo.

## Narración original de Astra

La fachada de ladrillo de La Malagueta tiene algo que contarnos antes de entrar en su historia: su aspecto original se recuperó en una restauración reciente. No se trataba de darle una cara nueva, sino de devolverle la que había tenido. Pero ¿qué recuperamos de un edificio cuando restauramos su exterior? Aquí, el ladrillo es solo el comienzo.

Estás junto a una plaza de toros de estilo clasicista cuyo contorno tiene dieciséis lados. Dentro, el ruedo mide cincuenta y dos metros de diámetro. No necesitas verlo para hacerte una idea de la diferencia: un círculo para el espectáculo, rodeado por un edificio que reúne mucho más que asientos.

Hay corrales, chiqueros, caballerizas, sala de toreros y enfermería. Son espacios que ayudan a entender cómo se organiza un recinto taurino: además del lugar destinado al público, hacen falta dependencias para los animales, para quienes participan y para la atención médica. Tras la reforma de 2010, la plaza tenía capacidad para algo más de nueve mil espectadores. Esa es su escala como lugar de reunión.

Sin embargo, no todas las personas que estuvieron aquí vinieron a presenciar un festejo. Para entender esa otra parte de La Malagueta hay que detenerse en dos episodios distintos.

El primero ocurrió en 1939, durante los últimos meses de la Guerra Civil. El campo de concentración de prisioneros de Málaga, situado en la fábrica y cuartel de La Aurora, estaba saturado. Los militares sublevados utilizaron entonces esta plaza también como campo de concentración. El recinto concebido para reunir espectadores pasó a albergar prisioneros.

La diferencia no está solo en la actividad que se desarrollaba dentro. Está en la condición de quienes lo ocupaban: no eran público, sino personas privadas de libertad. No hace falta imaginar escenas ni situarlas en un rincón concreto. Basta con reconocer ese cambio de uso para que la palabra «recinto» adquiera aquí otro significado.

El segundo episodio llegó en 1943, en plena Segunda Guerra Mundial. La Malagueta volvió a albergar detenidos. Esta vez eran refugiados extranjeros que habían huido de Francia. Conviene mantener juntas esas dos ideas: eran refugiados, pero su estancia en la plaza fue una detención, no una acogida voluntaria. Se trataba de otro contexto, de otra guerra, y de personas cuya huida había desembocado en un nuevo encierro.

La historia del edificio continuó. En 1976, coincidiendo con el centenario de su inauguración, fue declarado conjunto histórico-artístico; en 1981, bien de interés cultural. Y, décadas después, una intervención volvió a transformar sus espacios.

La restauración comenzó en 2017 y la plaza reabrió al público en 2019. Recuperó el ladrillo original y los elementos decorativos exteriores. También reorganizó el espacio para albergar nuevas zonas expositivas y salas de congresos, con el propósito de ampliar su uso cultural a todo el año, más allá de la temporada taurina. Una cosa era recuperar la fachada; otra, preparar el edificio para actividades diferentes.

Al terminar aquí nuestro recorrido, quédate con esa doble tarea: conservar y transformar. La fachada recuperada devuelve una parte del aspecto de La Malagueta, pero no resume todo lo que ocurrió dentro. Su historia incluye espectadores, prisioneros y espacios preparados para otros encuentros. El ladrillo puede volver a su apariencia original; entender el edificio exige, en cambio, no volver a mirarlo como si solo hubiera tenido una vida.

