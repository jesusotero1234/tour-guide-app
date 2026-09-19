# Plan técnico: piloto de audioguías, fuentes y transparencia

Fecha: 8 de septiembre de 2026. Estado: **implementación local aplicada; apertura del piloto pendiente de datos y revisiones reales**.

Revisión del árbol de trabajo sobre HEAD `5cfdd505be0b1f5f0719a7335b377f8773b6a782`, incluyendo cambios locales en curso. Complementa la [revisión de seguridad, audio y atribución](/home/jesusotero/coding/tour-guide-app/docs/legal/prototype-safety-and-attribution-review-20260908.md). Las rutas de archivo en código se expresan desde `/home/jesusotero/coding/tour-guide-app`.

Este documento contiene el plan y su lista de tareas. `tasks/plan.md` y `tasks/todo.md` pertenecen a otro trabajo activo sobre el corpus histórico; se conservan. Se han modificado la app y su configuración de piloto; se ha auditado la base local en lectura. No se han aprobado tours ni abierto un despliegue público.

## 1. Resultado propuesto

Preparar un piloto gratuito por invitación, con pocas rutas urbanas y acceso de lectura para participantes. El equipo genera y revisa los tours antes de compartirlos. La implementación solicitada utiliza este alcance mínimo. Antes de abrir la prueba hay que confirmar sus datos operativos; no supone una exención legal.

El resultado debe permitir comprobar:

- quién presta el servicio, qué hace la IA y cómo contactar;
- de dónde procede cada fuente, foto y voz, y qué uso está autorizado;
- qué versión concreta revisó una persona;
- qué datos salen del dispositivo;
- que solo se sirven a participantes las versiones admitidas al piloto.

No habrá una insignia «cumplimos toda la ley». Los avisos describen prácticas reales; las comprobaciones técnicas y los documentos de derechos aportan evidencia. La valoración jurídica de los supuestos aplicables sigue siendo necesaria donde el código no puede resolverlos.

## 2. Correcciones a la propuesta inicial tras revisar el código actual

| Hallazgo actual | Consecuencia técnica |
|---|---|
| La página del tour monta `TourExperience`; este componente solicita ubicación automáticamente al abrir el mapa. | Cambiar el permiso allí, no en el antiguo efecto de la página. |
| `TourExperience.css` usa una pantalla fija con desbordamiento oculto y cubre el layout. | Añadir acceso a información legal dentro del tour; modificar solo el pie global sería insuficiente. |
| La captura activa usa `FirecrawlNarrativeCaptureProviderV7`, también desde `NarrativeReferencesV8`. | Un filtro solo en la búsqueda dejaría pasar referencias descubiertas desde Wikipedia. |
| Firecrawl devuelve la URL final después de capturar. | Rechazar esa URL al recibirla no evita que ya se haya descargado contenido. |
| Los blueprints conservan capturas y dosieres; `mapCodexTourArtifact` deja en cada parada principalmente el QID. | Proyectar créditos desde el blueprint antes de guardar el tour. No crear otro repositorio de investigación. |
| Audio automático después de generar, más reintento desde la interfaz. | Mantener la generación del equipo y restringir todas las entradas de generación de participantes. |
| La clave actual identifica al frontend frente al backend. `/audio` se sirve por una ruta estática independiente. | La invitación debe proteger páginas, API y audio, incluyendo acceso directo al origen. |
| El recorrido de `/walking-route` puede obtenerse de nuevo de OSRM. | Si se anuncia revisión humana del recorrido, servir la geometría que se revisó y registrar su versión. |
| El progreso de escucha usa solo `tourId` y `placeId`. | Un audio regenerado podría recuperar una posición anterior incorrecta. Versionar también el progreso. |

## 3. Decisiones técnicas comunes

1. **Reutilizar almacenamiento.** `Tour.metadata`, `Place.metadata` y `AudioAsset.metadata` ya son JSON en PostgreSQL. Ampliar sus tipos y validadores; inicialmente no se necesita otra base de datos ni una migración estructural.
2. **Separar fiabilidad de derechos.** Una fuente oficial puede ser fiable y tener restringida su captura. `authority` no autoriza reutilización. Ni el modelo ni un resultado de búsqueda asignarán licencias.
3. **Admitir fuentes de forma conservadora.** Para la preparación del piloto, resolver permisos antes de capturar. Si la evidencia autorizada no alcanza los controles editoriales existentes, la ruta permanece pendiente; no rebajar los controles.
4. **Acceso en el despliegue.** Reutilizar el control de acceso del alojamiento/proxy si existe. No desarrollar cuentas, recuperación de contraseña ni un sistema de roles para unas pocas invitaciones. Si no existe barrera, configurar la mínima del proxy efectivo con HTTPS y credenciales revocables.
5. **Revisión independiente de la auditoría automática.** Mantener los estados actuales del generador y añadir una admisión específica al piloto, vinculada a una versión. No convertir `publicationPassed` en una aprobación humana.
6. **Compatibilidad sin certificaciones retroactivas.** Los tours antiguos siguen siendo legibles para el equipo. La ausencia de derechos documentados o de revisión impide incorporarlos al piloto, en lugar de inventar créditos o fechas.

