# Referencias de Wikipedia bajo demanda y prueba del auditor

Fecha: 2026-09-06. Estrategia implementada en el investigador y conectada al canario de usuario V8. El auditor de producción no se ha modificado en esta tarea.

## Evidencia local anterior al cambio

- `NarrativeResearchV8.ts:325`: el extractor actual solo reconoce la sección «Enlaces externos / External links» y conserva dominios, no las URL completas de las referencias bibliográficas.
- `NarrativeResearchV8.ts:1021`: los dominios extraídos van detrás de los oficiales en una selección limitada a dos; pueden no llegar a generar una consulta.
- Las búsquedas y los mapeos se reúnen antes de capturar sus resultados. En Castellón se invirtieron unos 30 segundos por parada en mapear `www.castello.es`, frecuentemente con resultados administrativos irrelevantes.
- El Fadrí quedó con una captura, Wikipedia, y `writerReady=false` por falta de `tension_or_contrast`. Esto no demuestra escasez de información disponible: sus referencias llevan al MUCC y a Campaners.
- Ya existe un máximo de dos curaciones por parada. Los límites de descubrimiento actuales son cuatro consultas deterministas, tres dominios mapeados y doce intentos de captura.

## Decisión: ampliar solo cuando falte evidencia

1. Mantener la captura inicial y la primera curación existentes. Reutilizar sus indicadores de preparación narrativa, riqueza y duración respaldada; no añadir un LLM para decidir si investigar más.
2. Si ya se cumplen los requisitos editoriales aplicables, terminar la investigación, también cuando una fuente única sea admisible según la política vigente. No expandir por el mero hecho de que Wikipedia sea corta o haya una sola fuente.
3. Si faltan requisitos, recuperar las URL completas de referencias/notas y enlaces externos de la misma revisión de Wikipedia. Usar el contenido capturado si conserva los enlaces; solo si no los conserva, hacer una consulta adicional a MediaWiki. Extraer y ordenar sin LLM.
4. Priorizar enlaces específicos relacionados con el lugar y las carencias detectadas. Abrir directamente las URL conocidas antes de buscar o mapear dominios enteros. Preferencia por fuentes oficiales e inventarios especializados; una referencia no convierte automáticamente un dominio en autoridad oficial.
5. Permitir un documento directamente asociado a una referencia, por ejemplo Wikipedia → página del MUCC → guía histórica PDF del mismo sitio. No recorrer todos los enlaces ni ampliar recursivamente la bibliografía.
6. SearxNG es la alternativa para URL rotas, bibliografía sin enlace o capturas sin pasajes pertinentes. Construir consultas deterministas con título de la referencia, entidad/alias y ciudad; emplear `site:` cuando ayude. Verificar el destino real, porque los motores no garantizan que apliquen ese filtro. No usar snippets como evidencia.
7. Reunir el pequeño lote de capturas y utilizar la segunda curación ya existente. No curar cada página ni añadir una tercera llamada. Si siguen faltando datos, aplicar la política vigente de duración/admisión o revisión, sin fabricar contraste ni alargar el texto con relleno.

La ronda de referencias reemplaza parte del descubrimiento amplio, no se añade delante de todas las llamadas actuales conservándolas incondicionalmente. Si las capturas directas aportan material pertinente, omitir búsqueda genérica, mapeo y generación adaptativa de consultas antes de la segunda curación.

## Límites implementados

- Hasta tres intentos de captura para esta ampliación, incluido cualquier PDF, descontados del límite global existente de doce.
- Hasta dos consultas SearxNG, descontadas del presupuesto de consultas deterministas; no consultas por cada referencia.
- Hasta un documento asociado. La captura autohospedada admite PDF de hasta 12 páginas verificadas y 256.000 bytes UTF-8 de texto; respuesta del proveedor limitada a 1.000.000 bytes. No se ha añadido OCR, audio ni ningún lector basado en LLM.
- Ventana máxima de 60 segundos para la ampliación y concurrencia de dos capturas. Evitar que una web lenta consuma el presupuesto completo.
- Mantener los límites existentes del paquete de pasajes y tokens. Deduplicar contenido y priorizar las carencias detectadas, no enviar documentos completos al modelo.
- Reutilizar resultados por URL/revisión durante el recorrido y registrar fallos para no repetirlos en otra parada. No introducir todavía una caché persistente nueva.

