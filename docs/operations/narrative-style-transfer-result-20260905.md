# Transferencia de la referencia editorial a La Malagueta

## Resultado

Prueba ejecutada una vez, sin reparaciones: **no alcanza la experiencia ni la duración buscadas**. El ejemplo de Plaza Mayor aceptado por el usuario no basta, incorporado de esta forma al escritor actual, para obtener una primera versión comparable en otra parada. No se cambia producción, el RAG ni los modelos.

[Leer el texto generado original](../../backend/tmp/narrative-writer-briefing-pilot-v8/editorial-first-malagueta-style-20260905-1/Q523311-editorial_packet.md).

## Qué se probó

- Lugar: La Malagueta, Málaga, Q523311. Otra parada y otra ciudad respecto a la referencia. Ya existía un resultado histórico con el mismo paquete sin ejemplo.
- Fuente congelada: `backend/tmp/narrative-v8/malaga-v8-goal-material-20260905-2/`.
- Objetivo sin cambios: 562 palabras / 281 segundos estimados, no medición TTS.
- Escritor: `openai/gpt-5.4-mini`, razonamiento bajo, máximo 4.000 tokens, vía OpenRouter.
- Auditor: `openai/gpt-5.4`, razonamiento medio, máximo 8.000 tokens, vía OpenRouter.
- Run: `editorial-first-malagueta-style-20260905-1`.

Se creó una copia del paquete de Málaga, conservando todos sus hechos, pasajes, exclusiones, objetivo e instrucciones existentes. Solo se añadieron dos instrucciones editoriales: cómo usar el ejemplo exclusivamente como estilo, sin copiar hechos ni frases, y el guion completo de Plaza Mayor, sin notas de fuentes. No se aportaron nuevos hechos de Málaga ni se cambió el prompt de sistema o el esquema de salida.

El ejemplo se incorporó por el campo de instrucciones editoriales que el arnés ya admite. Esto prueba esa forma concreta de aportar la referencia; no todas las estrategias posibles de ejemplos en contexto.

La preparación se materializó de forma determinista mediante el worker, sin generación local de Qwen. La narración y auditoría sí son llamadas reales a OpenRouter. No hubo cambios de implementación.

## Comprobaciones

El dry-run comprobó dos llamadas previstas y una reserva máxima conjunta de 0,85 USD, dentro del saldo previo de 1,55613060 USD. El guard limita cada solicitud antes de HTTP y mantiene el acumulado histórico.

Se compararon mediante aserciones los inputs guardados del caso previo y del nuevo: son idénticos al retirar las dos instrucciones añadidas. También se comprobó identidad exacta del corpus del auditor, prompt de sistema y esquema. El auditor **no recibió el ejemplo de Madrid como evidencia**. La primera ejecución de esa comprobación local usó el Node antiguo del sistema y falló por ausencia de `structuredClone`; se corrigió el ejecutable a Node 22 y pasó, sin cambios de código ni llamadas remotas adicionales.

El escritor terminó normalmente (`finishReason: stop`), con 711 tokens de salida contabilizados, incluidos 42 de razonamiento, frente al máximo de 4.000. No hay evidencia de truncamiento por ese límite. Referencia completa presente en la entrada guardada.

## Comparación observada

| Medida | Paquete previo sin ejemplo | Paquete con referencia |
| --- | ---: | ---: |
| Palabras generadas | 436 | 339 |
| Objetivo | 562 | 562 |
| Margen local ±20% | No pasa | No pasa |
| Indicador agregado ±10%, calculado sobre una parada | No pasa | No pasa |
| Objeciones del auditor | 0 | 0 |
| Coste escritor + auditor, USD | 0,055295 | 0,053146 |

La referencia no mejoró el resultado observado. Una muestra por condición y el control histórico no permiten afirmar que añadir ejemplos empeore sistemáticamente al modelo. El margen agregado de una parada tampoco prueba la duración de un tour completo.

La nueva salida queda 223 palabras por debajo del objetivo (39,7% menos): unos 169,5 segundos de voz frente a 281, bajo el supuesto de 120 palabras por minuto. No se cambian los márgenes para aceptarla.

## Lectura editorial y factual

Codex leyó íntegramente el nuevo guion, el anterior, los siete pasajes seleccionados de Málaga y los quince juicios del auditor.

- Comienza con una invitación a mirar la fachada, pero pronto vuelve al inventario de geometría, aforo y calendario. No desarrolla una pregunta ni un episodio al nivel de la referencia.
- Conserva «La fuente menciona…» y «sin necesidad de forzar más de lo que dice la documentación»: el lenguaje de preparación editorial se filtra a la voz del guía.
- El resumen de 1939 y 1943 mantiene los contextos separados, pero los comprime en lugar de desarrollar su significado para quien escucha.
- No se observó transferencia de balcones, edificios, fechas, incendios o transición de Madrid a Málaga. La terminación es local y no anuncia plaza de Oriente.
- El auditor no encontró objeciones. La lectura propia no encontró un nuevo error material claro frente a los pasajes usados, pero no constituye una investigación histórica independiente ni verificación de vigencia de los usos actuales.
- La cobertura de fichas declarada es 1. Eso no mide inmersión, desarrollo o duración.

## Coste y decisión

Dos solicitudes válidas al primer intento: una escritura y una auditoría. Sin fitter, reparaciones o regeneraciones. El comando tardó **32,870 segundos**.

- Escritura: **0,00536850 USD**.
- Auditoría: **0,04777750 USD**.
- Seguimiento nuevo: **0,05314600 USD**; exposición nueva no verificada: cero.
- Total contabilizado de la autorización de 2 USD: **0,49701540 USD**, incluyendo 0,05167950 USD de exposición histórica de aquella autorización.
- Saldo vigente: **1,50298460 USD**; reservas pendientes: cero.
- Acumulado del guard: **7,968564750000001 USD**, techo **9,47154935 USD**.

No promover esta variante ni lanzar un canario completo como consecuencia de esta prueba. No se ajusta el texto a mano para presentarlo como una salida automática satisfactoria. La referencia humana-asistida sigue siendo útil como criterio: precisamente permite ver que una auditoría sin objeciones puede acompañar una narración que no satisface el producto.

La prueba solicitada queda terminada. Cualquier comparación posterior de modelo, prioridad del briefing o formato del ejemplo debe decidirse explícitamente como otra hipótesis; este resultado no demuestra por sí solo cuál de esas opciones resolverá el problema. No queda una prueba de este seguimiento corriendo.
