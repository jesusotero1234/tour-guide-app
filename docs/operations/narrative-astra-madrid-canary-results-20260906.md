# Madrid — canario narrativo Astra low

Fecha: 2026-09-06. Run: `madrid-author-astra-low-20260906-1`.

## Resultado ejecutivo

**Se generaron y auditaron las siete narraciones en una sola pasada por parada.** No hubo errores de ejecución, respuestas truncadas, reintentos, reparaciones ni llamadas de ajuste de longitud.

- 14 llamadas de inferencia: 7 escrituras Astra low + 7 auditorías GPT-5.4 medium.
- 4.082 palabras frente a 4.086 objetivo: diferencia total de −4 palabras, aproximadamente −0,10 %.
- Las siete paradas y el conjunto pasan las bandas de entrega existentes; no se modificó ningún umbral.
- Tiempo completo del comando: 382,806 segundos, unos **6 min 23 s**.
- Coste informado por OpenRouter: **$1,211085**.
- 267 frases revisadas; 3 observaciones automáticas repartidas entre 3 paradas.
- Quedan **$1,788915** del techo de $3 de esta prueba.

[Leer el tour original completo](../../backend/tmp/narrative-author-route-canary-v8/madrid-author-astra-low-20260906-1/tour.md).

Esto valida una primera pasada narrativa sobre material guardado. **No es una publicación automática, una medición TTS, una nueva investigación ni un canario de infraestructura de extremo a extremo.**

## Qué hemos probado realmente

Se reutilizó el checkpoint `madrid-v8-staged-20260905-015959`, su ruta, orden, fuentes y objetivos. La petición original es de 120 minutos, incluyendo desplazamientos, observación y pausas. El texto nuevo equivale a aproximadamente **34 min 1 s de voz a 120 palabras/minuto**, frente a 34 min 3 s objetivo. No significa 120 minutos de audio ni demuestra que una persona real complete el paseo en ese tiempo.

El escritor recibió criterios de autor, pasajes originales, situación de escucha y continuidad de la ruta en texto legible. No recibió los planes de párrafos ni tuvo que producir un JSON narrativo. El auditor recibió las mismas identidades y condición de reproducción presencial exterior; esa condición no autoriza acceso a interiores, giros, distancias ni orientación exacta.

La referencia de Plaza Mayor se omitió para escribir la propia Plaza Mayor. En las otras seis paradas se utilizó solo como ejemplo de voz. También se compartieron las primeras y últimas 25 palabras de narraciones anteriores para reducir repeticiones; ese historial se identificó expresamente como estilo, no como evidencia.

En las siete respuestas se verificó el modelo real `openai/gpt-6-astra`, proveedor OpenAI a través de OpenRouter, nivel `default`, razonamiento solicitado `low` y finalización `stop`. La excepción de no-ZDR quedó limitada al escritor experimental. Producción, RAG y modelos por defecto no cambiaron.

## Resultados por parada

| Parada | Objetivo | Palabras | Observaciones | Escritura + auditoría |
|---|---:|---:|---:|---:|
| Plaza Mayor de Madrid | 600 | 609 | 0 | $0.1777 |
| plaza de Oriente | 562 | 556 | 0 | $0.1648 |
| Palacio Real de Madrid | 600 | 603 | 0 | $0.1731 |
| catedral de la Almudena | 600 | 597 | 1 | $0.1805 |
| plaza de España | 562 | 555 | 1 | $0.1650 |
| plaza de Colón | 562 | 556 | 1 | $0.1657 |
| Puerta de Alcalá | 600 | 606 | 0 | $0.1844 |

Todas las auditorías terminaron con contrato válido. El estado `review_required` de las narraciones significa que se conserva la revisión editorial, no que el programa haya fallado. No debe confundirse «ejecución completa» con «cero asuntos pendientes».

## Las tres observaciones

Son precisiones de significado, no incumplimientos de una cuota de palabras. No he modificado los originales ni he vuelto a consultar al escritor.

### Almudena: comparación de dimensiones

Original: «Conserva la dedicación, pero pertenece a otro momento y a un proyecto de dimensiones muy distintas: 102 metros de longitud y 73 de altura máxima».

La fuente da las medidas de la catedral actual, pero no las del templo anterior. La comparación no queda acreditada con estos extractos. Coincido con la objeción.

Propuesta de edición mínima, **no aplicada**: «Conserva la dedicación, pero pertenece a otro momento: el edificio mide 102 metros de longitud y 73 de altura máxima».

### Plaza de España: orden de nombres

Original: «Durante un tiempo fue el Prado de Leganitos y, más adelante, la plaza de San Marcial».

Los extractos permiten contar ambos nombres, pero no precisan esa secuencia con suficiente claridad. No sabemos por esta prueba que la secuencia sea falsa; no está demostrada en el corpus entregado.

Propuesta, **no aplicada**: «También fue conocida como Prado de Leganitos y plaza de San Marcial».

### Plaza de Colón: pluralidad de espacios subterráneos

Original: «La segunda incluye espacios culturales subterráneos».

El material acredita explícitamente un espacio cultural subterráneo: el del Pasaje de Colón. No acredita la pluralidad de la frase. Es una corrección pequeña y concreta, no motivo para regenerar la narración.

Propuesta, **no aplicada**: «La segunda incluye un espacio cultural subterráneo».

## Mi lectura editorial