La extracción y ordenación de referencias y las consultas deterministas no necesitan modelos. Puede aumentar el texto útil enviado a la segunda curación, por lo que no se promete coste idéntico: se mantienen los límites de llamadas y tokens, y se mide el coste real.

Particularidad de Firecrawl autohospedado v2.8: su parser local puede leer el PDF completo mientras el metadato se recorta al parámetro `maxPages`. Por eso no se confía en ese recorte: se pide el número real y se rechaza un PDF que supere el límite o no tenga metadatos verificables. El límite de bytes es sobre texto/respuesta, no sobre el fichero binario que descarga internamente Firecrawl; no se garantiza un tope binario de descarga en esta versión. La petición y el procesamiento remoto tienen un timeout de 20 segundos y la ronda completa 60 segundos.

La captura de referencias conserva respuestas y fallos por URL durante el recorrido. MediaWiki se consulta por `oldid` y se comprueba la revisión devuelta. Los destinos de las referencias se admiten como fuentes establecidas tras comprobar identidad; no se convierten en autoridades oficiales por estar citados. Se rechazan redirecciones a otro host, salvo la variante `www`. Un PDF asociado al mismo host puede usar el nombre distintivo sin el artículo («fadrí»), pero solo desde una página padre ya identificada. No se sigue su propia bibliografía.

Los pasajes se ordenan por las carencias detectadas. Se excluyen residuos de imágenes SVG/URI y controles de mapas que sobrevivían a la fragmentación del Markdown. Las citas siguen siendo literales y no se amplía el límite del paquete.

## Ejecución: El Fadrí

Base: `castellon-wikidata-fix-20260906-165625`, revisión de Wikipedia `173293532`, captura de 1.581 caracteres y primera respuesta del curador congeladas. No se regeneró el tour ni se cambiaron sus artefactos. Los alias originales no estaban persistidos: la prueba usó el nombre guardado. Se desactivó el descubrimiento genérico en el probe, no en el investigador normal.

- Primera pasada de diagnóstico, `reference-probe-S4Kl6p`: sin gasto de API; el guard rechazó la reserva máxima antes de llamar al modelo. La guía se rechazó por exigir el nombre completo con artículo. Se corrigió la comprobación específica del documento asociado y se limitó la salida a 6.000 tokens **solo en el probe**. Producción conserva su configuración.
- Captura real y primera curación nueva, `reference-probe-urmzlh`: seis referencias descubiertas; tres intentos; dos aceptados (página MUCC y guía histórica de 12.896 caracteres). El Ministerio respondió con error del proveedor. Ampliación: 4,807 s; cero consultas SearxNG, cero mapas, cero planner adaptativo. Curación: 0,01387275 USD. El PDF aportó datos y discrepancias, pero ruido del mapa ocupaba parte del paquete.
- Revisión final del paquete, `reference-probe-oSEllM`: mismas capturas congeladas, sin volver a descargar. Los pasajes del PDF seleccionados subieron de 12 a 30, sin superar 48 spans totales. Se incluyeron el reloj mecánico parado frente al control por ordenador y la prisión sin ocupación documentada. Una segunda prueba de curación costó 0,0124785 USD y duró aproximadamente 6,5 s incluyendo la reconstrucción local. No confundir sus 7 ms de ampliación con tiempo de adquisición real: se reutilizó la captura anterior.

