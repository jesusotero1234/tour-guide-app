# Ejecución: regla de fechas con DeepSeek

Fecha: 16 de septiembre de 2026. Resultado: **integración de la regla preparada; comparación de DeepSeek no aprobada**.

La prueba anterior de Madrid mostró que se podía obtener una buena adaptación mediante instrucciones y revisión. Esta repetición más amplia muestra que **todavía no es consistente**. Se ejecutó el [plan](plan-reutilizar-regla-fechas-deepseek-20260916.md) hasta su condición de aceptación editorial, que no se superó. No se han generado audios nuevos ni cambiado el redactor por defecto.

## Implementación terminada

La [regla](regla-editorial-fechas-audioguias.md) contiene un bloque canónico de instrucciones; se carga una vez al preparar cada conjunto de materiales. Se incluye en paradas, bienvenida y sus auditorías. La bienvenida del piloto recibe también el historial acotado de aperturas y cierres. Esa memoria no contiene necesariamente todas las fechas pronunciadas: no equivale a una planificación cronológica global.

La huella SHA-256 de las instrucciones acompaña al estado guardado. Se rechaza mezclar políticas entre paradas. La ejecución sigue exigiendo un directorio nuevo: no se presenta una salida antigua como regenerada con la nueva regla.

**Estado por defecto: desactivada.** Para una ejecución interna, `NARRATIVE_TEMPORAL_RULE=selected` activa la regla; `off` o ausencia conservan el comportamiento anterior. Un valor desconocido falla de forma explícita. No se ha añadido una preferencia al producto ni modificado el entorno de la app. La narración de la app sigue utilizando Astra; DeepSeek escribió las muestras del experimento.

La compilación incluye los recursos editoriales necesarios y los procesos buscan primero esos recursos distribuidos. Se ajustó el contexto de construcción del contenedor para incluir el documento canónico, con exclusiones específicas de dependencias, temporales, datos y archivos de entorno. No se construyó ni desplegó una imagen en esta sesión.

## Experimento ejecutado

- Madrid: cinco paradas del ensayo existente.
- Barcelona: muestra compacta de plaza de Cataluña, catedral de Santa Eulalia y Santa María del Mar.
- Sevilla: muestra compacta de Maestranza, San Telmo y plaza de España.

Las dos últimas mantienen el orden relativo de recorridos guardados; no se volvieron a validar itinerarios ni se presentan como tours comerciales completos. Cada muestra incluye bienvenida. Se fijaron 70–100 palabras para la bienvenida y 100–140 por parada, además de los hechos esenciales, antes de llamar al modelo.

Para cada ciudad se generaron control y variante con la regla, con el mismo modelo y evidencia. Se utilizó `deepseek-flash`, razonamiento desactivado y temperatura cero. Se hizo como máximo una corrección por variante; no hubo correcciones manuales del texto ni un segundo intento de reparación.

La regla no cambió durante el ensayo. Tras comprobar que la primera generación apenas seleccionaba fechas, se añadió a la corrección un presupuesto experimental de menciones completas: 1–4 para Madrid y 1–3 para cada muestra corta. Es una aclaración posterior, registrada: los resultados corregidos miden **regla más objetivo concreto**, no cumplimiento a la primera de una regla genérica.

## Resultados

En doce ejemplos controlados, DeepSeek distinguió correctamente **12 de 12** relaciones temporales: permiso frente a comienzo, ocupación parcial frente a finalización, apertura con iglesia inacabada, retroceso entre reinados, aproximación frente a precisión y una fecha histórica correcta frente a otra alterada. Los ejemplos esperados se fijaron antes de enviar la solicitud. Es un diagnóstico acotado, no una tasa de exactitud general.

| Tras la única corrección | Años completos, control | Años completos, regla | Palabras, control / regla | Aceptación |
| --- | ---: | ---: | ---: | --- |
| Madrid | 12 | 12 | 662 / 695 | No: la variante conserva 12 menciones frente al objetivo de 1–4. |
| Barcelona | 7 | 3 | 587 / 535 | No: mejora la selección, pero ambas exceden la longitud por parada. |
| Sevilla | 22 | 17 | 652 / 584 | No: exceso de longitud y fechas, con relaciones históricas pendientes. |

El recuento incluye repeticiones y años escritos con palabras; no suma siglos, reinados o intervalos. La validación inicial de estructura no era una aprobación editorial. Una salida de Sevilla fue rechazada porque su registro de decisiones citaba un fragmento que no coincidía literalmente con el guion; su consumo está incluido.

Problemas concretos que sobrevivieron a la corrección:

- En Sevilla, la bienvenida vuelve a sugerir que un mismo edificio pasó de cuadrado a elíptico. El material dice que la plaza cuadrada se desmontó y se hizo otra circular en un lugar cercano.
- En la Maestranza, se liga la reanudación tras la pausa de 1766–1784 con la llegada de Gaspar San Martín. El dossier sitúa su dirección en 1794: son hitos distintos.
- Las tres paradas de Barcelona con regla quedaron en 148, 153 y 150 palabras, frente al máximo fijado de 140. Madrid cumplió longitud, pero la reducción solicitada no ocurrió.

No se han relajado esos criterios para declarar un resultado satisfactorio.

