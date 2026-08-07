# Selector editorial v6: resultado del experimento eliminatorio de Madrid

Fecha: 2026-08-07

Estado: **gate fallido; implementación detenida antes del optimizador y del jurado v6**

## Resultado

El contrato compacto y la captura reproducible funcionan, pero DeepSeek v4 Flash no produjo un núcleo aprobable. Las tres auditorías fueron válidas y respetaron los presupuestos, pero devolvieron conjuntos obligatorios distintos y todas omitieron Plaza de la Villa frente al oracle cargado posteriormente por el evaluador.

| Auditoría | Obligatorios | Anchors de Madrid | Entrada | Schema | Latencia |
|---|---:|---:|---:|---:|---:|
| seed-a | 7 | 6/7 | 11.876 caracteres | 2.935 caracteres | 17.638 ms |
| seed-b | 6 | 6/7 | 11.876 caracteres | 2.935 caracteres | 14.487 ms |
| seed-c | 8 | 6/7 | 11.876 caracteres | 2.935 caracteres | 14.348 ms |

Los tres conjuntos coinciden en Palacio Real, Almudena, Plaza Mayor, Puerta del Sol, Cibeles y Puerta de Alcalá. La primera auditoría añade San Francisco el Grande; la tercera añade Palacio de Cibeles y Reina Sofía. Ninguna marca Plaza de la Villa como obligatoria.

El resultado congelado es `core_review_required` por `audit_disagreement`. Pasan schema, cardinalidad, evidencia propia, tamaño y latencia; fallan consenso exacto y cobertura 7/7. Por tanto no se han implementado búsqueda core-constrained, jurado, workflow de rutas, calibración multiciudad ni holdouts.

## La señal de Plaza de la Villa sí estaba presente

La omisión no procede de una identidad ausente ni de evidencia cruzada. Antes de consultar el oracle, el snapshot registró para `Q2711992`:

- aparición en la sección `Ver` de Wikivoyage;
- 14 sitelinks de Wikidata;
- 22.290 pageviews en la ventana anual, percentil 0,4828 entre los 30 candidatos;
- evidencia histórica propia;
- revision IDs y fingerprint de las fuentes.

La captura usa enlaces y revisiones de MediaWiki, entidades/sitelinks de Wikibase y pageviews por artículo conforme a sus interfaces oficiales: [API:Links](https://www.mediawiki.org/wiki/API:Links), [API:Revisions](https://www.mediawiki.org/wiki/API:Revisions), [Wikibase/API](https://www.mediawiki.org/wiki/Wikibase/API) y [Analytics API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/examples/page-metrics.html).

## Comparación con el mismo contrato congelado

Las comparaciones reutilizaron el mismo fingerprint de candidatos y el mismo snapshot de prominencia (`4ea51fa298904b1b4002ea1e4e728d904c2b27ff3dadf6ee66c974c462067b29`); no se recapturaron fuentes ni se cambió el prompt después de evaluar DeepSeek.

| Proveedor/modelo | Resultado |
|---|---|
| Ollama / `qwen2.5:14b` | Falló cerrado en la primera auditoría tras 67.829 ms: asignó un `reasonCode` no nulo a un candidato `optional`. No hubo reintento semántico. |
| OneProvider / `claude-sonnet-4-6` | Dos intentos de transporte fallaron con HTTP 403 `API_KEY_EXPIRED` en 887 ms acumulados. |

OneProvider expone una interfaz compatible con OpenAI para chat completions y un catálogo de modelos, según su [documentación de API](https://oneprovider.dev/docs/api) y [documentación de modelos](https://oneprovider.dev/docs/api/models). El adaptador y la redacción de credenciales quedaron probados, pero la credencial disponible no permitió comparar la calidad del modelo.

No puede atribuirse el fallo específicamente a DeepSeek: ningún segundo modelo superó el protocolo congelado. Qwen produjo una respuesta semánticamente inválida y el segundo proveedor remoto no fue accesible con la credencial disponible.

## Artefactos y replay

- DeepSeek: `backend/fixtures/editorial-v6/core/editorial-core-v6-madrid-20260807-e/madrid-history-es-120.json`
- Qwen/Ollama: `backend/fixtures/editorial-v6/core/editorial-core-v6-madrid-qwen-20260807-a/madrid-history-es-120.json`
- OneProvider: `backend/fixtures/editorial-v6/core/editorial-core-v6-madrid-oneprovider-20260807-a/madrid-history-es-120.json`

El replay de DeepSeek reconstruye y comprueba exactamente las entradas permutadas, el schema, fingerprints de prompt y respuesta, respuestas crudas, resultado de consenso y snapshot de prominencia. El comando termina con código 1 porque reproduce deliberadamente el gate fallido, no por divergencia del replay.

El fingerprint global del runner almacenado antes de incorporar los adaptadores comparativos ya no coincide con el árbol actual. Esto se expone como `snapshotSelectorFingerprintMatches: false`; no se oculta ni se reescribe el artefacto. El replay sigue siendo válido porque recalcula y compara el payload completo, schema, prompt, respuesta y resultado, mientras que el cambio posterior está limitado al transporte de los proveedores comparados.

```bash
cd backend
npm run quality:core:v6 -- --mode snapshot \
  --artifact fixtures/editorial-v6/core/editorial-core-v6-madrid-20260807-e/madrid-history-es-120.json
npm run quality:core:v6:evaluate -- \
  --artifact fixtures/editorial-v6/core/editorial-core-v6-madrid-20260807-e/madrid-history-es-120.json
```

## Verificación de código

- v6 focalizado: 6 suites, 15 tests, todos pasan;
- v5 focalizado: 7 suites, 27 tests, todos pasan sin modificar v5;
- `npm run build`: pasa;
- suite backend completa: 55 suites pasan y 2 fallan en archivos no modificados (`LandmarkTiering.test.ts` y `tours.test.ts`), por expectativas ya desalineadas con el comportamiento que observan;
- `npm run lint`: no arranca porque el backend no tiene un archivo de configuración ESLint;
- escaneo de los artefactos: no aparecen API keys ni cabeceras Bearer.

Los dos fallos globales y la ausencia de configuración ESLint son ajenos al selector v6 y no se han corregido para mantener el cambio quirúrgico. Impiden afirmar que el gate de suite completa/lint esté verde.

La revisión final de corrección, simplicidad, arquitectura, seguridad y rendimiento no encontró un bloqueo adicional en el arnés v6. Se reforzó la equivalencia identidad/nombre del snapshot, se aplicó semánticamente el máximo de `omissionReason`, se mantuvieron secretos fuera de errores/artefactos y se conservaron las peticiones Wikimedia secuenciales con retry acotado. La decisión de no avanzar sigue causada por el resultado editorial, no por esos checks técnicos.

## Decisión

Se conserva v5 intacto y la rama v6 queda como experimento reproducible. No se ajustan pesos, no se consulta el oracle desde el resolver, no se crea un override para memorizar Madrid y no se promociona un núcleo por mayoría.

Para reanudar la fase 2 hace falta ejecutar el mismo contrato con una credencial remota válida o resolver mediante revisión editorial explícita por qué Plaza de la Villa debe pertenecer al núcleo. Cualquier decisión deberá versionarse; observar este oracle no autoriza a recalibrar el contrato ni el selector.