Gasto total de las dos pruebas con LLM: **0,02635125 USD**, bajo el límite acumulado de 0,15 USD. Cada prueba reutilizó la primera curación y realizó una sola llamada nueva. No se añadió una tercera curación al flujo normal. Para comparar coste de un flujo completo: primera curación guardada (0,00482325) + segunda nueva final (0,0124785) = 0,01730175 USD, frente a 0,010308 USD de las dos curaciones antiguas. Más evidencia no significa automáticamente menos tokens ni menor coste por ronda.

**Resultado editorial pendiente:** `writerReady=false`, sigue faltando `tension_or_contrast`; nueve proposiciones admitidas sin rechazos. El modelo recibió los contrastes literales, pero no eligió una proposición para ese rol. La adquisición condicional funciona; esta prueba no demuestra que haya resuelto la selección/clasificación editorial ni que haya sobrecarga de Codex. No se fuerza la etiqueta, no se inventan hechos y no se hacen más llamadas para obtener un verde.

Validación: 167 pruebas de nueve suites (investigación, referencias, fuentes, dossier, canarios y riqueza) y TypeScript sin errores. Se verifican parada temprana C_FULL, revisión exacta, caché de fallos, deduplicación, presupuesto, timeout/cancelación, PDF, identidad, redirecciones, SearxNG autohospedado, procedencia y ausencia de doble corroboración Wikipedia/referencia. Se preservaron los cambios de otros agentes; no se hizo commit ni push.

Probe reproducible (una parada; `--execute` permite una llamada nueva, omitirlo realiza adquisición sin LLM):

```bash
cd /home/jesusotero/coding/tour-guide-app/backend
node -r ts-node/register scripts/validation/narrative-reference-probe-v8.ts \
  --source=tmp/narrative-v8/castellon-wikidata-fix-20260906-165625 \
  --stop-id=Q2511122 --execute
```

Para inspeccionar el resultado ya obtenido no hace falta volver a ejecutar nada: `backend/tmp/narrative-v8/reference-probe-oSEllM/summary.private.json` y `result.private.json`.

## Fiabilidad y comprobaciones de aceptación

Conservar la procedencia Wikipedia/revisión → referencia → documento → pasaje; comprobar identidad del lugar, URL y redirecciones con las defensas de captura existentes. No eludir restricciones de acceso. Mantener discrepancias e incertidumbres. Wikipedia y una fuente de la que deriva un dato no son dos confirmaciones independientes.

Validar con casos sin red: evidencia inicial suficiente implica cero llamadas de ampliación; referencias duplicadas no se recapturan; enlaces rotos usan solo la búsqueda acotada; un PDF asociado entra en el mismo presupuesto; fuentes no pertinentes se rechazan; nunca hay más de dos curaciones. Después, comparar El Fadrí con el mismo material inicial y sin generar un tour completo: pasajes nuevos útiles, preparación narrativa, tiempo, llamadas y coste.