**Consumo estimado: 0.023258 USD**, 13 llamadas: una de casos temporales, seis primeras versiones y seis correcciones. Incluye la salida descartada. Se aplicaron las [tarifas oficiales](https://api-docs.deepseek.com/quick_start/pricing/) consultadas ese día al consumo devuelto. El control de gasto existente limitó esta ejecución a 2 USD; no quedaron reservas abiertas. No incluye trabajo de Codex, cuota de otros modelos, infraestructura o impuestos; no es una factura.

Las solicitudes incluyeron la instrucción y ejemplo JSON que pide la [documentación del proveedor](https://api-docs.deepseek.com/guides/json_mode/). El formato correcto por sí solo no garantiza seguir la intención editorial.

## Fuentes y créditos

Se reutilizaron las muestras revisadas de Madrid y pasajes de Wikipedia de dos investigaciones guardadas. Se excluyeron la prensa y las webs institucionales de esos dos conjuntos; no se asume que la admisión de Wikipedia autorice material de otros editores. También se excluyó, antes de las llamadas, un pasaje discordante de Santa María del Mar con otra cronología de bóveda y primera misa.

Créditos: colaboradores de Wikipedia; adaptación con IA y revisión de Codex, bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es). Cambios: selección de pasajes y redacción de dos variantes temporales. Los [créditos de Madrid](madrid-austrias-escucha-deepseek-20260916.md#guion-y-créditos) se conservan. Las seis bases adicionales son:

- [Plaza de Cataluña](https://es.wikipedia.org/wiki/Plaza_de_Catalu%C3%B1a); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Plaza_de_Catalu%C3%B1a&action=history).
- [Catedral de la Santa Cruz y Santa Eulalia (Barcelona)](https://es.wikipedia.org/wiki/Catedral_de_la_Santa_Cruz_y_Santa_Eulalia_(Barcelona)); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Catedral_de_la_Santa_Cruz_y_Santa_Eulalia_(Barcelona)&action=history).
- [Basílica de Santa María del Mar](https://es.wikipedia.org/wiki/Bas%C3%ADlica_de_Santa_Mar%C3%ADa_del_Mar); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Bas%C3%ADlica_de_Santa_Mar%C3%ADa_del_Mar&action=history).
- [Plaza de toros de Sevilla](https://es.wikipedia.org/wiki/Plaza_de_toros_de_Sevilla); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Plaza_de_toros_de_Sevilla&action=history).
- [Palacio de San Telmo](https://es.wikipedia.org/wiki/Palacio_de_San_Telmo); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Palacio_de_San_Telmo&action=history).
- [Plaza de España (Sevilla)](https://es.wikipedia.org/wiki/Plaza_de_Espa%C3%B1a_(Sevilla)); [historial de colaboradores](https://es.wikipedia.org/w/index.php?title=Plaza_de_Espa%C3%B1a_(Sevilla)&action=history).

Los ficheros originales de investigación, sus huellas y los pasajes exactos usados están enlazados en el paquete de casos. No se realizó una nueva revisión jurídica ni una nueva investigación integral de esas ciudades.

## Verificación del código y límites

- 37 pruebas pertinentes pasaron, reutilizando los resultados de cuatro suites y repitiendo la suite afectada por el último cambio. Cubren carga, huella, activación explícita, control sin regla, rechazo de mezclas y llegada de las instrucciones a redactor/auditor y estado guardado.
- Compilación de backend y ejecutable de generación correcta; carga del recurso distribuido comprobada fuera de los archivos fuente.
- Archivos de composición analizados y rutas de construcción comprobadas. El comando de validación de Compose no está disponible en la interfaz local Docker/Podman; no se declara verificación de una imagen o de un contenedor.
- Una prueba adicional existente de `CodexTourGenerator.test.ts` falla porque espera rechazar inglés, mientras el validador actual ya admite varios idiomas. Se comprobó que ese validador coincide con HEAD; no se modificaron ni la prueba ni su lógica para ocultar el fallo. No se declara toda la batería del repositorio en verde.

## Estado del plan

T1–T3 están implementadas y verificadas. T4 se ejecutó, pero **no superó la aceptación**. T5 —nuevos audios y escucha— y T6 —cambio de redactor en la app— permanecen pendientes por esa condición del plan. No falta un permiso del usuario para activar: falta que la solución supere los criterios acordados.

El siguiente trabajo es un ensayo distinto de contrato de redacción, antes de más audio: comprobar si pedir transformaciones localizadas y validadas reduce la tendencia a copiar el texto fechado. Debe fijar previamente sus límites y un caso nuevo de comprobación; esta propuesta no se ha ejecutado ni equivale a una reparación adicional de las muestras rechazadas.

## Evidencia guardada

- [Protocolo previo](/home/jesusotero/coding/tour-guide-app/backend/tmp/temporal-rule-pilot-20260916/protocol.json) y [casos y fuentes](/home/jesusotero/coding/tour-guide-app/backend/tmp/temporal-rule-pilot-20260916/cases.json).
- [Primera revisión independiente](/home/jesusotero/coding/tour-guide-app/backend/tmp/temporal-rule-pilot-20260916/initial-review.json).
- [Evaluación, métricas y consumo de todas las llamadas](/home/jesusotero/coding/tour-guide-app/backend/tmp/temporal-rule-pilot-20260916/evaluation.json).
- [Ejecutor local y su comprobación](/home/jesusotero/coding/tour-guide-app/backend/tmp/temporal-rule-pilot-20260916/run.cjs).
- [Nota del fallo de prueba ajeno al cambio](/home/jesusotero/coding/tour-guide-app/backend/tmp/temporal-rule-pilot-20260916/baseline-test-note.json).

La carpeta de ejecución conserva solicitudes, respuestas y correcciones completas. Es material local fuera de Git; debe conservarse para reproducir la inspección y mantener estos enlaces. El código de integración y la regla sí quedan en el repositorio.