## 4. Cambios de preparación y acceso

### T1 — Acceso privado y participantes sin generación

**Prioridad:** antes de invitar. **Dependencias:** identificar el despliegue efectivo. **Tamaño:** M.

**Dónde:** configuración real de publicación —los archivos Compose no prueban qué está desplegado—, `backend/src/server.ts`, `backend/src/api/routes/tours.ts`, `frontend/src/lib/backendProxy.ts` y controles de generación visibles.

**Cómo:**

- Una entrada HTTPS autenticada cubre HTML, API y MP3. El backend, PostgreSQL y los pods quedan en red interna o ligados a la interfaz local cuando corresponda; comprobar los puertos publicados, no solo el dominio.
- En la entrada de participantes permitir únicamente las rutas de lectura necesarias. Denegar generación de texto, audio y operaciones de pases. Incluir `/generation-jobs`, `/generate`, `/generate-from-concept` y `POST /:id/audio`; no basta ocultar botones. El equipo utiliza un acceso interno autenticado.
- Retirar la exposición estática `/audio` del piloto. Entregar audio mediante `/:id/audio/:placeId`, con validación de tour y acceso. Revisar también `place.audioUrl` y las respuestas antiguas para que no apunten al atajo estático.
- `API_KEY` permanece en el servidor. No confiar en un `isAdmin` ni en cabeceras de identidad aportadas por el navegador. Si el proxy comunica identidad, debe reemplazar las cabeceras entrantes y el origen debe aceptar tráfico solo desde él.
- Respuestas privadas sin caché compartida; conservar soporte de `Range` para reproducción y búsqueda dentro del audio. Retirar una invitación debe impedir nuevas peticiones.

**Aceptación y verificación:** probar sin sesión una página directa, listado, MP3, solicitud `Range`, API de generación y origen directo. Con participante, leer funciona y generar se rechaza sin crear trabajos. Con el equipo, la preparación sigue funcionando. Usar pruebas HTTP contra un despliegue de ensayo, sin claves en historiales o capturas.

### T2 — Política de captura en el punto común

**Prioridad:** antes de nuevas capturas. **Dependencias:** ninguna. **Tamaño:** M, en dos cambios: política/cliente y conexiones/pruebas.

**Dónde:** `backend/src/services/poi/NarrativeSourcesV7.ts`, `NarrativeReferencesV8.ts`, `backend/scripts/validation/narrative-user-canary-v8.ts`; nuevo módulo pequeño `backend/src/services/poi/SourceUsePolicy.ts`. Revisar `NarrativeSourcesV6.ts` si se mantienen sus ejecutores habilitados.

**Cómo:** un registro versionado de permisos con origen/ruta, acciones permitidas —captura, conservación, adaptación, publicación—, licencia o referencia al permiso y fecha de revisión. La evidencia contractual queda privada; el registro no contiene credenciales. Dominio desconocido implica captura pendiente. Comparar hosts normalizados con límites de subdominio, no mediante `includes`; mantener las protecciones de URL/DNS ya existentes.

Aplicar la comprobación antes de `FirecrawlNarrativeCaptureProviderV7.capture` y de cualquier operación de descubrimiento que descargue páginas. Así se cubren la captura principal y las referencias. La URL final se comprueba adicionalmente. Un rechazo de política no dispara reintentos ni otro proveedor para descargar la misma fuente.

**Límite importante:** `maxRedirects: 0` en Axios hacia Firecrawl solo controla esa conexión, no las redirecciones del navegador interno de Firecrawl. Mientras no se pueda garantizar el control previo de cada destino y subrecurso, dejar desactivada la captura web genérica para el piloto. Usar los clientes API autorizados y material con permiso incorporado de forma controlada. No declarar arreglado el problema con un filtro posterior. Reactivar captura web requiere una prueba específica de salida de red con redirecciones y recursos externos.

