# Goal narrativo: calidad suficiente, duración e inmersión

Activado el 2026-09-05. Objetivo completo acordado en la conversación: tour factual, inmersivo, completo y suficientemente bueno para revisión humana; no perfección ilimitada. Madrid es un caso de prueba, nunca una excepción en producción. Comprobar otra ciudad y evidencia escasa. RAG opcional, sin alterar infraestructura ajena. Se permiten métodos distintos si un experimento acotado los justifica.

## Presupuesto de esta ejecución

- El canario anterior `madrid-v8-sentence-local-final-20260905-2` terminó antes de activar el goal, a las 13:47:17 UTC. No hay generación pendiente que atribuir al presupuesto nuevo.
- Acumulado histórico inicial exacto del checkpoint: `3.0026370499999997` USD.
- Nuevo presupuesto autorizado: **5 USD adicionales**, sin obligación de agotarlo.
- Límite acumulado de nuevos experimentos: **8.00263705 USD**. Pasar siempre el gasto previo real y reservar antes de iniciar solicitudes.
- Si el saldo no alcanza para el siguiente experimento útil, finalizar las pruebas pagadas y entregar resultados; no solicitar ampliación ni declarar éxito artificial.
- Gasto de este goal al registrar este documento: **0 USD**.

## Plan de ejecución

1. Commit del estado narrativo actual, fuentes, tests y adaptadores necesarios. Excluir credenciales, archivos privados, ZIP, backups y cambios de infraestructura ajenos. Este commit es una referencia recuperable, no una declaración de calidad.
2. Referencia congelada: leer el último tour y separar defectos factuales materiales, falsas alarmas del auditor, problemas narrativos y duración. Reutilizar investigación y respuestas para evitar pagar por diagnosticar.
3. Experimentos pequeños: probar una modificación cada vez, con la misma evidencia, frente al contrato actual. Priorizar un briefing concreto que no fuerce hechos inadecuados para cada función narrativa y un auditor que distinga hechos de transiciones. Considerar escritura conjunta de varias paradas si demuestra menos repetición y llamadas, sin perder trazabilidad ni recuperación; no implementar arquitectura nueva antes de la prueba.
4. Mantener únicamente variantes que mejoren la lectura y conserven los controles de errores materiales. Las métricas del LLM son señales, no la verdad de referencia. Pequeñas desviaciones y preferencias no deben convertirse en bloqueos universales.
5. Canario final de Madrid sobre el código entregado y comprobación fuera de Madrid, priorizando una segunda ciudad real dentro del presupuesto. Validar evidencia escasa y modos RAG con pruebas gratuitas.
6. Entregar Markdown del tour y evaluación honesta con llamadas, coste, tiempo, duración, errores pendientes y recomendación comercial. No afirmar publicación automática ni ausencia absoluta de errores.

## Invariantes

Sin hardcodes de ciudades; preservar evidencia y permisos RAG, control de gasto, checkpoints y recuperación. No inventar ni repetir para rellenar; no compensar falta de narración con pausas ficticias. Usar duración total y por audio con márgenes razonables, no perseguir dos palabras. One-shot (orientativamente seis de siete paradas sin reparación material) está subordinado a calidad y fiabilidad. Ningún fallo recuperable destruye el borrador y ninguna aprobación del juez sustituye leerlo.

## Bitácora inicial

- Commit previo a experimentar: `ef55a94`, 53 archivos narrativos/dependencias/tests/documentación. No incluye cambios de infraestructura ajenos ni ZIP o diagnósticos privados.
- Último canario de referencia: `madrid-v8-sentence-local-final-20260905-2`, terminado `review_required`, 28 intentos HTTP (22 OpenRouter y 6 Qwen), 0,30319365 USD, aproximadamente 6 min 34 s. Es reanudación desde arco, no investigación nueva. Las siete narraciones se conservaron; ninguna reparación fue aceptada. Lectura íntegra realizada.
- Evidencia de falsa alarma: el auditor objeta «La cronología del edificio concentra buena parte de su sentido» porque «solo introduce una transición interpretativa». También hay objeciones más defendibles sobre intenciones y visibilidad. No todas son errores materiales.
- Primera prueba de calibración: el script impuso por error ZDR adicional al perfil existente; OpenRouter rechazó el enrutamiento antes de seleccionar proveedor. Se volvió a usar exactamente el proveedor del perfil existente, sin modificar producción, y el script ahora se detiene ante la primera respuesta no válida. El ledger conserva **0,271302 USD de exposición no verificada**, no cobro confirmado.
- Controles sintéticos (24 frases, cinco contextos, expectativas fijadas antes): baseline 23/24, candidato 24/24. Ambos detectaron los errores deliberados de fecha, sujeto, acceso, interior visible, testimonio histórico convertido en presente e instrucciones inyectadas. El baseline objetó una invitación sin hecho porque la clasificó `supported` sin cita. Coste válido: **0,023136 USD**. No es una estimación de precisión general.
- Reauditoría congelada del primer borrador de las siete paradas con el prompt candidato, mismo modelo y evidencia: objeciones **30→1** (Mayor 0→0, Oriente 7→1, Palacio 5→0, España 3→0, Cibeles 6→0, Alcalá 7→0, Colón 2→0). Coste: **0,09681975 USD**. Sin modificar los textos ni aplicar este prompt a producción. El archivo de resultados mantiene todos los dictámenes para revisión.
- **No considerar 30→1 como éxito automático**: el candidato trata expresiones como «pensado para ordenar miradas» y ciertas lecturas de visibilidad como inferencias. Hay que evaluar si son interpretaciones inocuas o hechos añadidos y comprobar errores deliberados dentro de contexto real antes de promoverlo. Los resultados del archivo congelado no tienen etiquetas humanas completas; su contador de discrepancias no mide exactitud.

