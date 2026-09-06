# Backend limpio y canarios desde cero — 2026-09-06

## Limpieza realizada

Se archivaron otras **31 entradas**: los 16 logs de Málaga que estaban en la raíz del backend, 7 paquetes/carpetas/ZIP de revisión forense y 8 carpetas de resultados experimentales. En total: **1.218 archivos, 71.478.177 bytes**.

Archivo recuperable:
`/home/jesusotero/coding/tour-guide-app-archive/backend-history-20260906-2`

[Manifiesto con rutas y digests](backend-history-cleanup-manifest-20260906.json). Se verificó el contenido antes y después de mover. No hubo borrado permanente, por lo que el archivo sigue ocupando disco fuera del repositorio. No había procesos abiertos sobre los logs de Málaga ni canarios en ejecución al comprobarlos.

Se conservaron el RAG, fixtures, código, la edición de Madrid, el canario Astra original y sus siete salidas, el canario Codex de Plaza Mayor, los checkpoints usados por benchmarks/replays y los registros de gasto.

**No eliminar `backend/logs/narrative-v6-spend.private.jsonl` como si fuera un log de consola:** `NarrativeSpendLedgerV6.ts` lo utiliza como ledger. También se mantuvieron sus rondas históricas.

Los informes antiguos que enlazan resultados archivados deben consultar la misma ruta relativa bajo el archivo recuperable. El manifiesto permite restaurar cada entrada sin sobrescribir datos nuevos.

## Lo que funciona hoy

`quality:narrative:v8:codex-author` escribe desde un encargo autocontenido usando Astra low por Codex. No hace selección de ciudad, investigación ni auditoría automática. La prueba real de Plaza Mayor tuvo una sola llamada, 601 palabras y ningún cargo de OpenRouter.

`quality:narrative:v8:user-canary` sí genera desde una ciudad, pero **todavía usa el pipeline anterior**. No existe una opción implementada y verificada que lo convierta en el canario de autoría Astra/Codex por añadir un flag. No se debe presentar un comando hipotético como funcional.

El usuario confirmó que quiere **ciudades desde cero**, no un replay sobre fuentes guardadas.

## Agentes y costes que quedan

Configuración actual `qwen38_hybrid`, revisada en `NarrativeModelProfilesV6.ts`:

| Función | Modelo / transporte | Cargo marginal |
| --- | --- | --- |
| Selección del núcleo | GPT-5.4 Mini / OpenRouter | Sí |
| Planificador de investigación | Qwen local | Sin cargo OpenRouter; recursos de la máquina |
| Curación habitual | GPT-5.4 Mini / OpenRouter | Sí |
| Curación compleja | GPT-5.4 / OpenRouter | Sí, si se activa |
| Arco narrativo | GPT-5.4 Mini / OpenRouter | Sí |
| Escritor del canario antiguo | GPT-5.4 Mini / OpenRouter | Sí; no se ha conectado Codex aquí |
| Autor local nuevo | Astra low / Codex ChatGPT | Cuota Codex; sin llamada OpenRouter |
| Verificación compacta | Fase auditor_b: GPT-5.4 / OpenRouter | Sí |
| Auditor_a y reparación del perfil | Qwen local | Sin cargo OpenRouter; no todas las fases se ejecutan siempre |
| Adjudicación, si procede | GPT-5.4 Mini / OpenRouter | Sí |
| Evaluación global, cuando se ejecuta | GPT-5.4 Mini / OpenRouter | Sí |

El perfil no equivale a un número fijo de llamadas: las fases concretas dependen del workflow, admisión, errores y estado de revisión. La verificación compacta usa la fase `auditor_b`, no se deduce su proveedor de etiquetas antiguas como `deepseek_pro`.

Precios estándar publicados, consultados el 2026-09-06:

- [GPT-5.4 Mini en OpenRouter](https://openrouter.ai/openai/gpt-5.4-mini): $0,75 por millón de tokens de entrada y $4,50 por millón de salida.
- [GPT-5.4 en OpenRouter](https://openrouter.ai/openai/gpt-5.4): $2,50 por millón de entrada y $15 por millón de salida.

No son precios por tour. Caché, proveedor, contexto y servicio elegido pueden cambiar la facturación. No se ha modificado el enrutamiento ni solicitado inferencia pagada durante esta revisión.

SearXNG/capturas y la consulta del RAG local no pasan por OpenRouter por sí mismos. No debe confundirse esto con infraestructura gratuita: existen recursos de máquina y alojamiento; no se ha auditado aquí la facturación interna del servicio RAG ni de proveedores de mapas/TTS. El canario narrativo no demuestra ni incluye por sí solo una generación de audio.

## Referencias de gasto observado, no promesas

En `madrid-v8-staged-20260905-015959`:

- Núcleo: 3 llamadas, $0,0367785.
- Curación: 11 llamadas, $0,12026475.
- Arco: 1 llamada, $0,01744425.
- Estas fases anteriores a la escritura sumaron **$0,1744875**.
- El run entero histórico informó $0,45591. Entonces sus verificaciones usaron Mini; no es una estimación válida de la configuración actual que usa GPT-5.4 en auditor_b.

En el canario posterior `madrid-author-astra-low-20260906-1`, sobre fuentes ya preparadas:

- Siete escrituras Astra por OpenRouter: $0,561935.
- Siete auditorías GPT-5.4 por OpenRouter: **$0,64915**.
- Cambiar el escritor a Codex no elimina esas auditorías ni vuelve a pagar cero la preparación de una ciudad nueva.

Combinar ambas cifras históricas sugiere un orden de magnitud próximo a $0,82 para preparación y siete auditorías similares, **pero no es una medición de un canario nuevo ni una garantía de coste**. No incluye desviaciones por investigación más difícil, escaladas, reintentos o un juez global adicional.

## Decisión pendiente antes del comando definitivo

Alternativa mínima: conectar la ruta/investigación existente con la autoría de texto de Codex, manteniendo los otros agentes en OpenRouter y su SpendGuard. Conservar hechos, objetivos, auditoría y estado de publicación; no desactivar validación para abaratar ni volver silenciosamente al escritor de pago si Codex falla.

Alternativa sin cargos API de modelos: llevar también preparación/auditoría a Codex o Qwen. Es otro cambio de compatibilidad, contratos y evaluación, todavía no implementado ni validado.

No se han conectado esas alternativas durante la limpieza. Falta acordar cuál se quiere antes de entregar un comando como si ya ejecutara el flujo completo solicitado. El presupuesto tendría que ser explícito y acumulado si se lanzan varios canarios; no reiniciar `prior-spend-usd=0` en un bucle y presentarlo como un límite global compartido.

