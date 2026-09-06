# Prueba de Sol medium: fallo de acceso, sin narración

Fecha: 2026-09-06. Run: `malagueta-author-sol-medium-20260906-1`.

Actualización: con nueva autorización de 2 USD, el run siguiente completó escritura y auditoría. Véase [el resultado con el texto original de Sol](narrative-author-sol-success-20260906.md). Este documento conserva el diagnóstico y presupuesto del intento fallido; no es el estado más reciente.

## Resultado

Se intentó una única escritura con `openai/gpt-5.6-sol` mediante OpenRouter. La petición devolvió HTTP 404; no produjo narración ni uso facturado confirmado. No se puede valorar todavía su estilo, factualidad, extensión o capacidad de resolver el encargo en un intento. No es evidencia de que Sol escriba peor o mejor que DeepSeek, Kimi o GLM.

No hubo reintento, auditoría, reparación ni canario completo de Madrid.

## Encargo y presupuesto

Se utilizó el mismo encargo de La Malagueta que en las tres pruebas anteriores: siete pasajes originales, ejemplo de voz de Plaza Mayor, objetivo aproximado de 562 palabras, razonamiento medio y límite de 5.000 tokens de salida. Se comprobó la igualdad exacta de mensajes, configuración de privacidad y razonamiento con la petición anterior de DeepSeek.

SHA-256 del encargo: `023aece5b25e69a910119614a067b7890d9a2d849dd92bfb20e342bdea3547e0`.

Quedaban 0,664115198 USD de la campaña de 2 USD. La reserva máxima conservadora de Sol era 0,434126 USD; añadir la reserva del auditor habitual, 0,65 USD, no cabía. Por eso se anunció y utilizó una opción explícita de escritura sin auditoría automática. La revisión posterior iba a ser editorial por Codex, no una aprobación del juez anterior. Al no obtener texto, tampoco pudo hacerse esa revisión.

Tras el 404:

- Coste reportado de esta petición: no disponible; el acumulador de costes reportados permanece en cero para este run.
- Exposición sin uso confirmado contabilizada preventivamente: **0,434126 USD**. No equivale a un cobro demostrado.
- Saldo contable de la campaña: **0,229989198 USD**.
- Reservas abiertas: cero. La exposición ya está asentada en el registro conservador, no liberada ni descontada por suponer que un 404 es gratuito.

No se reinició el presupuesto. Un nuevo intento con el mismo límite necesita una reserva planificada de 0,44 USD; una ampliación explícita de 0,25 USD permitiría cubrirla, sin auditoría automática.

## Incompatibilidad encontrada

Después del fallo se consultó por GET, sin inferencia, el catálogo autenticado de endpoints ZDR de OpenRouter. Para Sol devolvió Azure, Azure US y Azure EU. Los tres anuncian `max_completion_tokens` y `reasoning`, pero no `max_tokens` en `supported_parameters`.

La petición fallida enviaba `max_tokens: 5000`, junto con `require_parameters: true`, `zdr: true`, `data_collection: deny` y `allow_fallbacks: false`. Existe por tanto una incompatibilidad concreta entre el parámetro enviado y las capacidades anunciadas por los proveedores ZDR. Es una explicación plausible del 404, **no una causa exclusiva confirmada**: el piloto conservó el código HTTP pero no el mensaje detallado del servidor, y aún no se ha repetido la llamada corregida.

OpenRouter documenta ambos campos y marca `max_tokens` como obsoleto frente a `max_completion_tokens`: [contrato de chat](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request). El filtrado por parámetros y privacidad está descrito en [selección de proveedores](https://openrouter.ai/docs/guides/routing/provider-selection); el catálogo consultado corresponde a [endpoints ZDR](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints-zdr).

También se observaron endpoints ZDR de Mini con el campo moderno. Eso merece comprobarse cuando se retome Mini, pero no demuestra retroactivamente la causa de su 404 ni se modificó su transporte en esta tarea.

## Cambios limitados al piloto

Solo se modificaron el piloto experimental `narrative-plain-writer-pilot-v8.ts` y su test:

- Sol está permitido como escritor experimental, con cap de 0,44 USD.
- `--writer-only` es una opción explícita. Sus resultados, si hubiera narración, se marcan `unaudited`, con `auditStatus: not_run` y objeciones nulas, nunca como cero errores.
- Para Sol, el transporte ahora renombra el límite a `max_completion_tokens`, conservando exactamente 5.000 tokens, mensajes, razonamiento y privacidad.
- La comprobación de compatibilidad de Sol exige el campo realmente enviado. La estimación conservadora de precios no se rebajó.
- El artefacto de entrada de futuros runs guardará el cuerpo HTTP efectivo. El artefacto del intento fallido conserva intacto el cuerpo original con `max_tokens`.
- Los demás escritores y la ruta auditada por defecto mantienen su comportamiento previo. Producción, RAG e infraestructura no se modificaron.

Pasaron **22 tests locales**, incluyendo igualdad del encargo, transporte de Sol, ausencia de cambios en otros modelos, reserva antes del HTTP, una única llamada y planificación sin auditor. `git diff --check` pasó. Se verificó en el run real un inicio y un cierre de intento, HTTP 404, ausencia de narración/auditoría y presupuesto asentado dentro del límite. Los tests no sustituyen una prueba real del transporte corregido.

## Implicación para los precios estimados

Las tarifas estándar consultadas para Sol, 2/10 USD por millón de tokens de entrada/salida, no son las de los endpoints ZDR observados: estos anuncian 5/30 o 5,5/33. No se debe presupuestar nuestra configuración privada suponiendo que alcanzará la tarifa estándar promocional. Tampoco se desactivó la privacidad para alcanzar ese precio.

## Evidencia

- [Entrada original del intento](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-1/inputs.private.json).
- [Fallo registrado](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-1/failure.private.json).
- [Progreso de la única petición](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-1/progress.private.jsonl).
- [Presupuesto vigente](../../backend/tmp/narrative-plain-writer-pilot-v8/malagueta-author-sol-medium-20260906-1/budget.private.json).
- [Comparación anterior con los tres textos completos](narrative-author-context-results-20260906.md).

Siguiente paso: confirmar el gasto real del fallo o autorizar la ampliación mínima; después, repetir una sola escritura corregida con un nuevo run ID. No declarar aprobada la integración o la calidad antes de obtener y revisar el texto.