### Saldo al cerrar esta tanda

- Consumo reportado nuevo: **0,11995575 USD**.
- Exposición conservadora adicional por el primer intento fallido: **0,271302 USD**.
- Total del presupuesto nuevo contabilizado: **0,39125775 USD**.
- Acumulado a pasar al próximo experimento: **3,3938948 USD**.
- Límite global sin cambios: **8,00263705 USD**; saldo conservador: **4,60874225 USD**.

Artefactos: `backend/tmp/narrative-audit-calibration-v8/goal-controls-20260905-1`, `goal-controls-20260905-2`, `goal-frozen-audit-20260905-1`. Guardar estos resultados; no repetir el mismo experimento como ceremonia.

### Siguiente hipótesis acotada

El primer writer recibe ya tarjetas distintas por beat y prohibición de repetir, pero produce muchas explicaciones genéricas. Probar un briefing que concrete apertura, episodio humano y contraste, evitando intenciones históricas y resúmenes redundantes. El mandato heredado de reutilizar dos palabras del puente parece favorecer cierres redundantes; verificar sus consumidores antes de cambiarlo. Considerar versión conjunta de varias paradas solo si supera al briefing mínimo.

Además, revisar duración completa: el reparto limita la narración a 30% del tour y 300 s por parada; el informe actual publica `geometry: null` incluso cuando hubo cálculo de caminata, y conserva la duración solicitada como estimación estructural. No dar por demostrado que 120 minutos estén cubiertos a partir de ese rótulo. Reutilizar y persistir las estimaciones reales existentes antes de inventar pausas o discutir una palabra.

## Segunda tanda: decisiones y evidencia

- Estrés con nueve hechos deliberadamente falsos insertados en tres narraciones reales: ambos auditores detectan los nueve. Se promueve el prompt calibrado de auditor, manteniendo parser, cobertura, citas obligatorias para hechos y controles de errores materiales. El fingerprint editorial incluye el prompt para invalidar aprobaciones anteriores. Validación: 44 tests en tres suites, sin cambios en modelos.
- Briefing concreto del escritor Mini, A/B en Palacio y Cibeles: no demuestra mejora suficiente. Aumenta cobertura y acerca longitudes, pero repite detalles y deja escapar «texto autorizado» dentro del audio. **No promovido**. Ocho llamadas, 0,104304 USD.
- Gemini 2.5 Pro con el mismo contrato/evidencia: Palacio 562 palabras y dos objeciones; Cibeles 431 y una. Mini baseline había producido 711/459 palabras y cero objeciones en esos ejemplos. Gemini es legible pero tampoco cumple duración, y su texto afirma que la estructura «garantiza» supervivencia al incendio. Dos ejemplos no establecen un ranking general. **No cambiar el modelo por defecto**. Cuatro llamadas (dos escritor y dos auditor), 58 s, 0,0852515 USD.
- Reporte de geometría: conservar la geometría ya calculada; en reanudación reconstruir solo si coincide exactamente el orden guardado. Markdown separa escucha estimada, caminata y traslado sin estimación; no atribuye automáticamente minutos faltantes a pausas. En referencia Madrid son 93 min estructurales (incluyen estancias previstas), 43,45 min de caminata, 33,375 min de narración y un traslado propio excluido. No son 120 min demostrados. Seis tests de renderizado y TypeScript pasan. No cambia selección de ruta ni objetivos guardados.
- La delegación del canario encontró límite de contexto antes de llamar Qwen; Codex aplicó únicamente el cambio acotado de reporte y usó sustituciones deterministas y validación del worker. No modificó infraestructura.

### Saldo actualizado, antes de nuevo canario

Consumo reportado nuevo: **0,39670925 USD** (incluye estrés: 0,087198 USD). Exposición no verificada conservada: **0,271302 USD**. Total contabilizado del goal: **0,66801125 USD**. Próximo acumulado: **3,670648299999999 USD**. Límite global **8,00263705 USD**, saldo conservador **4,33198875 USD**.

Artefactos nuevos: `backend/tmp/narrative-audit-calibration-v8/goal-audit-stress-20260905-1`, `backend/tmp/narrative-writer-briefing-pilot-v8/goal-writer-briefing-20260905-1`, `backend/tmp/narrative-writer-briefing-pilot-v8/goal-writer-gemini-20260905-1`.

## Canario calibrado y corrección de severidad

`madrid-v8-goal-calibrated-20260905-1`: siete borradores completos, 5 min 58 s de canario (361 s de comando), **31 llamadas** incluyendo arquitecto y siete reparaciones locales; **0,3580458 USD**. No mejoró el número de llamadas. Cuatro de siete borradores superaron la primera auditoría factual. Termina `review_required`: dos objeciones factuales finales, cinco desajustes de longitud y estilo repetitivo. La geometría ahora queda visible y no afirma 120 min medidos.