Referencias consultadas: [API de SearxNG](https://docs.searxng.org/dev/search_api.html), [MUCC: El Fadrí](https://mucc.castello.es/es/sedes/el-fadri/), [guía histórica municipal](https://mucc.castello.es/wp-content/uploads/2023/01/el-campanar-de-la-vila_CAS.pdf), [inventario de Campaners](https://www.campaners.com/php/catedral.php?numer=168).

## Prueba autorizada de la auditoría de la Lonja

Se ejecutó una sola llamada a Codex / `gpt-6-astra`, esfuerzo `low`, con las 32 frases y los 13 pasajes de la Lonja recuperados del canario `castellon-wikidata-fix-20260906-165625`. La reconstrucción del contexto y del prompt se contrastó con la auditoría original de Santa María: tanto el contenido como la huella del prompt completo coincidieron.

Resultado: proceso finalizado con código cero, auditoría estructurada válida en 72,891 segundos; 16 frases `supported` y 16 `authorized_inference`, sin clasificaciones rechazadas. Uso registrado: 13.983 tokens de entrada y 2.027 de salida. Sin llamadas a OpenRouter ni gasto adicional de API; se consumió cuota de ChatGPT/Codex.

Artefactos separados: `backend/tmp/narrative-v8/castellon-audit-probe-3qpba9/`. Incluyen contexto, esquema, eventos, stderr depurado, código de salida, resultado y huellas de origen. Los archivos del canario original no cambiaron y el tour sigue parcial.

La repetición correcta es compatible con un fallo transitorio anterior, pero no prueba sobrecarga: el adaptador original descartó el diagnóstico y no se puede reconstruir un 429/5xx inexistente en los registros conservados. Una mejora posterior debe persistir errores depurados y distinguir fallos transitorios de autenticación, petición inválida o rechazo editorial antes de decidir un único reintento acotado.

## Excepción acotada: un rasgo documentado también cubre contraste

La comprobación del paquete anterior mostró una proposición admitida como `distinctive_trait` que ya comparaba el campanario separado con los integrados en una iglesia. Se conserva el rol principal y se permite una anotación opcional `secondaryContrast: { left, right }`, sin duplicar proposiciones, pasajes, fuentes ni corroboraciones.

- El esquema y el prompt solo solicitan esta anotación en la reparación existente cuando `priorityRoles` contiene `tension_or_contrast`. La primera curación y las reparaciones de otros roles conservan su contrato anterior.
- Solo una proposición admitida, de interpretación `direct` y rol `distinctive_trait`, puede aportar esa cobertura. Los dos fragmentos deben aparecer literalmente, en ese orden y separados por un conector comparativo explícito, tanto en su texto como en uno de sus propios pasajes validados. Se normalizan mayúsculas, diacríticos y espacios; no se infieren comparaciones ni se mezclan pasajes.
- La excepción solo cuenta cuando el contraste es el único rol pendiente. No rescata otros roles ausentes, no modifica la suficiencia V6 y no convierte «singular», «antiguo» o «restaurado» en tensión narrativa. Una anotación inválida se ignora sin rechazar un hecho que ya era válido.
- Si los roles principales ya estaban completos, se elimina la anotación redundante y se conserva el mismo dossier y su huella. El transporte al escritor reconstruye también la procedencia y la independencia de referencias con la misma finalización V8 que el constructor, evitando una discrepancia de huella en los nuevos dossiers con bibliografía.
- No se añaden rondas, búsquedas, cambios de modelo ni ampliaciones de presupuesto. El pequeño campo adicional puede consumir tokens en la segunda curación; no se promete coste idéntico.

Validación focalizada: 168 pruebas de diez suites y TypeScript sin errores. Incluye contrato de llamada simulado, comparación explícita y casos negativos, invariancia de dossiers completos, persistencia y reconstrucción del paquete para el escritor.

Prueba aislada con mini y capturas congeladas: `reference-probe-Dnk0q1`, una llamada nueva, 0,01160925 USD; gasto acumulado de los tres probes con LLM, 0,0379605 USD bajo el límite de 0,15 USD. El gate terminó con `writerReady=true`, nueve proposiciones y tres fuentes. No se descargaron de nuevo las referencias ni se generó el tour completo. **Este verde no demuestra por sí solo la nueva cobertura:** mini asignó además un rol principal de contraste y su anotación secundaria no coincidía literalmente con el texto de la proposición, por lo que fue descartada. La excepción se comprueba separadamente con evidencia controlada, sin relajar el validador para aceptar esa anotación.

Reproducción determinista adicional, sin API: reconstruir la respuesta guardada de `reference-probe-oSEllM` con sus capturas mantiene `writerReady=false`. Añadir únicamente `{ left: "está separada", right: "integrados en el mismo edificio eclesiástico" }` al rasgo comparativo existente produce `writerReady=true`. Se verificó igualdad exacta de las nueve proposiciones salvo esa anotación, de fuentes, pasajes y suficiencia V6. Una anotación que solo coincide con la cita vuelve a dejar el contraste pendiente. La huella del checkpoint original continúa siendo `37b2d355321a541e32dabea65c537fb11d0e9314f66984ea8339dbb47c7c3ef2`.
