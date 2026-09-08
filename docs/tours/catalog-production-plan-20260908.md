# Producción del catálogo: decisiones y presupuesto

Fecha: 2026-09-08. Estado: propuesta de producción; pilotos de voz realizados.
No se ha iniciado la generación masiva ni cambiado el proveedor de textos.

## Alcance acordado

- 50 ciudades, una ruta por ciudad en español, inglés, francés, alemán e italiano: 250 versiones. Madrid es el piloto elegido.
- Un único programa reutilizable recibe la ciudad o el catálogo y genera sus cinco versiones. Las ciudades son datos, no 50 copias del programa.
- El trabajo se reparte entre varios días y las ciudades se procesan de una en una.
- Cuando Jesús pida parar, debe terminar **la ciudad actual en sus cinco idiomas**, con sus textos, audios y comprobaciones, antes de detenerse. No se empieza otra ciudad.
- Un corte de luz es distinto de esa parada voluntaria: al volver, se deben recuperar los bloques completos y válidos y regenerar únicamente lo pendiente o interrumpido. Un error persistente debe dejar la ciudad incompleta y explicar el bloqueo; nunca declararla terminada ni reintentar indefinidamente.

El programa de catálogo con este comportamiento todavía no está implementado. Se reutilizarán la generación de textos y el renderizador existentes, incorporando sólo el control de progreso necesario. No hacen falta Kubernetes ni una GPU alquilada para este piloto local.

## Voces

Las referencias deben ser independientes y estar habladas en el idioma de destino. La referencia española usada inicialmente para todos los idiomas produjo el acento que Jesús rechazó.

- Español: preset existente `guide-es-a`.
- Francés: variante A elegida por Jesús, conservada como `guide-fr-a`.
- Inglés, alemán e italiano: muestras aprobadas conservadas como `guide-en-a`, `guide-de-a` y `guide-it-a`.
- Inglés británico: candidato nuevo, pendiente de elección auditiva; no sustituye todavía al inglés aprobado.

Los presets permanentes están en `pods/voxcpm-pod/presets/`. Cada uno conserva su audio de referencia, transcripción y parámetros. El candidato británico está en `backend/tmp/audio-pilot-british-english-20260908/`: usa una referencia sintética creada con instrucciones explícitas de acento británico, no una grabación española. La muestra de Plaza Mayor dura 80,418 segundos. Se verificaron el archivo, su referencia, la identidad del texto respecto al inglés anterior y el idioma mediante transcripción automática; esa comprobación no certifica el acento.

## Bienvenida, recorrido y recuperación

Comprobado en `backend/src/services/TourAudioService.ts`: el primer audio concatena el aviso de voz sintética, `tour.introduction` y la primera parada. Las siguientes paradas no reciben de nuevo la introducción. La prueba específica de bienvenida pasa. No hay una pista independiente de despedida: el cierre narrado debe estar en el texto de la última parada.

Pendientes antes de producir el catálogo:

1. Elegir automáticamente el preset según el idioma. Actualmente se resuelve un preset global y el valor por defecto sigue siendo español. El servicio y `render-tour.py` sólo admiten español y francés; guardar cinco voces no habilita por sí solo los cinco idiomas.
2. Verificar que la bienvenida editorial auditada llega al campo `tour.introduction` del tour importado. El proceso V8 genera una bienvenida, pero esta revisión no demostró su conexión completa con la publicación. Revisar también que el texto de la primera parada no repita otro saludo.
3. Reanudar por bloque terminado, comprobando texto, idioma, modelo, voz y archivo. El renderizador guarda MP3 por parada, pero hoy rechaza una salida existente y no recupera automáticamente una ejecución parcial. El servicio registra los audios después de que termina todo el renderizado.
4. Resolver la prueba de recuperación que falla con `AUDIO_BUSY` al intentar generar texto después de un error de audio. Resultado de `TourAudioService.test.ts` en esta revisión: 12 pruebas pasan y 1 falla; la causa aún no está confirmada.
5. Validar Madrid completo en los cinco idiomas: bienvenida una vez, misma voz durante cada versión, pronunciación de nombres, transiciones, cierre y reproducción. Probar una parada voluntaria al final de la ciudad y un corte inesperado con reanudación.

El estado duradero debe identificar ciudad, idioma y bloque completado, junto con la identidad de sus entradas. No se deben reutilizar audios cuando cambien el texto o la referencia. Sólo una ciudad con sus cinco versiones completas cuenta como terminada.

## Estimación de textos mediante OpenRouter

Consulta de tarifas estándar: 2026-09-08. USD por millón de tokens:

| Modelo | Entrada | Salida |
| --- | ---: | ---: |
| [GPT-5.4 mini](https://openrouter.ai/openai/gpt-5.4-mini) | 0,75 | 4,50 |
| [GPT-6 Astra](https://openrouter.ai/openai/gpt-6-astra) | 10,00 | 50,00 |

Evidencia local usada para extrapolar, no una factura de producción:

- Una redacción con Astra: 11.339 tokens de entrada y 803 de salida, en `backend/tmp/plaza-mayor-codex-low-20260906-1/result.private.json`.
- Seis auditorías con Astra: 89.539 tokens de entrada y 14.214 de salida en total, en `backend/tmp/narrative-v8/madrid-astra-low-audit-20260906/results.private.json`. El ensayo terminó, pero no superó publicación.
- Supuesto: siete paradas y una bienvenida por versión; una redacción y una auditoría por bloque; 250 versiones. Se aplica el mismo volumen de tokens a ambos modelos, sin descuento de caché. No se suman dos veces los tokens de razonamiento incluidos en la salida.

Fórmula por bloque: 26.262,17 tokens de entrada y 3.172 de salida, multiplicados por 2.000 bloques. Es una aproximación: una bienvenida o una revisión adicional puede consumir otro volumen, y mini puede necesitar más intentos o producir distinta longitud.

| Modelo | Base calculada | Reserva propuesta para textos |
| --- | ---: | ---: |
| GPT-5.4 mini | 67,94 USD | 150–200 USD |
| GPT-6 Astra | 842,44 USD | 1.000–2.000 USD |

La reserva no es un máximo garantizado. Incluye margen para revisar y repetir, pero debe ajustarse tras medir una ciudad completa. Para un piloto futuro con mini, la propuesta es empezar con 20 USD de saldo, sin recargar todo el presupuesto por adelantado. No se ha contratado ni ejecutado ese piloto de pago.

La estimación cubre redacción y auditoría de textos. No mide todavía todas las etapas de investigación, planificación y publicación; las herramientas de búsqueda de pago serían adicionales. Tampoco incluye audios de pago, alojamiento, electricidad, impuestos ni la [comisión de compra de créditos de OpenRouter](https://openrouter.ai/docs/faq). Los audios del piloto se generan localmente.

OpenRouter publica además [Astra Batch](https://openrouter.ai/openai/gpt-6-astra:batch) a 5 USD de entrada y 25 USD de salida por millón: la misma base sería 421,22 USD. Esta modalidad de API requiere comprobar y adaptar la integración; repartir nuestras ciudades entre varios días no aplica automáticamente ese descuento.

Los cálculos son informativos. Se mantiene el proveedor actual de textos hasta una decisión posterior.
