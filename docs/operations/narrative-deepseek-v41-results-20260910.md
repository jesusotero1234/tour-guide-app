# Resultado: DeepSeek V4.1 Flash en el tour de Madrid — 10/9/2026

**Decisión: candidato para una prueba completa de preparación en lugar de GPT-5.4 Mini, usando razonamiento desactivado. Mantener Astra para redacción y auditoría.** Esta muestra no aprueba una sustitución en producción.

## Versión y ejecución

El [anuncio oficial del 10/9](https://api-docs.deepseek.com/updates/) y la [tabla oficial de modelos y precios](https://api-docs.deepseek.com/quick_start/pricing/) identifican `deepseek-flash` como DeepSeek V4.1 Flash. A las 07:25:27 UTC, el catálogo autenticado directo devolvió `deepseek-flash` y `deepseek-v4-pro`. Se utilizó el primero; la documentación aplaza el cambio del alias Pro al 14/9 a las 04:00 UTC.

Todas las inferencias DeepSeek fueron contra `https://api.deepseek.com/chat/completions`, con comprobación de `model=deepseek-flash` en cada respuesta. **Cero llamadas nuevas a OpenRouter.** Mini es la referencia guardada del 6/9; Astra se ejecutó mediante Codex con cuota ChatGPT. La confirmación externa está en `backend/tmp/narrative-v8/deepseek-v41-20260910-release.json`; el indicador automático `releaseVersionVerified=false` no pretende sustituir esa comprobación documental.

Se completaron 34 llamadas válidas DeepSeek: diez de preparación con razonamiento bajo, diez sin razonamiento, seis de redacción, seis de auditoría de textos Astra y dos de auditoría de textos DeepSeek con objeciones reales. Hubo además un HTTP 400 y una respuesta truncada al configurar la prueba. Se hicieron doce auditorías Astra nuevas; las dos pruebas adicionales reutilizan auditorías ya terminadas sobre entradas idénticas comprobadas.

## Preparación frente a Mini

Mismos prompts y entradas comprobados por huella. Tiempos sumados de las llamadas, incluyendo la lectura completa de la respuesta; dólares estimados con consumo declarado. Mini es histórico y el transporte y las condiciones de carga/caché difieren, por lo que estos porcentajes describen esta muestra.

| Fase | Mini: segundos / USD | DeepSeek low: segundos / USD | DeepSeek sin razonamiento: segundos / USD |
| --- | ---: | ---: | ---: |
| Núcleo, 3 permutaciones | 26,856 / 0,035037 | 104,275 / 0,032316 | 30,791 / 0,012770 |
| Curación, 6 paradas | 47,185 / 0,033691 | 127,881 / 0,051875 | 37,265 / 0,024992 |
| **9 llamadas comparables** | **74,041 / 0,068728** | **232,156 / 0,084190** | **68,056 / 0,037763** |
| Arco, 1 llamada | Sin primera respuesta Mini comparable | 24,017 / 0,009655 | 12,840 / 0,006845 |

Sin razonamiento: **45,1 % menos coste y 8,1 % menos tiempo** en las nueve llamadas comparables. La mejora temporal procede de la curación; el núcleo fue algo más lento que Mini. Low resulta más lento y más caro en el conjunto comparable, sin una mejora de cobertura que justifique elegirlo aquí.

| Control de preparación | Mini | DeepSeek low | DeepSeek sin razonamiento |
| --- | ---: | ---: | ---: |
| Proposiciones del curador admitidas / generadas | 71 / 72 | 71 / 74 | 74 / 75 |
| Paradas con evidencia mínima | 6 / 6 | 6 / 6 | 6 / 6 |
| Paradas con cobertura `writerReady` | 2 / 6 | 5 / 6 | 5 / 6 |
| Núcleo: lugares comunes a las 3 permutaciones / unión | 3 / 8 | 4 / 5 | 4 / 6 |

Las tres configuraciones conservan Plaza Mayor, Palacio Real y Puerta de Alcalá entre sus lugares obligatorios en las tres permutaciones. DeepSeek fue más estable en esta muestra, pero no hay una selección ideal etiquetada que demuestre que sus lugares adicionales sean mejores.

La cobertura es una señal mecánica, no una certificación factual ni literaria. Al revisar las proposiciones de contraste, la variante sin razonamiento a veces asigna ese papel a un simple cambio de nombre o al reaprovechamiento de cimientos. No se ha hecho una auditoría semántica exhaustiva de todas las proposiciones ni ejecutado los bucles completos de reparación. Queda justificada una prueba completa de preparación en otra ciudad, conservando Astra y las validaciones actuales.

## Redacción frente a Astra

DeepSeek low recibió los encargos originales completos de las seis paradas, con las mismas fuentes y el historial de estilo congelado. Los textos guardados Astra low sirven de referencia. Se auditó cada texto nuevo con Astra low independiente.

| Parada | Objetivo de palabras | Astra guardado | DeepSeek | Objeciones de Astra al texto DeepSeek |
| --- | ---: | ---: | ---: | ---: |
| Plaza Mayor | 600 | 587 | 594 | 4 |
| Palacio Real | 600 | 599 | 608 | 1 |
| Plaza de España | 566 | 566 | 581 | 1 |
| Cibeles | 566 | 564 | 527 | 0 |
| Puerta de Alcalá | 600 | 602 | 722 | 2 |
| Plaza de Colón | 566 | 573 | 677 | 1 |
| **Total** | **3498** | **3491** | **3709** | **9** |

Las seis redacciones DeepSeek costaron **0,043399 USD** y sumaron **148,067 segundos**. Los registros originales de Astra (`codex-author/1..6/result.private.json`, `elapsedMs`) suman **208,257 segundos**: DeepSeek necesitó un 28,9 % menos tiempo en estas ejecuciones. Es una comparación histórica de API directa frente a Codex CLI, no una medida de velocidad intrínseca ni del tour completo. No se calcula ahorro monetario frente a la cuota ChatGPT. La fase DeepSeek más sus seis auditorías Astra tardó 625,511 segundos de reloj.

Hay **nueve objeciones en cinco textos**: seis afirmaciones sin soporte suficiente, dos distorsiones y una cronología incierta. Las objeciones no equivalen automáticamente a nueve falsedades, pero incluyen problemas concretos:

- **Plaza Mayor, S035:** «la Plaza Mayor no siempre estuvo aquí». El pasaje `p-43b252144e6911418bad` sitúa el mercado originario «en este sitio». Cambia su posición respecto de la ciudad, no su emplazamiento. Es una contradicción comprobable en el material entregado.
- **Plaza Mayor, S016:** reproduce una cronología defectuosa del material: un encargo en 1560 después de un traslado de la corte fechado en 1561. Astra había evitado esa fecha en su redacción guardada.
- **Palacio Real, S030:** contrapone representación del poder y vida cotidiana de la corte de forma absoluta, pese a que el material documenta estancias de la familia real y personal de servicio.
- **Plaza de España, S006:** ordena cronológicamente dos nombres cuando el pasaje solo enumera ambos.

En extensión, cinco paradas cumplen la tolerancia individual; Puerta de Alcalá excede el 20 % con 722 palabras para un objetivo de 600. El total excede el objetivo un 6,0 % y pasa la tolerancia agregada. Recalculado con las seis paradas y el evaluador existente: `localPassed=false`, `aggregatePassed=true`, `passed=false`. Se corrigió la etiqueta del informe por parada para usar `localPassed`: Colón cumple su tolerancia individual, aunque al evaluarla sola incumpla la tolerancia agregada más estricta. Los resultados JSON originales se conservan.

**Mantener Astra como redactor.** No se ha evaluado el audio, otras lenguas ni una segunda ronda de redacción sin razonamiento; el resultado solo permite juzgar esta configuración low.

## Auditoría: coincidencia y fallos que importan

Sobre los seis textos originales Astra, se contrastaron 225 frases con auditorías nuevas de ambos modelos sobre entradas idénticas. Hay 24 diferencias de etiqueta, pero 22 son entre `supported` y `authorized_inference`, que aceptan la frase en ambos casos. Solo dos diferencias cambian aceptación por objeción. DeepSeek señala una frase; Astra, tres.

Las dos diferencias restantes requieren interpretación: Astra objeta llamar escritor a Cervantes porque los pasajes entregados no explicitan su profesión; esto no demuestra una falsedad histórica. También objeta atribuir un cambio de función al Palacio de Cibeles cuando el pasaje solo acredita su uso municipal desde 2007. Ninguno de los auditores se trata como verdad absoluta.

Para comprobar detección de errores, se añadieron los textos nuevos de Plaza Mayor y Palacio Real: 78 frases, con las mismas fuentes y las auditorías Astra independientes ya guardadas. DeepSeek aceptó cuatro de las cinco objeciones de Astra y coincidió en señalar la cronología incierta de Plaza Mayor.

| Frase del texto DeepSeek | Astra | DeepSeek auditor |
| --- | --- | --- |
| Plaza Mayor S008: «la plaza más conocida de Madrid» | Sin soporte para el superlativo | Acepta como retórica |
| Plaza Mayor S010: «La plaza nació abierta» | Configuración física no documentada | Acepta como retórica |
| Plaza Mayor S035: «no siempre estuvo aquí» | Contradice la ubicación documentada | Acepta como cierre reflexivo |
| Palacio Real S030: representación del poder, «no la vida cotidiana» | Distorsiona el uso documentado | Acepta como síntesis |

El tercer caso es decisivo: DeepSeek justifica la segunda parte de la frase («no siempre así») y deja pasar la afirmación de ubicación. **No sustituir al auditor Astra.** Cuatro objeciones omitidas en dos textos seleccionados no son una tasa general de errores, pero basta la contradicción confirmada para rechazar esta sustitución con la configuración probada.

## Coste total y trazabilidad

| Ejecución | USD estimados por consumo | Exposición adicional sin consumo confirmado |
| --- | ---: | ---: |
| Primer intento, HTTP 400 | 0 | 0,013389900 |
| Segundo intento, truncado | 0,008700300 | 0 |
| Preparación low | 0,093845208 | 0 |
| Preparación sin razonamiento | 0,044607288 | 0 |
| Redacción low | 0,043398600 | 0 |
| Auditoría de textos Astra | 0,052428060 | 0 |
| Auditoría de los dos textos con objeciones | 0,015753324 | 0 |
| **Total** | **0,258732780** | **0,013389900** |

Total conservador: **0,272122680 USD**, más cuota ChatGPT para las doce auditorías Astra. No es una factura. Todas las inferencias se realizaron en horario punta y se estimaron con hit/miss/output por millón = 0,006/0,3/1,2 USD. Los tokens de razonamiento ya forman parte de la salida facturada. Se suman los costes de cada ejecución una sola vez; sumar sus saldos acumulados duplicaría gasto, y el saldo final de la auditoría por sí solo omitiría las fases concurrentes.

Artefactos privados locales bajo `backend/tmp/narrative-v8/`, con prefijo `deepseek-v41-20260910-`:

- `direct-low` y `direct-low-fixed`: fallos iniciales, preservados.
- `preparation-low-16k` y `preparation-none`: preparación completa en ambas configuraciones.
- `writer-low-16k`: textos comparados, uso y auditorías Astra.
- `auditor-low-16k`: auditorías de las seis redacciones Astra originales.
- `auditor-challenge`: dos casos adicionales; el archivo hermano `auditor-challenge.cjs` conserva la reproducción y comprueba igualdad con las entradas auditadas.

Cada carpeta conserva entradas, peticiones/respuestas, `results.private.json` y `comparison.md`. Los cinco experimentos completos acabaron en `complete_needs_review` y verificaron las huellas de sus fuentes al terminar. Las referencias están en `codex-Q2807-20260906-115441` y `mini-nano-preparation-fixed-20260906`. Estos artefactos no se distribuyen con un checkout nuevo.

El ejecutor se ajustó a una restricción documentada de DeepSeek: [no admite selección forzada de función con razonamiento activado](https://api-docs.deepseek.com/api/create-chat-completion/). Se usa selección automática, conservando la exigencia de una única función esperada y el esquema completo. El primer núcleo consumió sus 6000 tokens en razonamiento y se truncó; los experimentos low completos usan 16000. También se conserva el cuerpo de errores HTTP y se mide la latencia hasta recibir el cuerpo completo. Las **cuatro pruebas locales pasan** tras los ajustes.

El producto conserva sus modelos. No hubo publicación, migración, cambios de credenciales ni aprobación automática. La [guía de ejecución](narrative-deepseek-v41-test-20260910.md) queda disponible para repetir una fase con nuevas carpetas y presupuesto explícito.
