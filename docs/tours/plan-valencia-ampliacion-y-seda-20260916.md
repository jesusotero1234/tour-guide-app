# Plan: completar Valencia con imágenes y crear Valencia de la seda

Fecha: 16 de septiembre de 2026. Estado: **T1–T6 completadas; ambas entregas locales disponibles. Valoración del usuario pendiente**.

## Resultado que buscamos

Entregar primero una versión ampliada de **Valencia: edificios que cambiaron de oficio**, con fotografías visibles y audio por parada. Después producir **Valencia de la seda: la ciudad que tejía riqueza** con el mismo método de DeepSeek que ya funcionó. El usuario aceptó esta dirección, pidió preparar el plan primero y autorizó después su ejecución.

Cada entrega debe poder abrirse, verse y escucharse: una presentación local con el orden de las paradas, una foto real por lugar, audios individuales, audio completo, guion y créditos. El recorrido tendrá su distancia y tiempo estimados, distinguiendo caminar de escuchar. La presentación mínima será un documento con imágenes y reproductores; se reutilizará una vista local existente si hace falta para que esos medios funcionen.

## Base y decisiones

- Reutilizar el [proceso práctico aceptado](plan-practico-tours-deepseek-20260916.md) y la [muestra de Valencia](valencia-deepseek-practico-escucha-20260916.md). DeepSeek redacta; Codex selecciona hechos y revisa. Las fechas se conservan cuando ayudan, sin cuotas de años ni palabras.
- Conservar las dos narraciones y sus audios aceptados. Cambiar una pieza únicamente si el nuevo recorrido afecta a su texto o aparece un error concreto. La bienvenida sí necesita actualizarse: anuncia solo dos edificios.
- Una historia central por parada, sustentada en tres a cinco hechos útiles y dos ejemplos completos de estilo. Corregir problemas históricos o de comprensión; evitar rondas por preferencias menores de redacción.
- Incorporar fotografías reales que permitan reconocer cada lugar. La selección automática de Commons aporta candidatas; la identidad, el encuadre y la carga de la imagen se comprueban antes de darla por entregada.
- Preparar ambos tours como entregas locales. La incorporación al catálogo y el cambio del narrador por defecto de la app quedan para una entrega posterior.

## Primera entrega: edificios que cambiaron de oficio

Objetivo inicial: **cuatro paradas**, aprovechando las dos existentes. El orden siguiente es un inventario, no un itinerario validado.

| Lugar | Trabajo previsto |
| --- | --- |
| Palacio de la Generalidad | Conservar el episodio aceptado y añadir una fotografía visible y comprobada. |
| Torres de Serranos | Conservar el episodio aceptado y añadir una fotografía visible y comprobada. |
| Colegio de San Pío V / Museo de Bellas Artes | Candidato: comprobar en las fuentes guardadas sus cambios de uso y elegir un episodio distinto al de Serranos. |
| Palacio de Dos Aguas | Candidato: comprobar la transformación de residencia en sede de museo y su relación con la colección. |

Los dos candidatos aparecen en la [investigación guardada de Valencia](../../backend/tmp/narrative-v8/pilot-spain-20260912-valencia-recovery/checkpoint.private.json), pero todavía necesitan selección y admisión para este tour. Si alguno no aporta suficiente historia, imágenes utilizables o un paseo razonable, sustituirlo por otro candidato documentado. Si no hay alternativa adecuada, entregar una ampliación más corta y explicar la decisión.

### T1. Cerrar episodios y recorrido

- [x] Preparar las fichas de las nuevas paradas con episodio, hechos, pasajes, fuente y condiciones de uso; excluir contradicciones prescindibles y resolver las que afecten al episodio.
- [x] Comprobar coordenadas, puntos donde detenerse y recorrido peatonal con el servicio existente. Priorizar exteriores observables, conservar el orden relativo palacio–Serranos si sigue siendo razonable y registrar distancia y tiempo estimados.

**Verificación:** cada parada tiene una historia respaldada y un punto accesible para escuchar; revisar la ruta sobre el mapa. Si el servicio falla, registrar que el paseo sigue pendiente de comprobar y entregar solo la muestra de contenido, sin llamarla tour completo. **Dependencias:** ninguna. **Alcance:** pequeño; fichas e itinerario dentro de una carpeta nueva de ejecución local.

### T2. Completar la parte visual

- [x] Comprobar las [candidatas de las dos paradas originales](../../backend/tmp/valencia-deepseek-practico-20260916/photo-candidates.json) y buscar las de las nuevas con el buscador existente. Elegir una foto reconocible por parada, con autor, enlace de origen, licencia y cambios realizados, si los hay.
- [x] Abrir la presentación y comprobar que cada imagen se ve junto al nombre correcto y su crédito. Indicar si es una fotografía actual o histórica cuando esa diferencia afecte a la narración.

