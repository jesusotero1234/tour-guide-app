# Experimento: traducir un tour de Astra con DeepSeek — 10 septiembre 2026

DeepSeek es un candidato viable para traducir un guion existente a muy bajo coste, con revisión independiente. Esta prueba no demuestra que todas las traducciones mantengan automáticamente la calidad: el italiano alteró una cifra y las otras versiones tuvieron algunos detalles de redacción. No se cambió la generación de la aplicación.

## Qué se probó

Se reutilizó un guion español de Astra de Madrid: seis paradas y bienvenida, 3.709 palabras y 60 párrafos. Se tradujo a inglés, francés, alemán e italiano mediante cuatro llamadas, una por tour completo e idioma, directamente a https://api.deepseek.com con el modelo solicitado y devuelto deepseek-flash, pensamiento desactivado y temperatura 0. No se usó OpenRouter para DeepSeek.

El original pertenece a un experimento previo y su publicationPassed era false. Aquí se evalúa fidelidad al original, no se vuelven a certificar sus hechos históricos. Los problemas heredados del español no se cuentan como fallos de traducción.

El ensayo conserva los 60 identificadores de párrafo y las siete piezas, rechaza omisiones estructurales, cadenas vacías, texto JSON incrustado y saltos escapados. Estas comprobaciones no prueban por sí solas fidelidad semántica.

Sonnet 5 revisó cada versión completa frente al original, por OpenRouter. Se usó su versión publicada en el catálogo, anthropic/claude-sonnet-5-20260630. Cada respuesta válida cubre las siete piezas y las citas de sus objeciones se verifican contra los textos exactos. Se evitó consumir más Astra: la consulta de cuota, anterior a estas revisiones, marcaba 98 % semanal usado en la cuenta. No es una medida atribuible exclusivamente a este experimento.

## Resultado de la primera traducción

| Idioma | Palabras | Tiempo DeepSeek | Traducción, USD aprox. | Revisión válida Sonnet |
| --- | ---: | ---: | ---: | --- |
| Inglés | 3.779 | 21,47 s | 0,0043794 | Sin objeciones |
| Francés | 3.876 | 27,45 s | 0,00497496 | 2 detalles menores |
| Alemán | 3.678 | 32,45 s | 0,00513396 | 1 detalle menor, después de recuperar el formato |
| Italiano | 3.606 | 27,65 s | 0,00493896 | 2 cambios de significado y 5 detalles menores |

Las cuatro llamadas sumaron 109,03 segundos; se ejecutaron secuencialmente. No se midió concurrencia. La duración en audio no se deduce directamente del número de palabras entre idiomas.

Tres respuestas fueron válidas a la primera. El alemán contenía dos llaves sobrantes en su JSON. Se recuperó en un archivo separado mediante dos sustituciones exactas, sin nueva llamada, manteniendo idéntica la secuencia de todos los textos entre comillas. Se conservó la respuesta original fallida. Por tanto, la tasa de formato válido inicial fue 3/4, no 4/4.

Sonnet no marcó cambios de significado en inglés, francés ni alemán. Esto es evidencia de una revisión automática sobre un único tour, no una garantía de equivalencia ni una evaluación humana nativa.

Los errores concretos más relevantes:

- Italiano: «Tres mil cuatrocientas dieciocho habitaciones» se convirtió en «Tremilacinquecentodiciotto stanze»: 3.418 pasó a 3.518. El mismo error aparece dos veces. Es un único error numérico repetido, con dos ocurrencias graves.
- Italiano: «solar» se trasladó como «solarе», con una letra cirílica al final, en vez de «terreno» o «terreni». Sonnet señaló cinco ocurrencias; la comprobación adicional de caracteres encontró una sexta en la bienvenida. El revisor también puede omitir problemas.
- Francés: «les principaux guildes» necesita concordancia femenina; «jardins du Découvrement» requiere corregir el término.
- Alemán: «vor dem, das wir heute haben» resulta poco natural; el revisor propone explicitar «Tor».

Sonnet produjo diez observaciones: dos graves y ocho menores. La revisión posterior añadió una menor: once ocurrencias conocidas en total. Las traducciones guardadas conservan estos defectos para poder examinarlos; sólo se recuperó el formato alemán. No hay un resultado final corregido y aprobado.

## Coste y escala

| Concepto | Un tour a cuatro idiomas adicionales | 50 tours a cuatro idiomas adicionales |
| --- | ---: | ---: |
| Sólo traducción DeepSeek, fuera de peak | 0,01942728 USD | 0,971364 USD |
| Sólo traducción, supuesto peak al doble | 0,03885456 USD | 1,942728 USD |
| Traducción + una revisión Sonnet válida por idioma, fuera de peak | 0,22349528 USD | 11,174764 USD |

