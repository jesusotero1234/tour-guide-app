# Generación con DeepSeek V4.1 Flash y Astra — 10/9/2026

## Cambio aplicado

La generación de la aplicación usa ahora el perfil existente `deepseek_control` con transporte `codex`. Se sustituyen GPT-5.4 Mini y Qwen3.8 local en la preparación por `deepseek-flash`, mediante la API directa de DeepSeek, con razonamiento desactivado. Se conservan el límite de salida del curador (16000 tokens) y la concurrencia de preparación del flujo anterior.

| Trabajo | Modelo y conexión |
| --- | --- |
| Revisión de lugares imprescindibles | DeepSeek V4.1 Flash, API directa |
| Consultas adicionales de búsqueda | DeepSeek V4.1 Flash, API directa |
| Curación y nuevas rondas de fichas | DeepSeek V4.1 Flash, API directa |
| Arco narrativo | DeepSeek V4.1 Flash, API directa |
| Narraciones y bienvenida | GPT-6 Astra low, Codex / cuota ChatGPT |
| Auditoría factual y de idioma | GPT-6 Astra low, Codex / cuota ChatGPT |
| Voz | Configuración existente VoxCPM2 local |

El archivo histórico continúa desactivado en esta entrada. Sus modelos de recuperación documental no intervienen en el cambio.

La aplicación fija el perfil en `CodexTourProcess.ts` y `CodexTourGenerator.ts`, por lo que no depende del perfil alternativo presente en el entorno general del backend. El canario v8 también usa este perfil y Astra por defecto; siguen disponibles las opciones explícitas de perfiles anteriores.

## Conexión y presupuesto

El arranque requiere `DEEPSEEK_API_KEY` y verifica el modelo en `https://api.deepseek.com/models`. Ya no exige una clave de OpenRouter ni la disponibilidad del servidor Qwen para este perfil. La comprobación de OpenRouter no hace solicitudes cuando el perfil carece de modelos de ese proveedor.

El cliente usa `https://api.deepseek.com/chat/completions`. El endpoint beta se conserva solo al pedir expresamente herramientas estrictas. Se mantienen el formato estructurado, las validaciones y el control del presupuesto. La tabla incorpora las tarifas del nuevo ID desde el 10/9 a las 04:00 UTC, con reservas conservadoras a tarifa punta; conserva los cálculos históricos de los IDs antiguos.

## Validación realizada

- 84 pruebas pasaron en los cinco archivos del flujo afectado: conexión/modelo, costes punta y valle, ausencia de solicitudes a OpenRouter, argumentos del proceso y redacción/auditoría Astra.
- `npm run build` pasó y regeneró los ejecutables usados por la aplicación.
- Una prueba real utilizó el curador compilado con la captura congelada de Sagrada Familia: una llamada directa, modelo devuelto `deepseek-flash`, 13 proposiciones y 7,377 segundos. Consumo estimado: **0,005726040 USD**, sin exposición pendiente. Se eliminó la clave OpenRouter del entorno de ese proceso de prueba y se rechazó cualquier destino distinto del endpoint directo.
- Evidencia privada: `backend/tmp/narrative-v8/deepseek-astra-generation-20260910-client-smoke/result.private.json`. Esta llamada comprobó el cliente y el contrato; no constituye un nuevo tour completo ni una aprobación factual.
- La ejecución más amplia produjo 112 pruebas correctas y dos fallos preexistentes en `EditorialStructuredLlmV6.test.ts`: el perfil antiguo qwen38 espera Mini como segundo auditor aunque la configuración previa ya tenía GPT-5.4 completo, y el test de Gemini espera que todos sus papeles de apoyo coincidan con ese perfil. No se modificaron ni se ocultaron esas expectativas.
- No se ha vuelto a ejecutar el tour completo con búsqueda adaptativa y voz. La infraestructura local de búsqueda/captura había fallado durante la comparación Barcelona; el éxito del cliente no certifica la disponibilidad de esos servicios.

## Coste orientativo por tour

Para seis paradas, la preparación de fichas medida en Barcelona fue **0,040761084 USD en punta**, equivalente a **0,020380542 USD fuera de punta** con el mismo consumo. Selección, arco y búsquedas adicionales añaden gasto; no existe todavía una medida íntegra del nuevo flujo. Astra consume cuota ChatGPT en la configuración aplicada, y la voz se ejecuta localmente.

Si se trasladara Astra a OpenRouter, la tarifa estándar verificada es 10 USD por millón de tokens de entrada, 1 USD por millón de entrada en caché y 50 USD por millón de salida. OpenRouter también anuncia Flex a la mitad. Fuente: [GPT-6 Astra en OpenRouter](https://openrouter.ai/openai/gpt-6-astra). **Ese traslado no se ha realizado: el usuario preguntó por su coste.**

Como referencia de escala, las seis redacciones Astra de Madrid registraron 75406 tokens de entrada y 4737 de salida: unos 0,991 USD a tarifa estándar sin descuento de caché. Las seis auditorías de fichas DeepSeek de Barcelona registraron 83437 y 5744: unos 1,122 USD. Son muestras de tareas y ciudades diferentes; la auditoría de un guion completo puede consumir más que la de una ficha.

Con margen para bienvenida, preparación DeepSeek y variaciones normales, el presupuesto orientativo es **2–3 USD por tour de seis paradas con Astra estándar**, o **1–1,5 USD con Flex** al mismo consumo. No es una factura ni una medición de extremo a extremo en OpenRouter. El número de paradas, extensión del contexto, caché, razonamiento y reintentos pueden mover el total. No incluye infraestructura local, impuestos, comisiones de recarga ni reintentos extraordinarios.