**Verificación:** inspección visual real del edificio y de la presentación; no basta el nombre del archivo. Si una imagen falla, usar otra candidata admitida. Un enlace de reserva ayuda, pero una parada sin imagen visible mantiene esta tarea pendiente. **Dependencias:** T1 para la lista definitiva; la revisión de las dos fotos existentes puede empezar antes. **Alcance:** pequeño; selección de imágenes y documento de escucha.

### T3. Escribir y revisar las piezas necesarias

- [x] Generar con DeepSeek las nuevas paradas, de una en una y con el contexto del recorrido; revisar los textos completos contra sus pasajes. Pedir como máximo una corrección concreta por pieza si hace falta.
- [x] Escribir la nueva bienvenida al final y revisar las transiciones del conjunto. Registrar qué textos se conservaron, cuáles generó DeepSeek y cualquier retoque humano.

**Verificación:** se entiende qué ocurrió y qué cambió, sin diálogos, motivos ni escenas inventadas; la bienvenida coincide con el tour final. **Dependencias:** T1; T2 puede avanzar en paralelo. **Alcance:** pequeño; reutilizar el ejecutor del piloto, sus ejemplos, control de gasto y registros.

### T4. Entregar Valencia ampliada para ver y escuchar

- [x] Generar solo los audios nuevos o modificados con la misma voz; reutilizar los capítulos conservados y ensamblar el recorrido final.
- [x] Entregar una presentación con fotografías, capítulos y créditos, más el audio completo, guion y recorrido. Registrar llamadas, coste estimado e intervención editorial real.

**Verificación:** reproducir todos los capítulos y la unión; comprobar orden, duración, correspondencia con el texto enviado al sintetizador, volumen utilizable e imágenes cargadas. La aceptación técnica y tu valoración como oyente se registran por separado. **Dependencias:** T2 y T3. **Alcance:** pequeño; audios y presentación local, sin una nueva interfaz de aplicación.

**Punto de entrega:** Valencia ampliada queda disponible antes de iniciar el audio del segundo tour. Cualquier comentario que llegue se aplica a problemas concretos; no se presupone una nueva aprobación obligatoria entre tareas cuando se autorice ejecutar este plan.

## Segunda entrega: Valencia de la seda

La pregunta que une el tour será: **¿cómo se conectaban el trabajo de los artesanos y el negocio de los comerciantes?** Candidatos iniciales: Lonja, Colegio del Arte Mayor de la Seda y Palacio de Tamarit, con Velluters como contexto del paseo. Son lugares para investigar, no episodios ya admitidos. El Museo de la Seda y el Colegio se tratarán como un mismo lugar, evitando duplicar la parada.

La [propuesta anterior](propuestas-tours-historicos-20260916.md) conserva el punto de partida de Visit València. La ejecución comprobará la evidencia específica y las condiciones de uso de cada material. Empezar con tres paradas; añadir una cuarta solo si aporta un episodio y un lugar distintos.

### T5. Preparar el tour de la seda

- [x] Seleccionar los episodios, resolver fuentes y usos, y preparar una ficha breve por parada. Buscar cambios, necesidades o decisiones documentadas que permitan contar una historia; no inventar un artesano o comerciante para unir los datos.
- [x] Comprobar recorrido y fotografías como en T1–T2. Aclarar qué puede entenderse desde el exterior y verificar acceso si un episodio depende de entrar.

**Verificación:** tema reconocible, episodios diferentes, respaldo histórico, imágenes comprobadas y paseo coherente. **Dependencias:** entrega T4; reutilizar el aprendizaje sin exigir un estudio adicional de oyentes. **Alcance:** pequeño; nuevo dossier e itinerario con los servicios existentes.

### T6. Producir y entregar Valencia de la seda

- [x] Aplicar T3 a las paradas y escribir la bienvenida al final; mantener el nivel y la voz de las muestras aceptadas.
- [x] Aplicar T4: presentación con fotos, audios por parada y completo, guion, recorrido, créditos y registro de esfuerzo. Recoger la valoración cuando llegue.

**Verificación:** la misma comprobación editorial, visual y de reproducción de la primera entrega; ninguna pieza se declara aceptada por el usuario antes de su comentario. **Dependencias:** T5. **Alcance:** pequeño; repetir el flujo existente en una carpeta separada.

## Fuentes, esfuerzo y cierre

La selección reutiliza las [reglas de fuentes del proyecto](plan-tours-tematicos-y-fuentes-20260916.md): distinguir evidencia histórica de autorización para usar textos e imágenes, conservar procedencia y créditos, y resolver los usos necesarios antes de enviar material a DeepSeek. Una web institucional puede servir para contrastar un hecho sin convertirse automáticamente en texto admitido para generación. No hace falta construir otro sistema de evaluación.