El aviso actual de la [Catedral de Sevilla](https://www.catedraldesevilla.es/aviso-legal/) restringe la extracción automatizada sin autorización escrita. El [Alcázar](https://alcazarsevilla.org/avisolegal-protecciondatos/) no concede una licencia abierta. Registrar ambos como pendientes/restringidos para los usos afectados; esto no prohíbe citar hechos independientes ni enlazar sus páginas.

**Aceptación y verificación:** pruebas con transportes falsos demuestran cero descargas a fuentes excluidas, también desde referencias y reintentos; hosts parecidos no pasan. Una ejecución con evidencia insuficiente queda pendiente. Si se habilitan capturas con redirecciones, el servidor de destino prohibido debe recibir cero peticiones, no solo descartarse su respuesta.

### T3 — Tours y cachés anteriores

**Prioridad:** antes de compartir rutas existentes. **Dependencias:** T2. **Tamaño:** S/M.

**Dónde:** `TourBlueprint.ts`, `tourReadiness/TourLanguage.ts`, `PostgresTourBlueprintRepository.ts`; script administrativo nuevo en `backend/scripts/admin/`.

**Cómo:** inventariar en modo de lectura blueprints, checkpoints y tours que contienen fuentes pendientes. Distinguir capturas realizadas, fuentes seleccionadas y narración publicada. Emitir IDs y motivos; no copiar páginas completas al informe público. Revisar antes de invalidar o eliminar datos.

Versionar la política de fuentes dentro de la política de investigación ya incorporada a las claves. Regenerar las bases afectadas con fuentes permitidas. No editar un snapshot firmado ni recalcular su huella para hacer pasar un contenido antiguo por nuevo. Revalidar también al reutilizar caché/replay. Retirar del piloto las variantes de idioma y audios afectados.

**Aceptación y verificación:** una fuente retirada invalida el tour dependiente y su audio, incluyendo su variante francesa, aunque continúen en disco. Un tour independiente no se invalida por compartir ciudad. Primero ejecutar informe de impacto; conservar evidencia mínima y aplicar después la política de conservación acordada.

## 5. Procedencia de textos, voz y audio

### T4 — Créditos estructurados y persistencia

**Prioridad:** antes de compartir. **Dependencias:** T2. **Tamaño:** M por paso.

**Paso A, contrato:** ampliar `PlaceMetadata` en `backend/src/domain/entities/Place.ts` con `sourceCredits`, compuesto por `version` y `items`. Cada elemento contiene `sourceId`, título, URL canónica, atribución, fecha de consulta, revisión cuando exista, licencia/enlace si procede y descripción de modificaciones. No publicar el permiso privado; mostrar una base de uso comprensible cuando no sea una licencia abierta.

**Paso B, producción:** en `MultilingualTourGenerator.ts`, entre `mapCodexTourArtifact` y `tours.save`, unir las paradas por QID con `snapshot.checkpoint.research`. Seleccionar `dossier.sources` y resolver sus capturas por `sourceId`. Los permisos y créditos se obtienen de metadatos comprobados y del registro, nunca se inventan con IA. Una referencia seleccionada sin captura o permiso verificable impide admitir la ruta al piloto.

Los dosieres acreditan **fuentes consultadas para la investigación**; no demuestran qué fuente originó cada frase final. Usar esa denominación y no atribuir precisión inexistente. La persona revisora identifica las adaptaciones y sus obligaciones. Una trazabilidad automática por afirmación puede añadirse después si se necesita; no es necesaria para mostrar una bibliografía honesta en este piloto.

**Paso C, entrega:** verificar la persistencia en `PostgresTourRepository.ts` y la proyección en `orchestrationService.ts`; actualizar `frontend/src/types/api.ts`. Serializar solo campos públicos permitidos. No enviar capturas, prompts, rutas privadas o datos de la persona revisora junto a `metadata`.

Para adaptaciones de Wikipedia se comprueban atribución, licencia, cambios y ShareAlike cuando corresponda. El modelo no elimina esas obligaciones al parafrasear. No se aplica CC BY-SA a material incompatible ni automáticamente a todo el código. [Condiciones de Wikimedia](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content).

**Aceptación y verificación:** ampliar `TourBlueprint.test.ts`, `MultilingualTourGenerator.test.ts` y una prueba de persistencia/API: dos idiomas conservan las mismas referencias de investigación; no aparecen capturas descartadas; un crédito incompleto no se inventa; la respuesta no expone contenido privado. Comprobar una adaptación y su licencia de distribución, también para el audio que la representa.

### T5 — Fuentes accesibles junto al texto

**Prioridad:** antes de compartir. **Dependencias:** T4. **Tamaño:** S/M.

**Dónde:** `TourExperience.tsx`, `listeningCopy.ts` y, solo si hace falta, `TourExperience.css`.

**Cómo:** añadir un `<details>` al final de la vista «Historia»: «Fuentes consultadas para esta parada». Mostrar títulos enlazados, atribución, licencia y modificaciones. Añadir acceso desde la información del tour para quien escucha sin abrir el texto. Mantener `TourPhoto` con sus créditos individuales; no sustituirlos por una licencia genérica. Los títulos se renderizan como texto y los enlaces se validan, sin insertar HTML de las fuentes.

**Aceptación y verificación:** fuentes accesibles en móvil y teclado, en español y francés; títulos largos y metadatos incompletos no rompen el diseño. Enlace directo al tour permite llegar a fuentes y créditos de fotos.

### T6 — Registrar la procedencia de la voz

**Prioridad:** antes de distribuir audio. **Dependencias:** ninguna. **Tamaño:** S.

**Dónde:** `pods/voxcpm-pod/presets/guide-es-a.json`, documento nuevo junto al preset y lectura de identidad del modelo en `render-tour.py` / `LocalVoxCpmRenderer.ts`.

**Cómo:** conservar referencia, transcripción, SHA-256, modelo/revisión exacta, método de creación, fecha realmente conocida, licencia y evidencia disponible. La referencia actual coincide con la caché sintética; distinguir esa inferencia de un registro original que pruebe su historia. Si no se puede confirmar lo necesario, preparar una referencia sintética nueva y documentada; no cambiarla automáticamente por existir un WAV.

El render local resuelve un snapshot sin fijar actualmente su revisión en el código. Fijar o registrar la revisión efectiva y vincularla a la identidad del render. Conservar los avisos de licencia aplicables al modelo/código sin asignar Apache-2.0 automáticamente a los guiones o MP3. [Ficha oficial de VoxCPM2](https://huggingface.co/openbmb/VoxCPM2).

**Aceptación y verificación:** la huella coincide con el WAV utilizado y cada render registra la revisión efectiva. La ficha pública «Sobre esta voz» no identifica un locutor inexistente ni afirma una procedencia histórica que no se haya demostrado.

### T7 — Aviso de IA, caché y progreso de escucha

**Prioridad:** antes de distribuir audio. **Dependencias:** T6. **Tamaño:** M por paso.

**Paso A, generación:** en `TourAudioService.snapshot`, construir el texto realmente pronunciado con un aviso fijo y traducido al inicio del primer audio, antes de la introducción. No pedir al generador que improvise el aviso. Ejemplo: «Esta audioguía experimental utiliza una voz generada por inteligencia artificial». Mantener ese aviso en una transcripción accesible.

El hash debe incluir el texto final, idioma y versión de render, incluyendo modelo, preset, referencia y versión del marcado cuando se aplique. Guardar también la huella de bytes del MP3 resultante. Un cambio del aviso, modelo o marcado no puede recuperar audio antiguo como válido. Reutilizar `sourceHash`, `rendererKey` y `requestHash` existentes.

**Paso B, reproducción:** `TourAudioPanel` muestra «Voz generada por IA» en modo normal y compacto; usar `listeningCopy.ts` para ambos idiomas. Añadir la versión del audio a la clave de `tourProgress.ts`; las claves antiguas no se trasladan a una grabación distinta. Actualizar `AudioPlayer` y la entrega del estado solo en lo necesario. Ocultar generación/reintento de generación a participantes, manteniendo reintento de descarga.

**Paso C, archivo:** conservar procedencia y enlace a los créditos cuando un audio se entregue fuera de la interfaz. Metadatos en base de datos, ID3 o un JSON acompañante ayudan a trazarlo, pero no equivalen por sí solos al marcado robusto exigible por el Reglamento de IA. Determinar el rol y la obligación aplicable antes de elegir técnica o proveedor; comprobar la señal en el archivo final después de codificar y servir. No inventar una marca de agua casera ni anunciarla como certificación.

El [artículo 50](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50) distingue marcado por proveedores, información a personas y supuestos específicos. No toda voz sintética es una ultrafalsificación. El portal advierte de modificaciones no reflejadas íntegramente: verificar texto vigente, plazos y rol al cerrar esta decisión; este plan no codifica una supuesta exención por ser beta.

**Aceptación y verificación:** ampliar `__tests__/TourAudioService.test.ts`: un cambio de identidad/aviso invalida audio anterior y se pronuncia el aviso una vez en la primera parada. Probar que la posición guardada no salta el inicio de una nueva versión. Escuchar un MP3 real y contrastarlo con su transcripción. La verificación jurídica del marcado queda abierta hasta documentar aplicabilidad y solución.

## 6. Revisión humana y retirada

### T8 — Admitir versiones revisadas al piloto

**Prioridad:** antes de invitar. **Dependencias:** T3, T4, T7. **Tamaño:** tres cambios M/S.

**A. Registro:** ampliar `TourMetadata` en `backend/src/types/tourQuality.ts` con un registro interno `pilotRelease`: versión del registro, estado aprobado/retirado, referencia privada de persona revisora, fecha y huella del contenido aprobado. Guardarlo mediante un script administrativo de alcance limitado, sin nueva pantalla de administración.

La huella usa una serialización estable de idioma, introducción, paradas ordenadas, textos, coordenadas, créditos, imágenes y atribuciones, geometría revisada e identidades de los audios finales. Excluir contadores, fechas volátiles y el propio registro. Vincular también la versión de derechos. La aprobación se escribe solo si el contenido sigue siendo el mismo al terminar la revisión; un cambio concurrente obliga a repetirla.

**B. Recorrido:** guardar el `WalkingRouteData` revisado en los metadatos existentes y servirlo en el piloto desde `getWalkingRoute`. No recalcular silenciosamente otra geometría después de aprobar. Un cierre o incidente comunicado permite retirar el tour; un recorrido guardado tampoco garantiza condiciones actuales de la calle. Para simplificar, las primeras rutas no incluirán traslados externos complejos.

**C. Entrega:** una función común de admisión comprueba registro, huella vigente y fuentes permitidas. Conectarla a listado, detalle, recorrido y ambos GET de audio. Filtrar el listado antes de paginar y calcular totales. Las respuestas públicas solo muestran «Revisado por una persona el…» cuando coincide la versión; nunca mostrar la identidad privada sin decidirlo expresamente.

La preparación interna puede escuchar borradores bajo acceso del equipo. La retirada bloquea nuevas entregas y purga las cachés propias que pudieran servirlas; no se promete recuperar copias ya descargadas. No crear un campo de aprobación editable desde las peticiones de participantes.

**Aceptación y verificación:** un tour aprobado funciona por todas las rutas; cambiar una frase, foto, referencia, audio o geometría impide seguir sirviendo esa aprobación. Retirar el tour bloquea también enlaces directos, `Range` y respuestas de estado del audio. La auditoría automática por sí sola nunca concede acceso al piloto.

## 7. Avisos y privacidad en la experiencia actual

### T9 — Información accesible antes de empezar

**Prioridad:** antes de invitar. **Dependencias:** T5; estado de revisión de T8. **Tamaño:** M.

**Dónde:** `TourExperience.tsx`, `TourAudioPanel.tsx`, `listeningCopy.ts`, `TourExperience.css` y pie compartido.

| Ubicación | Cambio |
|---|---|
| Cabecera del tour | «Prototipo experimental · Texto y voz generados con IA», visible también entrando por enlace directo. |
| Antes de iniciar la experiencia | Aviso breve: ruta orientativa; respetar señales, cruces, cierres y accesos; detenerse para consultar el móvil. Botón «Entendido, empezar». |
| Reproductor compacto y normal | Etiqueta de IA y enlace «Sobre esta voz». |
| Menú/información dentro del tour | Fuentes y licencias, privacidad, responsable/contacto y reporte de errores. No depender del pie tapado por la pantalla fija. |
| Historia y galería | Créditos específicos de texto y fotos, próximos al contenido. |

La confirmación inicial es una ayuda de seguridad, no consentimiento universal ni renuncia de derechos. Mantenerla en estado de sesión; no hace falta una base de datos de aceptaciones. No arrancar audio, seguimiento GPS o navegación externa al aceptar. Conservar transcripción y controles accesibles.

**Aceptación y verificación:** recorrer el tour desde un enlace directo a 390 px de ancho y con ampliación de texto. Avisos y enlaces se alcanzan con teclado; no quedan bajo el reproductor. El modo compacto conserva la etiqueta de IA. Comprobar ambos idiomas y ausencia de reproducción automática.

### T10 — Ubicación por elección y minimización

**Prioridad:** antes de invitar. **Dependencias:** T9. **Tamaño:** S/M.

**Dónde:** efectos y estado de ubicación en `TourExperience.tsx`; `listeningCopy.ts`; prueba de navegador existente.

**Cómo:** eliminar el efecto que incrementa `locationAttempt` al abrir el mapa. Mostrar «Usar mi ubicación para situarme en el mapa» y «Continuar sin ubicación» antes del permiso del navegador. Activar `watchPosition` solo tras la elección. Añadir «Dejar de usar mi ubicación»: ejecutar `clearWatch`, borrar coordenadas de estado e impedir actualizaciones de callbacks tardíos. Limpiar también al desmontar; el resto del tour funciona con permiso denegado.

No enviar GPS al backend ni a modelos. Explicar que mapas e imágenes implican conexiones con terceros y que la zona del mapa puede revelar ubicación aproximada. El enlace actual a Google Maps abre un servicio externo y pasa el destino; indicarlo junto al enlace, sin abrirlo automáticamente.

**Aceptación y verificación:** contador de llamadas GPS permanece en cero al entrar y abrir mapa. Tras elegir, empieza; al desactivar, termina y no reaparece una coordenada tardía. En una inspección de red no salen coordenadas GPS hacia la API propia o modelos. Revisar por separado las peticiones del mapa y el enlace externo.

### T11 — Páginas legales y prácticas reales de datos

**Prioridad:** antes de invitar. **Dependencias:** inventario operativo y T10. **Tamaño:** M por paso.

**A. Datos y registros:** en `backend/src/server.ts` y `api/controllers/tours.ts`, eliminar el registro completo del cuerpo de peticiones y revisar IP, rutas, errores y logs de procesos. Mantener solo lo necesario para operar; no registrar credenciales, GPS ni comentarios personales. Inventariar también proxy, hosting, modelos, mapas, imágenes, almacenamiento local y copias de seguridad. Proponer y aplicar un plazo justificado de conservación, con borrado/rotación verificable, antes de escribirlo en la política.

**B. Información:** actualizar `/data-sources` y `AttributionFooter`; crear `/privacy` y `/about` con responsable/contacto, condiciones del piloto, función de IA y voz, proveedores reales, finalidades, bases jurídicas, destinatarios, transferencias, plazos y derechos cuando correspondan. Las condiciones pueden estar en `/about` para evitar páginas redundantes. Fuente concreta y licencia siguen junto a cada obra.

Eliminar la afirmación genérica de que todo el contenido procede de datos abiertos. Distinguir fuentes, herramientas de búsqueda/captura y modelos. No anunciar todo el procesamiento como local: el render de voz sí lo es en el flujo revisado, la narración utiliza servicios externos.

Para progreso de escucha, explicar almacenamiento local y ofrecer borrarlo. Mantener el piloto sin analítica ni publicidad; añadir consentimiento para almacenamiento no exento si se introduce. No instalar un banner genérico para sustituir el inventario. [Información oficial de RGPD](https://europa.eu/youreurope/business/governance-and-sustainability/digital-and-data-compliance/data-protection-gdpr/index_en.htm), [guía de cookies AEPD](https://www.aepd.es/guias/guia-cookies.pdf).

**Aceptación y verificación:** responsable y contacto reales, ningún marcador de posición visible; aviso coincide con peticiones y logs observados; borrar progreso funciona; plazos documentados tienen mecanismo operativo. Comprobar las condiciones del plan de IA y los contratos efectivos sin presumir que automatizar esté prohibido ni que cualquier plan cubra servicio a terceros.

## 8. Servicios de mapas: solución mínima para este piloto

### T12 — Eliminar el autocompletado del piloto

**Prioridad:** antes de usar la búsqueda con probadores. **Dependencias:** T1. **Tamaño:** S para piloto; ampliación posterior independiente.

**Dónde:** `frontend/src/components/form/LocationPicker/index.tsx`, `/api/geocoding/cities/route.ts` y entrada de selección de tours.

**Decisión mínima:** participantes eligen entre tours ya preparados; no se muestra el generador ni se llama al autocompletado. Desactivar también la ruta de geocodificación para participantes; esconder el formulario no basta. Si el equipo sigue usando ese formulario durante preparación, cambiarlo a envío explícito por botón/Enter, sin peticiones al escribir ni al seleccionar un resultado.

Antes de habilitar búsqueda general hay que coordinar todas las consultas, no solo el frontend. Se han localizado clientes en `NominatimGeocoder.ts`, `TourLocationSelection.ts` y `poi/LiveCityCandidatesV8.ts`, además de ejecutores de validación. La alternativa técnica es un único acceso de salida en el backend existente, con cola/caché, identificación y URL configurable, usado también por los trabajadores. Una variable en memoria en cada proceso no es un límite global. No ejecutar capturas masivas como si fueran búsquedas humanas.

El servicio público prohíbe autocompletado y limita el tráfico agregado de la aplicación a una petición por segundo. El uso por lotes tiene condiciones adicionales. Esta propuesta presupone una decisión informada del responsable de usarlo y respetar su [política](https://operations.osmfoundation.org/policies/nominatim/); no propone convertirlo en un geocodificador público genérico.

**Aceptación y verificación:** en el piloto, cero peticiones de geocodificación desde la sesión de participante, incluso mediante llamada directa al endpoint. En la herramienta interna, teclear no llama al proveedor. Si se habilita salida compartida, medir solicitudes de dos llamadores simultáneos y comprobar caché, separación temporal y fallo del proveedor.

### T13 — Créditos y geometría del mapa

**Prioridad:** antes de invitar. **Dependencias:** T8 para recorrido revisado. **Tamaño:** S.

**Dónde:** `frontend/src/components/tour/map/TourMap.tsx` y configuración efectiva de teselas.

**Cómo:** usar `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, conservar créditos OSM/FOSSGIS visibles sin taparlos con controles y mantener el enlace de corrección. Respetar caché HTTP y Referer adecuados; no aplicar a las teselas la política de no caché de los audios privados. Sin precarga masiva ni mapas offline. No hace falta cambiar a un proveedor de pago para este volumen. [Política de teselas](https://operations.osmfoundation.org/policies/tiles/).

Conservar el estado de ruta no disponible; no inventar líneas transitables. La preparación que consulte FOSSGIS mantiene sus límites y créditos. No corregir `/driving` en el endpoint `routed-foot` como si fuera por sí solo un error de perfil: el servicio utilizado es peatonal. [Condiciones del servicio](https://routing.openstreetmap.de/about.html).

**Aceptación y verificación:** mapa pequeño y ampliado conservan atribuciones; peticiones correctas y sin precarga; fallo de ruta muestra estado explícito. Un tour revisado utiliza la geometría guardada, y la navegación externa se distingue de ese recorrido.

## 9. Orden de trabajo y lista de cierre

Las tareas se dividen en cambios pequeños por los pasos indicados. Las pruebas acompañan a la lógica que verifican; no se necesita una plataforma de cumplimiento, otro framework de pruebas ni activar el corpus histórico.

- [x] T1: barreras y lectura del piloto implementadas; pruebas locales de Caddy/Next/API. Pendiente instalar y verificar HTTPS/puertos en el alojamiento real.
- [x] T2: política antes de la captura y bloqueo de web genérica en piloto, con prueba de cero peticiones Firecrawl.
- [x] T3: auditoría de inventario ejecutada en lectura y exclusión de material anterior; no se han borrado capturas ni reescrito firmas.
- [ ] **Control A operativo:** confirmar alcance, invitaciones y aislamiento del despliegue real.
- [x] T4–T5: créditos persistidos y visibles; licencias por fuente/foto y bibliografía de investigación.
- [x] T6–T7 técnicos: identidad del modelo fijada, huella de referencia comprobada, aviso audible, trazabilidad de archivos y progreso versionado.
- [ ] T6–T7 externos: confirmar documentalmente origen/derechos de voz y obligación de marcado; escuchar y revisar el MP3 final que se compartirá.
- [ ] **Control B real:** admitir una parada con fuentes y derechos resueltos, y audio final revisado.
- [x] T8: script de preparación/revisión/aprobación/retirada y entrega ligada a huella, fuentes, geometría y audio.
- [x] T9–T11 técnicos: avisos en el tour, GPS opcional, páginas informativas, borrado del progreso y minimización de registros.
- [ ] T11 operativo: responsable/contacto/contratos reales y retención implantada; configuración de rotación entregada, sin instalarla en un host desconocido.
- [x] T12–T13: geocodificación del piloto desactivada, búsqueda interna manual y teselas/créditos del mapa.
- [ ] **Control C:** ruta revisada en texto, audio y calle por una persona. No se ha emitido aprobación humana.
- [ ] Cerrar las decisiones jurídicas/operativas antes de exponer el piloto a participantes.

La revisión del texto y del audio puede empezar desde casa. La primera prueba en la calle debe comprobar accesos, cruces, señales, cierres y correspondencia entre instrucciones y entorno. Registrar fecha, versión y alcance de esa comprobación; no prometer ausencia de peligro ni accesibilidad física que no se haya verificado. El aviso no elimina responsabilidad por negligencia.

## 10. Verificación técnica al implementar

Usar Jest y las pruebas existentes del backend para los cambios de lógica. Ejemplos de comandos desde la raíz; solo seleccionar los archivos que se hayan modificado y añadir las pruebas nuevas correspondientes:

```sh
npm --prefix backend test -- --runInBand --runTestsByPath src/services/TourBlueprint.test.ts src/services/MultilingualTourGenerator.test.ts src/services/__tests__/TourAudioService.test.ts
npm --prefix backend run build
npm --prefix frontend run build
```

Para navegador, ampliar `frontend/scripts/test-tour-listening.cjs`, que ya intercepta peticiones y no escribe en la base de datos. Requiere un servidor de ensayo y Playwright/Chromium disponibles mediante su configuración actual; no está integrado en `package.json`. Ejecutarlo con `node frontend/scripts/test-tour-listening.cjs` una vez configurado. No instalar otro framework por rutina.

Además de las pruebas de interfaz, comprobar acceso HTTP real y un MP3 real: los mocks del navegador no prueban autenticación del despliegue, licencias ni síntesis. Evitar pruebas que realicen capturas prohibidas o cargas contra proveedores públicos; simular sus respuestas para los casos adversos.

## 11. Decisiones que requieren información externa al código

| Pendiente | Qué hay que resolver | Afecta a |
|---|---|---|
| Modalidad efectiva | Invitación, gratuidad, ciudades e idiomas de la primera prueba. | T1, T8, alcance completo. |
| Responsable y contacto | Identidad que presta el servicio y canal real para errores/derechos. | T9–T11. |
| Despliegue y contratos | Puertos efectivos, proxy, alojamiento, proveedores y plan de IA aplicable a la experiencia ofrecida. | T1, T11. |
| Derechos de fuentes | Permisos y licencias para cada uso; resolver materiales pendientes. | T2–T5. |
| Origen de voz | Confirmación documental de la referencia actual o referencia nueva trazable. | T6. |
| Reglamento de IA | Rol del proyecto, supuestos y calendario vigente; marcado técnico exigible y forma de verificarlo. | T7 y entrega del audio. |
| Conservación de datos | Finalidades, base jurídica, plazos y mecanismo de borrado, también en proveedores/copias. | T11. |
| Primera ruta física | Persona revisora, reglas turísticas/locales y de monumentos; valorar cobertura de responsabilidad apropiada. | T8 y prueba en calle. |

Estas cuestiones no impiden preparar los cambios ni sus pruebas. Sí impiden anunciar prácticas desconocidas o dar por cerrada la comprobación correspondiente. Cobros, apertura general, voces aportadas por usuarios, navegación desde GPS y mapas offline quedan fuera de este piloto y requerirían revisar el alcance antes de incorporarlos.

## 12. Estado de esta entrega

Los cambios de código y las configuraciones de despliegue privado están aplicados en el árbol local. La guía [Operación del piloto](pilot-operations-20260908.md) explica las variables, revisión humana, retirada y configuración de registros. La API permanece cerrada si faltan los datos del aviso o las declaraciones de apertura; tampoco sirve tours sin aprobación de su versión vigente.

El inventario local del 8 de septiembre encontró un tour (`612a437d-5858-4b7e-bbab-97b63dbbccf6`, Seville, español) con doce capturas pendientes de permiso y una política de investigación antigua. Se mantiene para el equipo, excluido del piloto. No se han cambiado sus fuentes, publicado una traducción ni fabricado una revisión.

La referencia `guide-es-a.wav` coincide con SHA-256 `475753e08fe9bb194991fd4d7b50b62a0d65d9e371b94db43a28567160ab65bb`. La ficha junto al preset distingue la evidencia de caché sintética de la confirmación documental aún pendiente. No se generó otro MP3 durante esta implementación: había un trabajo ajeno de TTS reservando la GPU, que se ha respetado. Las pruebas de preparación de voz no requieren GPU.

Durante la revisión se encontraron rutas antiguas de audio y previews fuera de la admisión. Se bloquearon en piloto. También se actualizó Next de 15.2.2 a 15.5.25 y su configuración ESLint; PostCSS se fija a 8.5.23 dentro de Next y se actualiza nanoid en el lockfile. La auditoría de dependencias de producción del frontend termina con cero vulnerabilidades reportadas. Esto no equivale a una auditoría completa del alojamiento ni elimina la necesidad de actualizarlo. Véanse la [corrección de seguridad de agosto](https://nextjs.org/blog/august-2026-security-release) y la [versión 15.5.25](https://github.com/vercel/next.js/releases/tag/v15.5.25).

Verificación realizada:

- Compilación del backend y frontend, comprobación de tipos y lint de la compilación frontend.
- Pruebas del backend sobre fuentes, blueprints, generación multilingüe, audio, admisión, HTTP/Range y configuración de apertura.
- Cinco pruebas Python de preparación, pronunciación e identidad de voz.
- Navegador móvil: aviso antes de audio/GPS, continuidad de escucha, posición versionada, errores, galería, mapa, almacenamiento bloqueado, privacidad, francés, parada del GPS con callback tardío y búsqueda manual.
- Caddy y Next de producción en servidores temporales de loopback con credenciales ficticias: invitación, cabeceras falsas, origen privado, clave de participante y operaciones prohibidas. La prueba es HTTP local; el certificado/dominio HTTPS y los puertos del despliegue final siguen pendientes.

Las casillas externas se dejan abiertas intencionadamente: el código no identifica al responsable, contrata proveedores, concede derechos, realiza una inspección física ni emite un dictamen jurídico. No se ha desplegado ni anunciado cumplimiento legal total.


## Actualización del 19 de septiembre: cookies y estadísticas

La integración posterior de Umami modifica el supuesto original de piloto sin
analítica. Se añade consentimiento previo para la medición opcional, con rechazo
equivalente, ajustes permanentes, retirada entre pestañas y elección válida durante
180 días. El idioma y el progreso se explican separadamente en `/privacy`; el GPS
conserva su permiso independiente. Sin Umami configurado no aparece un banner de
estadísticas. Véase [operación de Umami](../../deployment/UMAMI.md).

Orden acordado: terminar cookies y preferencias; después preparar el plan de
alojamiento en Hetzner. El responsable confirma que aún no dispone de dominio ni
alojamiento. No se ha contratado ni publicado nada en este paso. Las comprobaciones
de despliegue y los datos reales del aviso siguen pendientes.
