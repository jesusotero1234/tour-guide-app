# Probar ciudades desde cero con Codex

## Qué cambia

`--writer-transport=codex` conserva la preparación actual y activa el encargo
en prosa: una respuesta Astra low mediante Codex y una auditoría factual
GPT‑5.4 mediante OpenRouter por parada. No pasa por el antiguo bucle de
segmentos, reparaciones ni scorecard global. No publica automáticamente.

El resto del perfil `qwen38_hybrid` sigue igual: preparación con Qwen local,
GPT‑5.4 Mini y, cuando corresponda, GPT‑5.4. El RAG sigue siendo opcional y
no se modifica. Sin el flag, continúa el modo anterior.

## Costes y requisitos

- Codex usa el login ChatGPT y su cuota. No factura llamadas de escritor a
  OpenRouter, pero no es capacidad ilimitada.
- OpenRouter sigue cobrando preparación y auditorías. Un único SpendGuard
  controla todo el recorrido. El comando de abajo admite **hasta 2 USD para
  ese canario independiente**, no es una estimación de su coste final.
- Si ejecutas los tres ejemplos con ese límite independiente, autorizas hasta
  **6 USD en total**, más consumo de cuota Codex. No es un límite de lote.
- El `--prior-spend-usd=0` representa un experimento nuevo e independiente;
  no borra el historial de otros experimentos. Si administras un presupuesto
  acumulado, conserva el gasto previo y usa el mismo límite acumulado.
- Requiere Node 22, `codex login` con ChatGPT, OpenRouter configurado,
  Qwen local y servicios de investigación accesibles (incluido SearXNG).
  Este modo no necesita una clave DeepSeek separada.
- Primera versión: ejecuciones nuevas; `--resume-*` no está soportado en
  este modo y se rechaza antes de gastar.

## Comando

Ejecuta una ciudad cada vez. Aquí se propone empezar por la localidad pequeña.

```bash
cd /home/jesusotero/coding/tour-guide-app/backend
nvm use 22

CANARY_CITY='Albarracín'
CANARY_QID='Q695488'
CANARY_MINUTES=60

npm run quality:narrative:v8:user-canary -- \
  --generate --allow-external \
  --profile=qwen38_hybrid --writer-transport=codex \
  --city="$CANARY_CITY" --city-qid="$CANARY_QID" \
  --country=España --country-code=ES \
  --theme=history --language=es --duration="$CANARY_MINUTES" \
  --rag=off --prior-spend-usd=0 --spend-limit-usd=2 \
  --run-id="codex-${CANARY_QID}-$(date +%Y%m%d-%H%M%S)"
```

Para los siguientes experimentos cambia las tres variables y vuelve a lanzar
el comando npm:

- Madrid: `CANARY_CITY='Madrid'`, `CANARY_QID='Q2807'`, `CANARY_MINUTES=120`.
- Segovia: `CANARY_CITY='Segovia'`, `CANARY_QID='Q15684'`, `CANARY_MINUTES=90`.
- Albarracín: `CANARY_CITY='Albarracín'`, `CANARY_QID='Q695488'`, `CANARY_MINUTES=60`.

Identidades verificadas en [Segovia / Wikidata](https://www.wikidata.org/wiki/Q15684)
y [Albarracín / Wikidata](https://www.wikidata.org/wiki/Q695488). Son parámetros
de estos ejemplos, no reglas incorporadas al pipeline.

Para probar el RAG usa `--rag=on` con el servicio del corpus levantado y un
run-id nuevo. No se reutiliza una respuesta narrativa anterior; las cachés
existentes de fuentes pueden seguir actuando.

## Resultados y cómo interpretarlos

Carpeta: `backend/tmp/narrative-v8/<run-id>/`.

- `tour.md`: texto y fuentes para leer, actualizado después de cada parada.
- `review.json`: ruta, duración, hallazgos, conteos de autor y auditoría, gasto.
- `codex-author-review.private.json`: narraciones, auditorías completas y cuota
  reportada por Codex. No confundir un JSON de auditoría válido con cero objeciones.
- `codex-author/<n>/`: prompt, eventos y narración original del escritor.
- `progress.private.jsonl` / `spend.private.jsonl`: llamadas API y contabilidad.
- `codex-author-progress.private.jsonl`: actividad del escritor separada de API.

`complete_needs_review` significa que se generaron y auditaron todos los textos,
no que sean publicables ni que encajen necesariamente en la duración. `partial`
conserva lo completado y termina con código distinto de cero. Un fallo de
escritor, auditor o presupuesto no activa otro modelo ni una reparación oculta.

Los minutos del comando son del recorrido, no minutos de voz. `narrationDelivery`
evalúa los objetivos de narración reconciliados. `geometry.durationFit` evalúa
el plan de paseo; sigue siendo una estimación con estancia nominal por parada,
no una medición TTS ni una garantía del tiempo real de visita.

## Localidades pequeñas: lo comprobado y el límite

La tabla actual intenta seleccionar cinco paradas para solicitudes de hasta
75 minutos y de cinco a siete hasta 120 minutos. No obliga a inventar paradas
cuando faltan candidatos: tests con dos y tres candidatos confirman que usa
solo esos y marca la ruta corta cuando corresponde. Con una sola parada, el
planificador peatonal actual rechaza la ruta: requiere al menos dos.

El nuevo escritor admite material de una, dos o tres paradas, pero eso NO implica
que la investigación y el planificador completo acepten cualquier pueblo.
La evidencia insuficiente puede bloquear una parada antes del escritor, y
una ruta corta no se transforma en un tour de dos horas alargando el texto.
No se han relajado estas condiciones para hacer pasar un ejemplo.

## Verificación de esta integración

- 56 tests enfocados: autor, nueva secuencia, materiales, guardia de gasto y duración.
- 9 tests del planificador peatonal, incluidos los nuevos casos de 2 y 3 candidatos.
- TypeScript del backend y carga con tipos del canario completados.
- Login real Codex / ChatGPT y assets comprobados sin inferencia.
- Materiales reales guardados de Madrid y Málaga: siete paradas en ambos casos,
  preparados con el adaptador sin nuevas llamadas LLM.
- No se ejecutó todavía un canario pagado completo desde una ciudad nueva con
  esta conexión. Esa es la prueba que vas a lanzar; no afirmamos que ya pasó.

## Modelos: siguiente decisión

Mantener GPT‑5.4 Mini y GPT‑5.4 durante esta comparación. Si cambiamos al mismo
tiempo fuentes, tamaño de ciudad y auditor, será difícil atribuir una mejora
o un fallo. Después, comparar Qwen u otro modelo barato en una fase concreta
con los mismos materiales y textos, midiendo costes y falsos positivos/negativos.
No sustituir la verificación factual solo porque el modelo cuesta menos.