Al ejecutar, reutilizar la configuración del piloto y confirmar disponibilidad y tarifas del modelo. Mantener **un máximo de dos solicitudes físicas por pieza que necesite generación**, incluidos fallos y correcciones, sin reintentos ocultos, y un tope de exposición de **1 USD de API de DeepSeek por tour**. Es un límite, no una previsión de coste total. Preparación, revisión y voz se registran aparte. Si una pieza agota su intento de corrección con un error importante, conservar el resto e informar del punto pendiente.

El plan queda conseguido al entregar los dos tours con historias claras y respaldadas, fotografías visibles, audio reproducible y recorridos comprobados, registrando cualquier límite real. La respuesta del oyente se añade cuando llegue. El criterio sigue siendo **que funcione y sea suficiente**, sin reescribir lo que ya sirve ni abrir una producción masiva de otras ciudades.

## Material que se reutiliza

- [Entradas y referencias del piloto](../../backend/tmp/valencia-deepseek-practico-20260916/inputs.json), [ejecutor local](../../backend/tmp/valencia-deepseek-practico-20260916/run.cjs) y [comprobación del piloto](../../backend/tmp/valencia-deepseek-practico-20260916/verify.cjs). Reutilizar sus operaciones; adaptar las comprobaciones que asumen exactamente tres piezas.
- [Selección de imágenes de Commons](../../backend/src/services/CommonsImageCandidates.ts) y [servicio de recorridos peatonales](../../backend/src/services/WalkingRouteService.ts).
- [Montaje de audio existente](../../backend/tmp/valencia-deepseek-practico-20260916/assemble.py) y [registro de capítulos y tiempos](../../backend/tmp/valencia-deepseek-practico-20260916/listening-result.json). El documento es la presentación inicial; la [vista editorial existente](../../frontend/src/components/tour/EditorialPreview.tsx) muestra fotos y mapa, pero necesita trabajo adicional para integrar audio, así que no es necesaria para esta entrega.
- Audios originales y procedencia en la carpeta del piloto. Las nuevas ejecuciones van en carpetas separadas; conservar los originales para comparar y evitar regenerarlos.

El plan y su lista de tareas se mantienen juntos en `docs/tours`, como se pidió para esta línea de trabajo. La ejecución autorizada y sus entregas se registran a continuación.

## Avance de ejecución

Primera entrega: [presentación con fotos y audio](../../backend/tmp/valencia-ampliada-20260916/index.html), cuatro paradas y 6:22 de escucha. Recorrido calculado y revisado sobre mapa: 2.096,6 m y unos 28 minutos de marcha. Se conservó el audio del palacio; Serranos recibió una corrección factual. Las dos paradas nuevas necesitaron una corrección de DeepSeek cada una y una sustitución breve humana cada una, registradas. Seis llamadas, 0,00243207 USD estimados de API. Comprobación de reproducción, imágenes y vista móvil superada. La valoración del usuario de esta versión queda pendiente.

Segunda entrega: [Valencia de la seda, con fotos y audio](../../backend/tmp/valencia-seda-20260916/index.html), tres paradas y 3:55 de escucha. Tamarit → Colegio del Arte Mayor de la Seda → Lonja. Recorrido exterior de 613,8 m, unos 8 minutos de marcha, calculado y revisado en el mapa. Tamarit introduce la historia del barrio; no se atribuyen al palacio los talleres del siglo XV. Fotografías reales comprobadas, con autor y licencia. Seis llamadas a DeepSeek, 0,00229130 USD estimados de API. Tamarit y Colegio necesitaron una corrección cada uno. En el Colegio, Codex precisó una referencia al lugar y recortó un cierre repetitivo de 75 palabras; ambas intervenciones quedaron registradas. La Lonja y la bienvenida se aceptaron en el primer intento.

Los dos tours superaron la comprobación de imágenes, reproducción, presentación móvil, correspondencia del texto de entrada al sintetizador, procedencia del audio y consumo. La voz mantuvo el mismo modelo y referencia del piloto; la generación de nuevos clips tardó unos 77 y 70 segundos, respectivamente, incluyendo el relevo de GPU. El primer tour requirió además un intento de voz fallido antes de sintetizar, documentado en su informe. La API de DeepSeek sumó 0,00472337 USD estimados; esa cifra no mide preparación, revisión, herramientas de apoyo ni voz, y no se presenta como coste total ni como ahorro comparativo.

Documentos de escucha y guiones completos: [Valencia ampliada](valencia-ampliada-escucha-20260916.md) y [Valencia de la seda](valencia-seda-escucha-20260916.md). Las presentaciones y los audios son locales; las fotos y las teselas del mapa necesitan conexión. La ruta se revisó sobre mapa, sin inspección presencial. La verificación de audio fue técnica, sin auditoría auditiva palabra por palabra. La incorporación al catálogo y la valoración del oyente siguen fuera de esta entrega.