El escenario de cinco idiomas cuenta español como uno: 50 originales en español y 200 versiones traducidas. No son 250 traducciones.

Las cuatro revisiones válidas costaron 0,204068 USD y sumaron 47,30 segundos. Traducción más una revisión por idioma suman aproximadamente 2 min 36 s de llamadas secuenciales para las cuatro versiones. No incluye preparación, intervención, correcciones ni regeneración de audio.

El gasto registrado de todo el experimento fue 0,42521328 USD: cuatro llamadas DeepSeek y ocho Sonnet. Incluye 0,201718 USD de cuatro revisiones iniciales rechazadas por la validación de procedencia: tres no reconocían el alias fechado del modelo y una incluía una etapa de moderación del router. Se verificaron los alias contra el catálogo y se repitieron únicamente esas revisiones, una vez. Las cuatro repeticiones fueron válidas. No se repitió ninguna traducción.

Los importes DeepSeek se calculan con los tokens medidos y las tarifas del aviso compartido por el usuario: 0,003 / 0,15 / 0,60 USD por millón para entrada en caché / entrada sin caché / salida fuera de peak. Las llamadas se realizaron alrededor de las 13:32–13:34 UTC, fuera de los intervalos peak del aviso. No son una conciliación con la factura del proveedor. La consulta pública de [precios de DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/) devolvió versiones indexadas anteriores al lanzamiento y la apertura directa falló; no se presentan como confirmación independiente de la tarifa nueva.

Los importes Sonnet proceden del coste comunicado por la respuesta. El catálogo guardado confirma 2/10 USD por millón de entrada/salida para el proveedor seleccionado.

Estas proyecciones suponen tours de tamaño parecido, la misma mezcla de idiomas y caché, y una revisión por versión. No incluyen escribir/verificar los 50 originales con Astra, la preparación de las fuentes, correcciones, nuevas revisiones, impuestos ni audio. El coste efectivo puede variar; el ahorro de llamadas no permite inferir un porcentaje exacto de cuota de Codex.

## Cómo encaja con la aplicación

El flujo multilingüe actual reutiliza la ruta, geometría, investigación y arco narrativo del blueprint, y vuelve a escribir/auditar la narración en el idioma solicitado. Ese snapshot no contiene el guion final de otro idioma para traducir. Esto se verificó en MultilingualTourGenerator.ts:112, CodexTourProcess.ts:39 y TourBlueprint.ts:13.

La configuración actual de TourLanguage.ts admite español y francés; inglés, alemán e italiano fueron objetivos exclusivamente experimentales. Esta prueba no los habilita en la aplicación.

La estrategia que merece continuar es: preparar y aprobar un original con Astra una vez, traducir cada idioma con DeepSeek y revisar fidelidad/fluidez antes de generar audio. Las cifras escritas con letras también necesitan comprobación; comparar sólo dígitos no habría detectado el fallo italiano. El ahorro viene de evitar repetir la escritura de Astra para cada idioma, no de eliminar el control de calidad.

## Archivos y reproducción

- [Ensayo ejecutable y comprobación local](../../backend/scripts/validation/narrative-deepseek-translation-v8.cjs).
- [Manifest y huellas del original](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/manifest.private.json).
- Textos: [inglés](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/en.md), [francés](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/fr.md), [alemán recuperado](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/de.md), [italiano](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/it.md).
- [Recuperación alemana con sustituciones documentadas](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/de-recovered.private.json).
- [Revisión inglesa](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/en-audit-retry.private.json), [francesa](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/fr-audit-retry.private.json), [alemana](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/de-audit-retry.private.json), [italiana](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/it-audit-retry.private.json).
- [Gasto acumulado, incluidos intentos rechazados](../../backend/tmp/narrative-v8/deepseek-translation-20260910-1/review-spend-retry.private.json).

Desde la raíz, la comprobación sin llamadas pagadas es:

    node backend/scripts/validation/narrative-deepseek-translation-v8.cjs --self-test

Para un nuevo ensayo, desde backend, usar un directorio nuevo:

    node -r ts-node/register/transpile-only scripts/validation/narrative-deepseek-translation-v8.cjs --translate tmp/narrative-v8/NUEVO_DIRECTORIO
    node -r ts-node/register/transpile-only scripts/validation/narrative-deepseek-translation-v8.cjs --judge tmp/narrative-v8/NUEVO_DIRECTORIO

La traducción requiere DEEPSEEK_API_KEY y la revisión OPENROUTER_API_KEY. Límite del ensayo: 1 USD. Una segunda ejecución de --judge permite como máximo un nuevo intento de las revisiones inválidas; no regenera traducciones ni acepta automáticamente texto mal formado.