Causa adicional comprobada en código: todas las observaciones de la auditoría global, incluidas las `soft`, activaban reparación y se convertían a `hard/open` al construir los issues. Corrección mínima posterior a ese run: reparar solo globales `hard`, conservar las `soft` como `observation`, mantener los defectos factuales y booleanos globales bloqueantes. No se cambian umbrales de longitud ni la puerta de publicación. Fingerprint actualizado para impedir reusar aprobación con otra política. Tres regresiones en Toledo prueban soft sin reparación, hard con reparación y soft junto a error factual. **51 tests de workflow/política y TypeScript pasan**. Qwen produjo dos intentos defectuosos de tests; Codex corrigió y revisó esos tests antes de validar.

Validaciones gratuitas adicionales: **74 tests** de geometría, escasez, reconciliación y RAG (incluye Málaga) pasan. La búsqueda inicial del worker afirmó equivocadamente que no existían pruebas fuera de Madrid; la inspección literal mostró Málaga y la suite staged incluye Toledo. No se usó esa conclusión errónea para decidir.

Acumulado tras este canario: **4,0286941 USD**. Gasto nuevo reportado **0,75475505 USD**, exposición conservadora **0,271302 USD**, total contabilizado nuevo **1,02605705 USD**; saldo global **3,97394295 USD**. Próximo canario de política material con tope adicional de **0,90 USD**, sin resetear historial.

## Resultado de la política material

`madrid-v8-goal-material-20260905-1`: **22 solicitudes HTTP** (20 Mini/OpenRouter, dos Qwen local), **0,2805243 USD**, 5 min 1 s de canario. Incluye un reintento del arquitecto por ID de proposición ajeno al dossier; no se aceptó el ID inválido. Seis de siete primeros borradores pasan la verificación factual del LLM. Cinco no requieren ningún intento de reparación; Cibeles acepta su corrección, Alcalá conserva el original al rechazarse su candidato. Frente al run anterior: 31→22 llamadas y 7→2 reparaciones; el tiempo baja menos porque la primera auditoría global tarda 60 s. No atribuir toda diferencia a código: la generación nueva tiene variabilidad.

Lectura íntegra del Markdown realizada. Texto completo y trazable, pero continúa bastante abstracto y redundante (varias «salas abiertas», «capas» y recuentos repetidos). **No es aún una audioguía comercial publicada automáticamente**. 4030 palabras = 33,58 min de escucha estimada frente a objetivo narrado de 34 min; tres paradas fuera de la banda local. La ruta conserva 93 min estructurales y un traslado libre sin duración; no promete completar 120 min. Las observaciones leves siguen visibles, no desaparecen del informe.

Defectos materiales o diagnósticos pendientes:

1. **Calidad de las fuentes, no solo fidelidad del writer.** La narración de Plaza Mayor contiene 1560, respaldado por el artículo de Wikipedia consultado, mientras [Comunidad de Madrid](https://www.comunidad.madrid/noticias/2017/01/11/plaza-mayor-cuatrocientos-anos-historia-madrid) y la ficha municipal de patrimonio indican 1580. El artículo de Wikipedia incluso combina «En 1560, tras ... en 1561». No corregir con hardcode de ciudad ni ocultar la discrepancia. La investigación actual puede terminar después de la primera curación si writerReady y richnessReady, antes de buscar una fuente complementaria (`NarrativeResearchV8.ts`, primera curación tras capturas semilla). Hipótesis siguiente: corroboración acotada con fuente institucional y tratamiento explícito de conflictos, no más jueces sobre idéntica fuente.
2. **Falsa alarma determinista de entidad.** «Aquí la Puerta de Alcalá» se toma como un nombre entero no autorizado, aunque «Puerta de Alcalá» está autorizado. Investigar prefijos de discurso de forma genérica, con controles de nombres realmente ajenos; no lista de monumentos.
3. **Metáfora espacial ambigua.** El auditor de la reparación objeta «antes de abrirse hacia la plaza de Colón». Preferir transición explícita sin descripción física no acreditada. La objeción tardía se conserva; no se fuerza aprobación.
4. **Duración y voz.** La suma narrada es coherente con su presupuesto, pero las bandas locales y la estimación completa necesitan una política de producto coherente. No cambiar números para que este ejemplo pase. Pendiente contraste con otra ciudad y sin TTS medido todavía.

Nuevo acumulado: **4,309218400000001 USD**. Consumo reportado del goal **1,03527935 USD**; exposición conservadora **0,271302 USD**; contabilizado **1,30658135 USD**; quedan **3,69341865 USD** del límite global. Málaga `malaga-v8-goal-material-20260905-1` falló antes de generar, por core antiguo, sin coste nuevo. Se inicia `malaga-v8-goal-material-20260905-2` desde route conforme al camino de migración previsto, con límite acumulado **5,6092184 USD** (hasta 1,30 adicionales).

## Contraste real fuera de Madrid: Málaga

`malaga-v8-goal-material-20260905-2` terminó con siete guiones conservados, **9 min 51 s**, **0,4393683 USD**, **45 llamadas** (37 Mini, ocho Qwen; cuatro de las Qwen son reparaciones narrativas). Incluye reconstrucción del core/ruta desde candidatos antiguos e investigación nueva, no solo generación editorial: no comparar sus 45 llamadas directamente con las 22 del resume desde arco de Madrid. Cinco de siete borradores pasan primera verificación factual. Cuatro intentos de reparación, uno aceptado; los otros tres conservan el texto previo.

Resultado `review_required`. La suma es 3831 palabras (31,925 min estimados) frente a 4004 palabras objetivo (33,37 min). La geometría indica **75 min estructurales**, cero traslados libres. Por tanto, la incoherencia frente a 120 min solicitados **no es exclusiva de Madrid**; además la aproximación geométrica no modela desnivel ni acceso, relevantes en Gibralfaro. Este contraste desaconseja seguir ajustando mínimos de palabras como solución global. Se reproduce también la falsa alarma «Aquí la Alcazaba». Persisten intenciones no acreditadas, transiciones espaciales y mucha repetición explicativa. La investigación de esta ruta vuelve a aportar fuentes Wikimedia únicamente.

### Saldo consolidado de esta tanda

- Consumo reportado nuevo: **1,47464765 USD**.
- Exposición conservadora no verificada: **0,271302 USD**.
- Total contabilizado del presupuesto nuevo: **1,74594965 USD** de 5.
- Acumulado a pasar al próximo experimento: **4,7485867000000015 USD**.
- Límite global invariable: **8,00263705 USD**; saldo conservador: **3,25405035 USD**.
- No quedan llamadas de canarios o experimentos de esta tanda en ejecución.

El objetivo completo NO está logrado. Se ha reducido una causa real de reparaciones sin borrar observaciones ni cambiar infraestructura, pero no se justifica prometer publicación automática o duración de 120 min. Mantener Mini: el cambio a Gemini no resolvió el problema en el ensayo. Próximo trabajo útil: corregir la falsa entidad de inicio de frase con tests genéricos; decidir planificación agregada de duración con tiempos de movimiento fiables; contraste acotado de fuentes antes del writer. No endurecer todo ni repetir canarios sin una hipótesis distinta. RAG permanece opcional y sin cambios; en esta tanda se validó por tests, no por un A/B pagado on/off.

## Decisión de planificación temporal (continuación)

Prueba gratuita del `WalkingRouteService` existente, sobre las mismas coordenadas y orden: Madrid 66,32 min a pie + 49 min previstos en paradas = 115,32 min; Málaga 48,71 + 49 = 97,71 min. No es duración medida ni garantiza acceso/desnivel, pero usa grafo peatonal en vez de línea recta. Con la selección existente para 8/9 paradas, Madrid se alarga innecesariamente (154/162 min); Málaga alcanza 99,73/124,43 min. No subir el número de paradas globalmente.

Implementación decidida: reutilizar selector y servicio peatonal, probar inicialmente el máximo habitual de paradas; si queda corto, probar hasta dos opcionales más; si queda largo, reducir hasta el mínimo sin quitar esenciales. Conservar el candidato más próximo, parar si está dentro de ±10% de duración solicitada. Margen provisional de planificación, no banda de palabras ni garantía TTS. Calcular piernas por el mismo servicio para conservar tiempos y orden verificables; cache existente evita repetir trayectos. Siete minutos por estancia se mantienen como hipótesis existente, explícita en el informe. Ninguna pausa inventada para rellenar diferencias. Si no hay ajuste, informarlo; si el proveedor falla, conservar fallback geométrico identificado y no tratarlo como ruta comprobada. Reanudaciones con ruta guardada nunca cambian paradas ni objetivos narrados: solo pueden refrescar medición del mismo orden.

Sin servicio nuevo, sin modelo nuevo, sin cambios RAG, sin reglas de Madrid/Málaga en producción. Pruebas: ruta ya ajustada sin más búsquedas, ruta corta añade opcionales, larga reduce opcionales, esenciales se conservan, fallo de proveedor/cancelación, orden invariable al medir checkpoint.

Implementado y comprobado: `NarrativeWalkingPlanV8.ts` reutiliza selección y `WalkingRouteService`; los dos caminos del canario que seleccionan ruta lo llaman. La reanudación mide exactamente el orden guardado, sin reordenar ni cambiar targets narrativos. Geometría e informe indican `timingSource` y `durationFit`; una ruta con tiempo desconocido/fuera de banda no obtiene publicación automática, pero conserva su borrador para revisión. No se alteraron los mínimos de palabras.

Prueba en vivo del código nuevo con las mismas bolsas de candidatos: Madrid **7 paradas, 116 min estructurales**, Málaga **9 paradas, 125 min**. Ambas preservan todos los esenciales. El redondeo por pierna y del total explica la diferencia frente a las primeras sondas del recorrido completo. En Málaga se añaden Palacio de la Aduana y Cementerio Inglés mediante el selector existente, no mediante una lista especial. Ningún coste OpenRouter en esta continuación.

Falsa detección de nombres corregida solo para prefijos locativos al inicio de frase (Aquí/Allí/Hoy/Ahora); después se comprueba el nombre completo autorizado. Controles conservan como hard tanto nombres desconocidos de una palabra como nombres compuestos y acompañantes coordinados. 21 tests de protocolo pasan. Planificador, renderer, servicio peatonal y staged: **61 tests** y TypeScript pasan. El worker falló al crear los archivos por bucle de contexto; Codex implementó la pieza decidida y el worker validó. Cambios revisados; infraestructura ajena intacta.

Pendiente del goal: enriquecer/contrastar fuentes con coste acotado (ya hay una discrepancia histórica conocida), mejorar voz y transiciones sin forzar relleno, resolver política local frente a duración agregada y ejecutar el canario final del conjunto. Las sondas de ruta NO sustituyen ese canario. Presupuesto sigue en **1,74594965 USD contabilizados**, **3,25405035 USD restantes**; próximo `prior-spend-usd=4.7485867000000015`, límite global `8.00263705`.

## Corrección de diagnóstico y criterio de entrega

La hipótesis anterior de salida temprana con Wikipedia sola era incorrecta: `classifyEvidenceTierV8` la clasifica C, mientras la salida temprana exige A/B. Se retiró una búsqueda previa experimental antes de promoverla. El checkpoint real de Málaga muestra búsquedas completadas y resultados ajenos; una sonda local confirmó que SearXNG devuelve Palacio Real de Madrid para `site:malaga.eu Palacio Episcopal Málaga`. La Catedral tuvo cuatro capturas pero las páginas eclesiales de sacramentos no aportaron proposiciones históricas útiles. No confundir capturar con usar como evidencia. La conclusión del worker sobre admisión de dominios también era incorrecta: se admiten dominios oficiales registrados además de enlaces Wikimedia corroborados. No se cambia infraestructura ni se admite cualquier resultado. Se añaden al curador instrucciones de registrar discrepancias y omitir/atribuir datos disputados, y de no aceptar cronologías internamente imposibles.

Decisión previa al siguiente canario: conservar la banda estrecha como objetivo de escritura/diagnóstico, no como garantía de duración audible. Criterio provisional de entrega: cada audio dentro de ±20% de su objetivo (24–60 segundos para objetivos de 2–5 minutos), suma narrada dentro de ±10%, y ruta peatonal dentro de su banda ya definida. Los márgenes no son tiempo TTS medido. Mantener trazabilidad, hechos, integridad y auditoría global material. Las banderas mecánicas de estilo permanecen visibles, pero no bloquean por sí solas si la auditoría global no detecta un defecto material. Probar límites, acumulación de desviaciones y preservación de errores factuales antes del canario. No tocar objetivos guardados ni rellenar textos para alcanzar una cifra.

## Canario de entrega: resultado y nuevo diagnóstico

`madrid-v8-goal-delivery-20260905-1` rehízo core, ruta, investigación y narración desde candidatos guardados. **8 min 7 s de canario**, 489 s de comando; **0,4664874 USD**. Siete guiones, seis sin intento de reparación; Alcalá aceptó una corrección local. La fase editorial alcanza `ready_for_human_gate`. El proceso falla después porque el paquete del scorecard supera 180.000 caracteres; no hubo request HTTP de ese scorecard fallido ni coste/exposición adicional.

Causa comprobada: el proyector serializaba el dossier dos veces, volvía a copiar las proposiciones en los permisos y duplicaba el texto en `script.text` y sus frases. Corrección: conservar cada dossier completo una vez en `reviewEvidenceByStop`, permisos por IDs con propietario y todas las frases por su ID. Sin recortar evidencia ni aumentar el límite. Paquete real corregido: **120.606 caracteres, 160 frases y ocho fuentes**, conservando exactamente todos los pasajes. Doce tests de proyección/scorecard y TypeScript pasan. El canario ahora guarda además el Markdown completo, marcado como no aprobado, antes del juez final, para que un error tardío no lo sustituya por una página de fallo.

`madrid-v8-goal-delivery-20260905-2` reanudó **solo scorecard**: una llamada Mini, **0,11105325 USD**, 100,6 s de comando (92,4 s de LLM). No volvió a escribir ni auditar cada parada. Finaliza `request_changes`, con duración local/agregada y ruta aprobadas por la política, trazabilidad conservada y scorecard pendiente de cambios. **116 min estructurales**, 66 min a pie, **3.892 palabras / 32,43 min de voz** frente a 34 min objetivo. No son minutos medidos en campo/TTS.

Lectura íntegra de los siete guiones y del scorecard hecha. El texto es usable como borrador, pero sigue muy homogéneo y redundante: duplica cronologías y la condición de residencia oficial del palacio; aquí/espacio/poder/memoria dominan muchas paradas. El scorecard da 10 en exactitud y 7 en estilo; las siete objeciones son cambios de muletillas como «ayuda a entender»→«explica» o «Lo primero que se percibe»→«De entrada». No considero eso un diagnóstico suficiente de inmersión ni una garantía factual.

**Experimento de prompt del curador rechazado:** conserva la frase imposible «En 1560, tras haber ... en 1561» y genera falsas discrepancias a partir de sucesiones históricas compatibles. Se retiraron las dos instrucciones nuevas; no se promueven como arreglo. La fecha errónea sigue en el tour enlazado, señalada como defecto conocido. No tocarla mediante una regla de Madrid ni presentar el 10 del LLM como verdad. Próximo experimento útil: separar calidad de las fuentes/curación del juicio de fidelidad, y calibrar el último evaluador para defectos materiales frente a sustituciones cosméticas. No volver a mover bandas de palabras.

Validación de entrega: 17 tests de duración/publicación, 36 de staged/publicación tras actualizar las expectativas deliberadamente, 35 de investigación y 23 de política de issues pasan; TypeScript y diff-check pasan. Las pruebas incluyen pequeña desviación conservada como observación, déficit local material abierto, suma corta a pesar de todas las paradas dentro de margen, y defecto factual todavía abierto junto a desviación leve.

### Saldo tras ambos comandos

- Consumo reportado nuevo del goal: **2,05218830 USD**.
- Exposición conservadora previa no verificada: **0,271302 USD**.
- Total contabilizado nuevo: **2,32349030 USD** de 5.
- Próximo acumulado: **5,326127350000002 USD**.
- Límite global invariable: **8,00263705 USD**; quedan **2,67650970 USD**.
- No quedan canarios ni llamadas pagadas en ejecución. El objetivo completo sigue pendiente; no declarar éxito comercial por el estado editorial.

## Contraste de fuentes, escritura conjunta y verificador (continuación)

Se corrigió otra hipótesis: los eventos `reasoning=none` eran del core, no de toda la narración. Curador, arquitecto, writer y verificador Mini ya usaban low; el global usa high. No se presenta activar razonamiento como arreglo nuevo.

Sondas gratuitas, sin modificar infraestructura: Bing/SearXNG devuelve resultados de otra ciudad aun con nombre exacto y filtro de dominio; Google en un proceso aislado devuelve cero resultados y Brave 429. No se activan motores que no demostraron funcionar. El RAG y los contenedores siguen intactos. Esto limita la diversidad de fuentes: no implica que el pipeline descarte arbitrariamente capturas útiles.

Experimentos archivados en `backend/tmp`:

| Experimento | Resultado observado | USD |
| --- | --- | ---: |
| `goal-source-consistency-20260905-1` | Mini: 2 errores de cronología con prompt actual frente a 0 con candidato, en 5 controles sintéticos | 0,007446 |
| `goal-source-consistency-real-20260905-2` | El candidato Mini vuelve a aprobar la fecha contradictoria en las 24 frases reales de Plaza Mayor: el resultado sintético no generalizó | 0,013491 |
| `goal-grouped-writer-20260905-1` | Una escritura para tres paradas + tres verificaciones: 4 HTTP, 57,24 s, 1532/1770 palabras. Sigue repetitivo, conserva fecha errónea y Oriente salta indebidamente a España en vez del Palacio Real. NO promovido | 0,076770 |
| `goal-source-consistency-full-20260905-2` | GPT-5.4 medium, mismo texto/evidencia/prompt candidato: detecta cronología imposible y dos afirmaciones de 1790 sin soporte en los pasajes. 38,01 s | 0,078180 |
| `goal-source-consistency-full-controls-20260905-1` | GPT-5.4 medium: 29/29 controles de hechos válidos, errores materiales, interpretación, acceso, puentes e inyección; 6 llamadas, 37,94 s | 0,072695 |

Las reservas rechazadas antes del HTTP (`goal-source-consistency-real-20260905-1` y `goal-source-consistency-full-20260905-1`) no consumieron ni dejaron exposición. La reserva Full usa el máximo conservador de precios y bytes como límite superior de tokens, no una predicción de factura. No se debilitó el SpendGuard para enviarla.

Decisión: probar en canario `qwen38_hybrid.auditor_b = openai/gpt-5.4`, medium, máximo 8000, manteniendo Mini para escribir y Qwen para reparar. Añadir al verificador la comprobación genérica de contradicciones internas y aclarar que etapas históricas sucesivas no son contradicción. Ningún nombre/fecha especial en código; ninguna llamada adicional, ningún cambio de seguridad/parser/reintentos. El beneficio demostrado es detección factual, NO one-shot del tour ni mejor inmersión todavía. Los demás perfiles mantienen sus modelos. La huella de reanudación incluye perfil completo y prompt, por lo que cambia con esta política.

Qwen implementó tres archivos; Codex revisó su diff. Pasan 14 tests compactos, 72 pruebas de runtime/staged/core/contrato inicialmente válidas y los cinco tests de contrato tras conservar cobertura tanto del límite Mini de 2000 como del Full de 8000; TypeScript pasa. La primera ampliación mecánica del test dejó por error la expectativa vieja para Full; se corrigió esa fila explícita, no el algoritmo.

Saldo antes del siguiente canario: consumo reportado nuevo **2,30077030 USD**, exposición previa **0,271302 USD**, contabilizado **2,57207230 de 5 USD**, restante **2,42792770 USD**. Acumulado **5,574709350000004**, techo global **8,00263705**. Se inicia `madrid-v8-goal-verified-20260905-1` desde arco, reutilizando evidencia pero regenerando narración y verificaciones con el código nuevo. Su coste NO está incluido aún en este saldo; no iniciar otra prueba pagada hasta consolidarlo.

## Resultado Full y corrección de selección de parches

`madrid-v8-goal-verified-20260905-1` terminó: **9 min 22 s** (564,54 s comando), **1,04984925 USD**, **24 llamadas**: nueve Mini (arquitecto, siete escritores, global editorial), once Full (siete verificaciones + cuatro de candidatos), cuatro Qwen locales. Investigación reutilizada: no comparar este coste con un canario que la rehace. Siete textos conservados, 3747 palabras, ruta peatonal 116 min. Tres de siete pasan primera verificación; cuatro reparaciones propuestas, las cuatro rechazadas. `review_required`; el scorecard final no se llama por objeciones materiales abiertas. No hay publicación automática ni ahorro demostrado por cambiar todos los verificadores a Full.

La detección Full es útil, pero no prueba mejora comercial completa. Plaza Mayor: Qwen recibe expresamente el motivo de cronología imposible y aun así reordena la frase conservando 1560. Ese parche DEBE rechazarse. El problema no es que se pierda el diagnóstico entre agentes: está en `diagnostics.private.json`, `.privateDiagnostics` fase `repair`, `.input.reasons`. Entrada real de reparación: `editNarrativeSegmentsV8` en `NarrativeSegmentEditV8.ts:72`, no un archivo `NarrativeSentenceLocalEditV8.ts` (no existe). El worker no encontró la función; Codex la verificó con fuente literal. Puede reproducirse la petición con `plan`, `draft`, `targets`, `reasons`, `writerEvidencePassages`, `discrepancies`, `limits`, `language` y `bridgeEvidence` congelados. No existe un replay específico comprobado; no inventar su ruta.

Otros tres rechazos revelaron problemas de selección, no correcciones necesariamente malas:

- Colón: todas las objeciones corregidas, pero 539→525 palabras se rechazaba con la antigua banda estrecha; objetivo 570.
- España: objetivos corregidos; el segundo auditor descubre en una frase **no editada** el superlativo «los edificios más altos» frente a «algunos de los más altos».
- Alcalá: objetivo corregido; aparece una objeción nueva sobre tráfico en una frase **no editada**.

Decisión implementada: para edición estrictamente por frases, los objetivos deben quedar soportados, todas las otras frases deben permanecer idénticas, sin IDs falsos, repetición nueva, pérdida de cobertura ni informes sin verificar. Aceptar esas correcciones no aprueba el relato: conservar íntegro el informe reconciliado del candidato y sus descubrimientos tardíos, manteniendo `draft_review_required` si quedan hechos abiertos. La comparación global conservadora permanece para la API antigua sin objetivos por frase. Usar el `localPassed` de la política temporal ya existente para admitir pequeñas variaciones; fuera de esa banda sigue el control de no empeorar. La suma narrada y la ruta permanecen bajo su evaluación de publicación, sin cambiar umbrales.

Cambios en `NarrativeEditDecisionV8.ts`, sus tests y un test de workflow; huella `staged-v8-8-scoped-edit-delivery` para invalidar reanudaciones de otra política. Qwen implementó; Codex revisó diff y corrigió el caso `targetWords` opcional mediante sustitución exacta. **62 tests** de decisión/staged/publicación, TypeScript y diff-check pasan. La integración demuestra que se conserva la corrección, la objeción tardía continúa abierta tras reanudar y no hay llamadas extra.

Replay gratuito y de solo lectura de los cuatro candidatos REALES: Mayor sigue rechazado; España, Alcalá y Colón se aceptan. Sus candidatos conservan respectivamente 1, 1, 1 y 0 objeciones. No se modificaron los checkpoints ni se reescribió el tour histórico para aparentar éxito. Es un replay de la decisión, NO un nuevo canario del código final.

### Saldo vigente y siguiente frontera

- Consumo reportado nuevo: **3,35061955 USD**.
- Exposición conservadora histórica sin verificar: **0,271302 USD**.
- Contabilizado: **3,62192155 de 5 USD**, restante **1,37807845 USD**.
- Próximo acumulado: **6,624558600000001**; techo global **8,00263705**.
- No queda ninguna petición pagada en ejecución. No resetear presupuesto.

Pendiente: resolver la reparación que conserva un dato declarado incierto (primero replay Qwen gratuito, no otro canario a ciegas), decidir si mantener el verificador Full según valor/coste total, mejorar inmersión sin más relleno, comprobar el conjunto fuera de Madrid y ejecutar el canario del código entregado dentro del saldo. Los outputs Full llegan a 5979 tokens incluyendo razonamiento; bajar arbitrariamente su tope a 4000 para acomodar reservas sería una falsa economía. El tour más reciente es un borrador con errores señalados, no el entregable final aprobado. El goal sigue activo; no se cumple por tests ni por proceso terminado.

## Reparación reproducida y último canario previsto

Turno anterior clasificado como progreso: nuevo verificador evaluado en canario y corrección real de selección de parches, con replay y tests. Estado y saldo releídos antes de actuar.

Nuevo replay local reproducible: `backend/scripts/validation/narrative-local-repair-replay-v8.ts`, usa la misma función de producción y entradas congeladas, sin tocar checkpoints ni permitir solicitudes pagadas. La modificación de prompt es genérica: resolver el defecto indicado en `reasons`, no solo reformular; omitir el detalle cuestionado por contradicción de fuente, conservando lo respaldado, sin inventar un sustituto. La frase original que repetía 1560 se transforma ahora en «Felipe II encargó a Juan de Herrera el proyecto de remodelación de la plaza». También corrige los otros dos objetivos. 512 palabras, alcance protegido y contrato validados; coste cero. Archivo `goal-repair-source-20260905-1`.

Dos replays gratuitos de Málaga (`goal-repair-theater-20260905-1`, `goal-repair-bridge-20260905-1`) conservan el modelo de Vitruvio sin atribuirle intención inventada, y anuncian La Malagueta sin prometer localización/visibilidad no respaldada. Son correcciones revisadas, no canarios de nueve paradas. La lógica no contiene nombres/fechas particulares. Huella `staged-v8-9-repair-reasons`.

Alternativa más barata contrastada con la misma entrada de Plaza Mayor: Mini high agotó 8000 tokens solo en razonamiento y no devolvió JSON (0,0403695 USD); Mini medium terminó pero volvió a aprobar la fecha contradictoria (0,018585 USD). No se promueven esos cambios ni se aumenta el tope para forzar el intento truncado. Full permanece para el siguiente canario, sin afirmar que sea una solución óptima de coste.

Saldo: **3,40957405 USD reportados + 0,271302 USD de exposición previa = 3,68087605 USD contabilizados**, quedan **1,31912395 USD**. Próximo acumulado **6,683513100000001**, techo global **8,00263705**. No hay solicitudes pagadas activas. Siguiente acción decidida: un canario Madrid del conjunto desde arco con evidencia congelada y todas las escrituras/verificaciones nuevas; techo global intacto. No reservar más allá del saldo ni ocultar una interrupción de presupuesto si el máximo conservador impide una llamada tardía.

## Límite alcanzado para continuar la verificación

`madrid-v8-goal-final-20260905-1` ejecutó 19 llamadas (9 Mini, 8 Full, 2 Qwen), **0,78803625 USD**, **396,03 s de comando**. Siete primeras escrituras guardadas; una primera verificación factual aprobada (Oriente). **La reparación de Plaza Mayor se verificó y aceptó en vivo**: omite la fecha incierta, corrige el alcance de las arcadas y limita el puente a la siguiente parada. La reparación siguiente, Palacio Real, quedó pendiente porque la reserva máxima de Full excedía el saldo. No salió ese HTTP ni quedó exposición adicional. El proceso terminó con exit 1; no hay handles pagados activos.

Saldo definitivo de esta tanda: **4,19761030 USD reportados + 0,271302 USD de exposición conservadora = 4,46891230 USD contabilizados de 5**, quedan **0,53108770 USD**. Acumulado **7,471549350000001**, techo global **8,00263705**, reservas cero. Se detienen pruebas pagadas: no hay saldo para la siguiente verificación bajo el contrato probado; las alternativas Mini ensayadas no justifican sustituirla para hacer pasar el canario. Primera aparición del impedimento de presupuesto para continuar esta validación; no cumple todavía el umbral de tres turnos para marcar el goal blocked.

Trabajo gratuito posterior: el fallo dejó `tour.md` como página de error aunque los siete guiones seguían en checkpoint. Se añadió `renderNarrativeCheckpointPreviewV8` y su llamada en `onCheckpoint`: escribe una vista siempre no aprobada cuando el conjunto está completo; si una edición está pendiente muestra la versión anterior, no el candidato sin verificar. Rechaza conjuntos incompletos, duplicados o ajenos. No altera el estado editorial ni el código de salida. Quince tests de Markdown, TypeScript y diff-check pasan; los 85 de edición/staged habían pasado antes. El primer patch semántico no encontró su ancla; se inspeccionó la fuente y se aplicó la inserción exacta. Se corrigió un import omitido en los tests del worker y se revisó el diff.

Se usó el renderer nuevo sobre el checkpoint real, creando **otro archivo** `tour-recovered.md` con escritura exclusiva, sin sobrescribir `tour.md` ni el checkpoint. Tiene siete guiones y **4033 palabras**, aproximadamente 34 minutos de voz; ruta 116 minutos estructurales. Conserva la corrección aceptada de Mayor y el Palacio anterior por estar el parche nuevo pendiente. Es una recuperación de artefacto, no un canario completado. Los siete textos y la corrección aceptada fueron leídos; la repetición y las restantes objeciones impiden afirmar calidad comercial autónoma.

Informe y auditoría de requisitos: `docs/operations/narrative-goal-result-20260905.md`. No se declara el goal completado. Pendientes de fondo: coherencia de evidencia en transiciones, inmersión y finalización factual del conjunto; canario multicidad actual no ejecutado. No pedir más presupuesto ni gastar el residuo en ensayos sin hipótesis útil. La única variación posterior al último canario es conservación del Markdown, probada mediante tests y recuperación real; no se presentan esas comprobaciones como otra generación completa.

## Segunda comprobación del impedimento de presupuesto

En el siguiente turno se confirmó mediante el último evento de progreso: acumulado 7,471549350000001 USD, reservas cero y saldo 0,53108770 USD. No aparecen procesos Node de canario, calibración ni replay local activos. El informe (12635 bytes) y el tour recuperado (27458 bytes) siguen disponibles. No se lanzaron llamadas pagadas ni se cambió el modelo o el contrato para eludir la verificación pendiente. Segunda aparición consecutiva del mismo impedimento; el objetivo permanece sin completar y aún no se marca blocked. No hay nueva evidencia de calidad que justifique cambiar el veredicto entregado.

## Tercera comprobación: objetivo bloqueado, no completado

El turno anterior fue una comprobación sin progreso hacia la calidad solicitada, no una espera de proceso vivo. Se revalidó mediante el worker determinista: `review.json` sigue en `failed` por `shared narrative spend cap exhausted before attempt`; el último evento mantiene saldo 0,53108770 USD y reservas cero; no hay procesos Node de canario/calibración/replay activos. Tercera aparición consecutiva del mismo límite. Las alternativas gratuitas y de menor coste ya ensayadas no demuestran una vía para finalizar la verificación pendiente bajo el presupuesto autorizado. No se realizan más cambios especulativos ni llamadas pagadas. Se marca el objetivo bloqueado, sin afirmar éxito ni solicitar ampliación. Se conservan el informe y el Markdown provisional con las limitaciones previamente documentadas.