**Este resultado sí merece continuar.** El problema de esta ejecución ya no es conseguir que salga un texto completo o que tenga aproximadamente la extensión pedida. Obtuvimos siete primeras versiones completas, de longitud adecuada y con historias reconocibles:

- Plaza Mayor usa los balcones para relacionar mercado, actos públicos, castigo y reconstrucción.
- Oriente contrapone la estatua del XVII, el soporte del XIX y las transformaciones posteriores del espacio.
- Palacio Real explica la diferencia entre residencia oficial y domicilio habitual, y desarrolla el contraste entre un edificio enorme y la falta de espacio expositivo.
- Plaza de España aprovecha un detalle humano concreto: jardines convertidos en posiciones militares y terreno de cultivo.
- Puerta de Alcalá concluye con el cambio de un antiguo límite de la ciudad a un monumento integrado en ella.

Astra omitió la fecha internamente contradictoria de uno de los pasajes de Plaza Mayor, sin que se le dictara una fecha alternativa. Tampoco convirtió el proyecto no construido del Palacio de las Artes en un edificio real.

La voz es clara y apropiada para escuchar, aunque todavía algo explicativa. Hay giros que se repiten: «no hace falta», invitaciones a imaginar y cierres que vuelven al detalle inicial. El historial de estilo no eliminó del todo esa tendencia. Yo variaría algunos cierres en una edición de conjunto, sin convertir una preferencia de voz en un bloqueo técnico.

También revisaría una formulación del Palacio Real que el auditor aprobó: «la distancia entre empezar una casa y poder habitarla». El material permite medir hasta la instalación del primer monarca, no demostrar desde qué día el edificio fue habitable. Es mejor describir el hecho documentado que sugerir una imposibilidad anterior.

**No considero necesario cambiar otra vez de modelo ni rediseñar el sistema por estas observaciones.** Haría una edición breve y trazable de esta versión y la leería o escucharía completa con el usuario. Antes de adoptar el enfoque en producción, conviene comprobar otra ciudad con material más pobre. Una ejecución de Madrid no acredita fiabilidad universal ni convierte fuentes imperfectas en verdad histórica certificada.

## Coste y tiempo: dónde se fueron

| Parte | Coste | Tiempo de llamadas |
|---|---:|---:|
| Escritura Astra low | $0,561935 | 117,740 s |
| Auditoría GPT-5.4 medium | $0,649150 | 250,760 s |
| Total de inferencia | $1,211085 | 368,500 s |

El resto hasta los 382,806 s del comando corresponde al arranque, preflights, coordinación y archivos. Aproximadamente el 54 % del gasto y el 66 % del tiempo completo estuvieron en la auditoría.

No hemos medido aquí cuánto costaría rehacer la búsqueda, la selección de ruta, las capturas o el RAG. No sería correcto comparar este total con un canario anterior de investigación completa como si fueran el mismo trabajo.

## Implementación y validación

Se añadió un adaptador de material y un coordinador experimental que reutiliza el cliente y el control de gasto del piloto existente. No se integró este protocolo en la ruta de producción.

- [Plan aprobado para esta ejecución](narrative-astra-route-canary-plan-20260906.md).
- [Adaptador genérico](../../backend/scripts/validation/narrative-author-canary-material-v8.ts).
- [Coordinador del canario](../../backend/scripts/validation/narrative-author-route-canary-v8.ts).
- [Tests del material](../../backend/src/services/poi/NarrativeAuthorCanaryMaterialV8.test.ts).
- [Tests del coordinador](../../backend/src/services/poi/NarrativeAuthorRouteCanaryV8.test.ts).
- 48 tests pasan, contando los 33 existentes del piloto. Los fixtures nuevos no contienen reglas ni datos particulares de Madrid.
- Dry-run sin escrituras ni red validado antes de gastar.
- Verificado que el checkpoint original conserva su SHA-256: `797256ef18c195b031eb86c91d7f386f54b4ec031d4df06391aa0a2b00dc0a84`.
- Verificado que cada Markdown reproduce exactamente la respuesta original y que cada parada tiene solo una llamada de escritor y una de auditor.
- No hay reservas pendientes ni gasto nuevo sin verificar. Se mantuvieron las exposiciones históricas anteriores dentro del gasto inicial.

Qwen se utilizó para investigación local. Su generación semántica quedó bloqueada por el protocolo de ampliación de contexto; Codex asumió los archivos acotados y los materializó mediante la operación determinista, con revisión de diff y validación local. Ese trabajo no consumió el presupuesto OpenRouter del canario.

## Artefactos

- [Tour original](../../backend/tmp/narrative-author-route-canary-v8/madrid-author-astra-low-20260906-1/tour.md).
- [Revisión completa, hallazgos y métricas](../../backend/tmp/narrative-author-route-canary-v8/madrid-author-astra-low-20260906-1/review.private.json).
- [Presupuesto final](../../backend/tmp/narrative-author-route-canary-v8/madrid-author-astra-low-20260906-1/budget.private.json).
- [Ruta, objetivos y procedencia](../../backend/tmp/narrative-author-route-canary-v8/madrid-author-astra-low-20260906-1/inputs.private.json).

Cada subdirectorio numerado del canario conserva el prompt y los inputs preparados. Las siete carpetas `backend/tmp/narrative-plain-writer-pilot-v8/madrid-author-astra-low-20260906-1-1` hasta `-7` conservan las respuestas, auditorías y eventos completos.

