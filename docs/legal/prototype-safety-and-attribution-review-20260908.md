# Prototipo: seguridad, audio, fuentes y avisos

Fecha de revisión: 8 de septiembre de 2026.

Estado: revisión del código local y propuesta de implementación. No es una certificación de cumplimiento ni describe cambios ya aplicados a la app. Había cambios de desarrollo en curso; se ha revisado su contenido, sin modificarlos. No se ha comprobado el despliegue, contratos privados, configuración efectiva de proveedores ni cada tour existente.

## 1. Alcance recomendado para la prueba

Supuesto de trabajo, pendiente de confirmar: prueba gratuita por invitación. Recomiendo comenzar con unas pocas rutas urbanas, revisadas por una persona, y generación administrada por el equipo. Primero revisar texto/audio desde casa; después probar el paseo acompañado. Estas son decisiones de reducción de riesgo, no requisitos universales de la ley.

«Prototipo» o «beta» no constituye una exención general. La exclusión de determinadas actividades de investigación y desarrollo del Reglamento de IA tiene límites y no incluye sin más pruebas en condiciones reales. La gratuidad tampoco resuelve los derechos de autor, la privacidad ni la responsabilidad por daños. [Reglamento de IA, artículo 2 y considerando 25](https://www.boe.es/buscar/doc.php?id=DOUE-L-2024-81079), [obligaciones de protección de datos](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en).

Para una prueba privada, proteger en el servidor tanto páginas como API y audio. Un enlace difícil de adivinar, `noindex` o una clave incluida en el navegador no son control de acceso. `frontend/src/lib/backendProxy.ts` autentica la conexión con el backend, no al participante. `backend/src/server.ts:46` sirve `/audio` antes de la validación de clave de las rutas API; ese acceso también debe quedar detrás de la protección elegida. Esta revisión no determina si existe ya una barrera externa en el despliegue.

## 2. Qué hace el audio actual

Flujo observado:

1. `generationJobServiceInstance.ts` utiliza `MultilingualTourGenerator` y programa audio al terminar la generación.
2. `TourAudioService.ts:59` comprueba disponibilidad del tour y del texto. En la primera parada añade la introducción; las siguientes reciben su descripción.
3. `LocalVoxCpmRenderer` ejecuta `pods/voxcpm-pod/scripts/render-tour.py`.
4. El script carga localmente `openbmb/VoxCPM2`, usa `guide-es-a.wav` y su transcripción como referencia, divide el texto en fragmentos y genera MP3. Activa modo sin conexión para Hugging Face durante este proceso.
5. `AudioAsset.metadata` conserva proveedor, voz, identificadores y huellas del texto/preset. El audio se sirve a través de la app; también existe la ruta estática indicada arriba.

El audio es síntesis de texto, no una grabación nueva de un guía. `TourAudioPanel.tsx` aún utiliza expresiones como «Recording stop» y «stops recorded». Recomiendo «Generando audio» y «paradas con audio», con una etiqueta visible «Voz generada por IA» junto al reproductor.

### Origen de la voz A

Se verificó la igualdad exacta, mediante SHA-256, entre:

- `pods/voxcpm-pod/presets/guide-es-a.wav`;
- `pods/voxcpm-pod/cache/voice_references/0880582a-949f-4c27-bd10-cd94cdf26d6c.wav`.

Huella común: `475753e08fe9bb194991fd4d7b50b62a0d65d9e371b94db43a28567160ab65bb`.

El manifiesto de esa caché la identifica como `voxcpm`, `openbmb_VoxCPM2`, perfil `guide_es`. `pods/voxcpm-pod/src/services/voxcpm.py:440` crea las referencias ausentes mediante una llamada al modelo con texto, sin WAV de entrada. La transcripción coincide con la del preset. Esto constituye evidencia coherente de origen sintético; no es una prueba histórica independiente de que el archivo nunca fuese sustituido. No se ha encontrado evidencia de un locutor real utilizado como origen.

Conservar junto al preset un registro del origen, modelo y revisión exacta, fecha conocida, método de generación, transcripción, huella y licencia. Distinguir lo recuperado del código de lo probado por un registro de la ejecución original. Si no puede confirmarse el origen con suficiente confianza, generar una nueva referencia sintética documentada sería la alternativa; no hace falta cambiar la voz solo por usar un archivo de referencia.

La ficha oficial de VoxCPM2 declara Apache-2.0 y permite uso comercial. Esa licencia del modelo no autoriza por sí sola a clonar a cualquier persona ni elimina derechos de terceros. La ficha también pide identificar el contenido artificial y advierte contra usos de suplantación. [Modelo oficial](https://huggingface.co/openbmb/VoxCPM2), [licencia del código](https://github.com/OpenBMB/VoxCPM/blob/main/LICENSE).

No encontré en `render-tour.py` una inserción explícita de aviso hablado, metadatos de procedencia o marca de agua. Los campos en la base de datos no acompañan automáticamente al MP3. No se ha auditado el interior del modelo ni analizado todos los archivos para determinar si contienen alguna señal implícita.

### Transparencia de IA

Mostrar «Voz generada por IA» y avisarlo brevemente al comenzar el tour es una medida clara y proporcionada. El texto también debe identificar que se ha generado con IA y describir con precisión la revisión realizada. Una auditoría de otro modelo no equivale a revisión humana.

Jurídicamente hay que distinguir información a personas, marcado técnico de salidas por proveedores, supuestos de ultrafalsificaciones y textos informativos de interés público. No todo audio sintético es una ultrafalsificación. El artículo 50 contempla excepciones; hay que documentar el rol de este proyecto y su aplicabilidad, no afirmar que cualquier TTS exige exactamente la misma solución. Un campo privado `provider` o una etiqueta visual no acredita por sí solo el marcado interoperable y detectable cuando resulte exigible. [Artículo 50](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50).

Las obligaciones del artículo 50 se aplican desde el 2 de agosto de 2026. La Comisión indica un plazo hasta el 2 de diciembre de 2026 para el marcado del apartado 2 en sistemas introducidos en el mercado antes del 2 de agosto. No basta con que el código existiese antes de esa fecha para asumir ese plazo. [Explicación de la Comisión](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act).

## 3. Fuentes de los textos: hallazgos verificables

El flujo actual utiliza una investigación compartida por ruta, narración y auditoría mediante Codex, y selección de imágenes de Commons. `CodexTourProcess.ts` y `CodexTourGenerator.ts` pasan `--rag=off`: el corpus histórico local existe, pero no debe anunciarse como fuente de todos los tours de este flujo.

`narrative-user-canary-v8.ts:603` construye servicios de Wikipedia/Wikidata, búsqueda con SearXNG y captura con Firecrawl. La búsqueda o el capturador son herramientas; el autor y las condiciones pertenecen al sitio de origen. Una fuente considerada fiable no tiene necesariamente permiso de reutilización.

Se inspeccionó el checkpoint de Sevilla `backend/tmp/narrative-v8/app-638beea9-1832-45f5-834c-c2e0ffc0edd9/checkpoint.private.json`. Sus dosieres incluyen Wikipedia y páginas de Real Alcázar, Catedral de Sevilla, IAPH, BOE y Fundación Medinaceli. Otras páginas, incluidas noticias de Diario de Sevilla, fueron capturadas pero no seleccionadas como fuentes del dosier. No se deben presentar todos los resultados de búsqueda como respaldo del guion.

### Dos conflictos de derechos que requieren actuar

- **Catedral de Sevilla:** el checkpoint conserva capturas y una fuente seleccionada de este dominio. El aviso legal actual, apartado 6, prohíbe extracción automatizada sin autorización escrita. Recomiendo excluirlo de nuevas capturas hasta contar con permiso o una base jurídica revisada, y señalar los tours/blueprints que dependan de esas capturas para sustituirlas. La restricción actual no prueba por sí sola qué condiciones regían en la fecha de una captura anterior. [Aviso legal](https://www.catedraldesevilla.es/aviso-legal/).
- **Real Alcázar:** aparece también como fuente seleccionada. Su aviso no concede una licencia abierta; reserva reproducción y transformación salvo autorización. No debe etiquetarse como material abierto ni adaptarse como si fuese CC BY-SA. [Aviso legal](https://alcazarsevilla.org/avisolegal-protecciondatos/).

Esto no significa que estén prohibidos los hechos históricos o los enlaces a estas instituciones. Significa que consultar hechos, reproducir una página, almacenarla para procesamiento y adaptar su expresión son usos distintos. La excepción de minería de textos y datos tiene condiciones, entre ellas acceso legítimo y reservas de derechos; citar al autor no sustituye su análisis. [Directiva 2019/790, artículo 4](https://www.boe.es/buscar/doc.php?id=DOUE-L-2019-80826).

Para el prototipo, usar un catálogo pequeño de fuentes con permisos documentados y mantener una lista de dominios excluidos. La decisión sobre captura debe aplicarse antes de descargar, incluyendo enlaces descubiertos desde Wikipedia y redirecciones. Conservar la identificación mínima del incidente; no redistribuir las capturas cuestionadas ni borrarlas indiscriminadamente durante la revisión. Sustituir fuentes y volver a revisar las narraciones afectadas antes de darlas a probadores.

### Wikipedia, Wikivoyage y datos estructurados

Si se reutiliza o adapta texto de Wikipedia, acompañarlo de la página concreta, atribución, licencia y declaración de cambios; aplicar ShareAlike a la adaptación cuando corresponda. La misma comprobación debe hacerse para cada edición/proyecto, incluido Wikivoyage cuando se utilice. Consultar hechos y redactar una expresión independiente no activa automáticamente las mismas obligaciones que adaptar texto. Tampoco se puede asumir que una paráfrasis de IA elimina derechos. [Condiciones de Wikimedia, sección 7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content).

Como política sencilla para los guiones del prototipo, se puede optar por publicar bajo CC BY-SA 4.0 las adaptaciones autorizadas y marcar el resto según sus derechos reales. No aplicar esa licencia a material ajeno incompatible. ShareAlike no convierte automáticamente todo el código de la app en código abierto. Los hechos en dominio público no deben presentarse como propiedad exclusiva del proyecto. [Creative Commons BY-SA](https://creativecommons.org/licenses/by-sa/4.0/).

### Qué guardar y qué mostrar

Ya existe gran parte de la procedencia: `TourBlueprint.ts:58` conserva dosier, capturas, URL, fecha, huella y revisión de Wikimedia. Reutilizarla. El objeto que recibe la interfaz del tour no ofrece hoy una bibliografía completa por parada; `CodexTourArtifact.ts` conserva identidad y hallazgos, pero no proyecta los créditos editoriales necesarios.

Añadir al dato público de cada parada una proyección mínima de las fuentes realmente usadas: título, autor/editor, URL canónica, revisión/fecha, licencia o base de uso, modificaciones y relación con la narración. Mantener aparte el registro privado de capturas y términos. No exponer páginas completas, prompts privados, registros internos o claves.

`/data-sources` enumera seis servicios y afirma que se usan datos abiertos y que todas las fuentes están acreditadas. Esa afirmación es demasiado amplia para el flujo observado. La página debe describir el método y los proveedores; los créditos concretos deben estar en cada tour/parada.

## 4. Imágenes y mapas

**Imágenes: conservar lo que ya funciona.** `CommonsImageCandidates.ts:35` exige autor, rechaza restricciones declaradas y admite CC0 y determinadas versiones de CC BY/BY-SA con URL de licencia coherente. `TourPhoto.tsx:105` muestra fuente, autor, atribución, licencia y cambios, en un desplegable próximo a la imagen y en su ampliación. La IA elige imágenes y pies; no decide su licencia. Revisar muestras y conservar metadatos por archivo: una etiqueta de Commons no garantiza derechos de imagen, de obras representadas u otras restricciones no declaradas. [Licencias de medios de Wikimedia](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content).

**Nominatim: corregir antes de continuar las pruebas de búsqueda.** `LocationPicker/index.tsx:20` busca después de 300 ms sin teclear; `/api/geocoding/cities/route.ts:31` lo transmite al Nominatim público. Es autocompletado, prohibido por su política; un proxy no cambia esa función. Solución mínima: envío explícito con «Buscar», caché y coordinación de todas las llamadas al mismo servicio con un máximo de una petición por segundo por aplicación. Revisar también las consultas del backend. Una lista fija de ciudades de prueba permitiría evitar esas búsquedas. [Política de Nominatim](https://operations.osmfoundation.org/policies/nominatim/).

**Teselas OSM:** no hay una prohibición general de uso comercial. Se permite uso interactivo conforme a su política, sin descarga masiva ni función de mapas offline, con atribución visible, cabeceras y caché adecuadas. El valor por defecto actual usa `{s}.tile.openstreetmap.org`; adaptar a la URL exacta recomendada `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. No hace falta contratar otro proveedor solo por ser un prototipo pequeño. [Política oficial](https://operations.osmfoundation.org/policies/tiles/).

**Rutas:** FOSSGIS/OSRM exige créditos, enlace para corregir el mapa y un máximo de una petición por segundo. `WalkingRouteService` ya tiene cola/caché y `TourMap` muestra atribución y estado de fallo. Comprobar que el límite se cumpla sumando instancias y otros llamadores. El segmento `/driving` dentro del endpoint `routed-foot` no demuestra que se estén calculando rutas para coches: ese servidor está dedicado al perfil peatonal. [Servicio de rutas](https://routing.openstreetmap.de/about.html).

## 5. Dónde mostrar cada información

Los siguientes textos son propuestas. No anunciar «prueba privada», «revisado por una persona» o prácticas de privacidad que todavía no estén implementadas.

| Lugar | Información y comportamiento propuestos | Archivo/punto existente |
|---|---|---|
| Cabecera, también al abrir un enlace directo | «Prototipo experimental · Contenido y voz generados con IA». Si se restringe el acceso, añadir «Prueba privada gratuita». | `frontend/src/app/layout.tsx` / cabecera compartida |
| Antes de empezar el paseo | «La ruta es orientativa y puede contener errores. Respeta señales, cruces y cierres; no entres en zonas privadas o restringidas. Detente en un lugar seguro para consultar el móvil». Botón «Entendido, empezar». No es una renuncia de derechos. | `frontend/src/app/tours/[id]/page.tsx` |
| Junto al reproductor | «Voz generada por IA». Enlace «Sobre esta voz». Estado «Revisión automática» o «Revisión humana realizada el…», únicamente cuando haya constancia real. | `TourAudioPanel.tsx` |
| Primer audio del tour | «Esta audioguía experimental utiliza una voz generada por inteligencia artificial. Comprueba el entorno y respeta las indicaciones locales». Mantenerlo también en la transcripción. No repetir el párrafo entero en todas las paradas. | Primera narración de `TourAudioService` |
| Debajo de cada parada | Desplegable «Fuentes de esta parada»: páginas efectivamente usadas, editor/autores, licencia, revisión y modificaciones relevantes. | `tours/[id]/page.tsx` / presentación del texto |
| Junto a cada foto | Mantener «Créditos de la foto» y los datos actuales; conservarlos también en cualquier exportación. | `TourPhoto.tsx` |
| Dentro del mapa | Créditos OSM/FOSSGIS visibles, aviso de ruta no disponible y acceso a «Informar de un problema». | `TourMap.tsx` |
| Antes de pedir ubicación | «Usar mi ubicación para situarme en el mapa» y «Continuar sin ubicación», con enlace a la explicación de datos y terceros. Pedir el permiso del navegador después de esa elección. | Efecto de `watchPosition` en `tours/[id]/page.tsx` |
| Pie de todas las páginas | «Sobre el prototipo», «Fuentes y licencias», «Privacidad» y «Contacto». Titular identificable y condiciones de prueba accesibles. | `AttributionFooter.tsx`; ampliar `/data-sources` |
| Audio compartido o descargado | Procedencia y enlace estable a la ficha del tour/créditos; conservar las obligaciones de las obras adaptadas. Valorar metadatos y marcado conforme al rol legal aplicable. | Render y entrega de MP3 |

Traducir avisos al idioma de la experiencia, mantenerlos legibles en móvil y accesibles con teclado/lector de pantalla. No depender solo del color ni obligar a escuchar para conocer el aviso. Conservar transcripción y controles de reproducción.

## 6. Privacidad, revisión y responsabilidad

La ubicación precisa se usa en estado del navegador en el flujo revisado, sin observarse envío al backend propio. Pero los mapas e imágenes se descargan de terceros, que reciben datos de conexión; centrar el mapa cerca del usuario también revela indirectamente la zona visualizada. Además, `backend/src/server.ts:29` registra IP, ruta y duración. Por tanto, no publicar «no recogemos datos» o «nada sale de tu dispositivo».

La política debe identificar al responsable, finalidades, bases jurídicas, destinatarios/proveedores, transferencias cuando procedan, plazos y derechos. Decidir y aplicar primero los plazos de registros; no inventar una cifra en el aviso. Para el piloto, evitar analítica y publicidad y no enviar GPS, datos de identidad o comentarios privados a los modelos. El permiso técnico del navegador no sustituye esta información. [Guía oficial de RGPD](https://europa.eu/youreurope/business/governance-and-sustainability/digital-and-data-compliance/data-protection-gdpr/index_en.htm).

No añadir un banner genérico de cookies por rutina. Inventariar almacenamiento local y peticiones; si solo se usa almacenamiento estrictamente necesario para funciones solicitadas, puede estar exento. Analítica u otros usos no exentos requieren su gestión correspondiente, con rechazo tan accesible como aceptación. [Guía de cookies de la AEPD](https://www.aepd.es/guias/guia-cookies.pdf).

He consultado también la documentación oficial de OpenAI: el modo no interactivo está previsto. El código fuerza autenticación ChatGPT para autor/auditor; eso no prueba que todo el procesamiento sea local ni acredita las condiciones del plan para servir la app a terceros. Antes de abrir generación al público, confirmar contrato, tratamiento de datos y modalidad adecuada. No se ha inspeccionado la cuenta ni se presume que esta automatización esté prohibida. [Autenticación](https://developers.openai.com/codex/auth/), [modo no interactivo](https://developers.openai.com/codex/noninteractive/).

`publicationPassed` y los estados «published» del software reflejan sus controles automáticos; no son certificados jurídicos ni inspecciones sobre el terreno. Para las primeras rutas, registrar persona revisora, fecha y versión de texto, audio y recorrido; escuchar el audio completo y comprobar cruces, accesos, cierres y referencias espaciales. Ofrecer reporte de errores y poder retirar una ruta o parada. No prometer accesibilidad física, apertura actual o ausencia de peligro sin verificarlo.

Los avisos delimitan el servicio y ayudan a prevenir daños, pero no eliminan responsabilidad por una actuación negligente. Evitar cláusulas de exoneración absoluta. Para pruebas en la calle, valorar cobertura de responsabilidad civil ajustada a rutas digitales. Comprobar regulación turística y reglas de monumentos del primer territorio, sin presentar una validación local como válida para toda la UE. [Código Civil, artículo 1902](https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763#art1902), [cláusulas abusivas](https://europa.eu/youreurope/citizens/consumers/unfair-treatment/unfair-contract-terms/index_es.htm).

## 7. Orden mínimo de implementación y evidencia de cierre

1. **Corregir fuentes y Nominatim.** Bloquear las capturas cuestionadas, revisar los blueprints afectados y cambiar la búsqueda. Evidencia: ningún tráfico por tecla; caché y límite global; generación de prueba sin fuentes excluidas. No contactar a titulares sin autorización del usuario.
2. **Definir el acceso de la prueba.** Proteger UI/API/audio con una barrera ya disponible. Evidencia: una sesión sin acceso no obtiene tours, archivos ni puede iniciar trabajos. La generación puede quedar solo para el equipo.
3. **Publicar avisos, condiciones e información de datos veraces.** Incluir responsable y contacto reales. Evidencia: se ven desde un enlace directo; ubicación denegada sigue permitiendo usar la guía.
4. **Mostrar fuentes de cada parada y documentar la voz.** Reutilizar los datos del blueprint y las huellas existentes. Evidencia: un tercero puede llegar de cada crédito a su fuente/licencia; la ficha del audio identifica el origen y la versión correspondiente.
5. **Revisar una ruta completa antes de caminarla con probadores.** Conservar revisión y mecanismo de retirada. No confundir la aprobación automática con esta revisión.
6. **Cerrar cuestiones jurídicas concretas antes de ampliar.** Aplicación del artículo 50 y marcado, derechos de capturas/adaptaciones, condiciones de proveedores, privacidad real y regulación local. Si se incorpora pago, añadir revisión de contratación y derechos sobre contenido digital antes de activar cobros.

Pendientes que no puede resolver únicamente el código: identidad y contacto del responsable; modalidad real de prueba; alojamiento y proveedores efectivos; condiciones del plan de IA; confirmación histórica del origen de voz; permisos de las fuentes cuestionadas; persona responsable de revisar rutas. No se deben suplir con nombres inventados, fechas retroactivas, una casilla «acepto» ni una insignia «cumplimos toda la normativa».
