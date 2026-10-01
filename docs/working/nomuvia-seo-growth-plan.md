# Plan de visibilidad en Google y captación para Nomuvia

Fecha: 20 de septiembre de 2026. Estado: primera fase y ampliación al catálogo publicado implementadas en `nomuvia.com`. El diagnóstico y el calendario original de abajo describen el punto de partida; el alcance se amplió después por petición del propietario.

## Ampliación al catálogo y a los cinco idiomas

Publicada el 20 de septiembre en `20260920-seo-catalog`, reutilizando la plantilla existente:

- **55 páginas de ciudad y 66 páginas de tour**, más el catálogo: **122 URLs en el sitemap**. Son 11 recorridos generales en cinco idiomas (55 versiones) y 11 temáticos en español. No son 66 recorridos distintos ni se han inventado traducciones de los temáticos.
- Ciudades: Madrid, Alicante, Barcelona, Castellón de la Plana, Las Palmas de Gran Canaria, Murcia, Málaga, Palma, Sevilla, Valencia y Zaragoza. Idiomas: español, inglés, francés, alemán e italiano.
- Se conservan las cinco URLs iniciales de Madrid. La plantilla comparte diseño y traduce navegación, títulos, descripciones y explicaciones; las introducciones, paradas, fotos y audios proceden de cada versión ya publicada. Qwen preparó la base de traducciones de la plantilla, revisada antes de publicar.
- Enlaces desde el catálogo a las once ciudades y entre ciudades en el idioma elegido. Las equivalencias entre idiomas se comprobaron con las paradas y su orden; el sitemap y las páginas solo enlazan versiones realmente disponibles.
- Cada página comprueba únicamente los seis tours de su ciudad. Las retiradas siguen produciendo 404 y desaparecen del sitemap; un fallo temporal de la API produce error, sin publicar una lista vacía.
- El sitemap conserva la dirección ya enviada a Search Console. La confirmación «Correcto» del propietario corresponde al envío inicial; todavía no se ha comprobado que Google haya leído esta ampliación o indexado sus URLs.

La verificación pública detectó el límite compartido de la beta: 100 peticiones por 15 minutos para todas las lecturas del frontend, que agotaban dos lecturas seguidas del sitemap. Se ajustó la configuración a 1.200 peticiones por minuto y se reinició el servicio de API, sin cambiar su código, los tours ni los audios. No equivale a una prueba de carga ni a un límite por visitante. Detalles y reversión en [estado de Hetzner](../../deployment/pilot/hetzner-status.md).

Validación final: las 122 URLs públicas responden 200 con títulos únicos, canonical, idiomas recíprocos, etiqueta de Google y transcripciones completas. Comprobados en navegador móvil/escritorio los nuevos idiomas fr/de/it, sus mapas y muestras de audio real; también la entrada al reproductor italiano y su reproducción. Evidencia: [verificación de la ampliación](../../output/seo/catalog-expansion-verification.json).

Pendientes del plan de crecimiento: comprobar rastreo/indexación e impresiones en Search Console, establecer la línea base, contrastar las rutas con viajeros y preparar distribución/colaboraciones. Las páginas individuales de monumentos siguen fuera de esta entrega. No se han enviado mensajes ni publicado campañas.

## Estado de la primera entrega (histórico)

- Publicadas las cinco páginas de Madrid de este plan, con texto inicial del servidor, transcripciones completas, muestra de audio, mapa bajo demanda y enlaces al reproductor existente.
- Retirado el bloqueo global de indexación. Catálogo y cinco páginas localizadas admiten indexación; reproductores, API y páginas auxiliares mantienen `noindex`. Disponibles `robots.txt` y `sitemap.xml`, con seis URLs canónicas.
- Títulos y descripciones propios, canonical, enlaces entre idiomas equivalentes y datos estructurados de organización/navegación. No se asigna una fecha de actualización ficticia al sitemap.
- Instalada la etiqueta de verificación de Google facilitada por el propietario y comprobada en el HTML público, incluida la portada redirigida. El propietario ha confirmado la verificación de la propiedad y el envío de `sitemap.xml` con estado «Correcto» en Search Console. No se ha confirmado aún la indexación ni hay una línea base de clics/impresiones.
- Umami 3.4.0 instalado en el mismo servidor, con base de datos separada, panel privado y recogida sujeta a consentimiento. Procedencia limitada a canales conocidos, sesión de 30 minutos y evento `tour_activated` tras iniciar un tour y registrar 120 segundos de escucha. Borrado diario de datos de más de 90 días. Ver [operación de Umami](../../deployment/UMAMI.md).
- Verificados compilación de producción, páginas y sitemap, retirada de tours, caída temporal del backend, controles del piloto, navegación móvil, audio real y conservación del reproductor. La prueba pública de medición confirmó llegada desde Google, escucha de introducción y parada, activación única tras 120 segundos, persistencia en Umami y cese de envíos al retirar el permiso; sus datos se aislaron y eliminaron.

La ampliación posterior a ciudades e idiomas se describe arriba. Sigue pendiente observar rastreo, indexación e impresiones en Search Console y contrastar las rutas con viajeros.

## Decisión recomendada

Usar SEO como canal de adquisición: quien busca una ruta concreta llega a una página útil y puede empezar a escuchar sin registrarse. El primer objetivo de negocio es conseguir tours escuchados por viajeros que llegan desde Google.

Empezar con Madrid en español e inglés, aprovechar el catálogo existente y ampliar según resultados. Es una elección operativa, no una afirmación de que Madrid tenga la menor competencia. Mantener gratis, sin instalación, sin cuenta obligatoria y sin anuncios durante esta validación.

## Lo que ya existe y el bloqueo actual

| Observación comprobada | Consecuencia para el plan |
|---|---|
| `https://nomuvia.com/` redirige a `/tours`. El GET final devuelve 200 y `X-Robots-Tag: noindex, nofollow`. `/tours` devuelve la misma cabecera. | Prioridad máxima: permitir indexación de las páginas públicas seleccionadas. |
| La configuración versionada contiene esa cabecera global en `deployment/pilot/Caddyfile.nomuvia-public:4`. | Corregir la configuración desplegada, no solo las etiquetas de la aplicación. |
| `/robots.txt` y `/sitemap.xml` devuelven 404. | Publicar ambos. La ausencia de robots.txt no es por sí misma un bloqueo; el `noindex` sí lo es. |
| El HTML inicial de `/tours` incluye el mensaje de carga, título genérico «Nomuvia», sin canonical ni hreflang. Catálogo y detalle cargan los datos en el navegador. | Entregar en el HTML inicial el contenido de las nuevas páginas públicas. |
| El catálogo público paginado devuelve 66 registros en 11 ciudades y cinco idiomas: es, en, fr, de, it. | Hay contenido para empezar sin generar nuevas ciudades. Son versiones de tours, no 66 recorridos distintos. |
| 55 registros no incluyen título editorial; las fichas tienen un nombre de reserva. | Dar títulos descriptivos a los tours seleccionados antes de publicarlos como páginas SEO. |
| Hay audio, texto, paradas, fuentes, controles de publicación y Umami con consentimiento. | Reutilizar esta base y sus restricciones. |

Consultas del catálogo: `GET /api/backend/tours?limit=50&offset=0` y `offset=50`. El inventario no sustituye una revisión de calidad ni una prueba de reproducción.

El `noindex` indica que Google no debe incluir la página. Corregirlo habilita la indexación, pero no garantiza aparecer ni obtener una posición determinada. [Documentación de Google sobre noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

No se ha accedido a Search Console: aún no conocemos páginas indexadas, clics, impresiones ni consultas reales. Una búsqueda `site:` no sustituye esa información.

## Público e intención de búsqueda

| Prioridad | Persona y necesidad | Búsquedas candidatas | Página de entrada |
|---|---|---|---|
| 1 | Viajero que ya está en la ciudad y quiere caminar a su ritmo | «audioguía Madrid gratis», «ruta autoguiada Madrid», «Madrid audio walking tour» | Ciudad o ruta |
| 2 | Viajero que prepara una visita y compara recorridos | «self guided walking tour Madrid», «ruta Madrid de los Austrias» | Ruta con paradas, mapa y duración |
| 3 | Visitante que está delante de un monumento | «historia Plaza Mayor Madrid», «audioguía Plaza Mayor» | Lugar con audio y enlace a continuar el tour |

Estas consultas son hipótesis, sin estimaciones de volumen ni dificultad. Contrastarlas con resultados actuales y después con Search Console. No crear una página por cada sinónimo: una buena ficha puede responder a varias búsquedas relacionadas.

Mensaje principal: «Descubre Madrid a tu ritmo con audioguías gratuitas. Abre una ruta y empieza a escuchar, sin instalar nada ni crear una cuenta».

Evitar prometer «en dos horas» sin validar recorrido, escucha y pausas. Si la visita es exterior, decirlo: una audioguía del entorno del Palacio Real no equivale a su audioguía oficial del interior. «Free walking tour» puede atraer a quien espera un guía presencial; priorizar la intención autoguiada.

## Entregas y calendario orientativo

Las semanas se cuentan desde el inicio de la implementación. Son una secuencia de trabajo; los tiempos de Google son independientes.

| Cuándo | Prioridad y entrega | Condición para darla por terminada |
|---|---|---|
| Días 1–3 | P0. Abrir indexación de páginas públicas seleccionadas; crear robots y sitemap; verificar propiedad de dominio en Search Console. | GET público sin noindex en esas páginas; sitemap válido con URLs 200; inspección en vivo de una URL y envío del sitemap. |
| Semana 1 | P0. Establecer línea base y completar medición de entrada → escucha. | Comprobar eventos reales con consentimiento y conservar la procedencia durante la navegación. |
| Semanas 1–2 | P1. Publicar cinco páginas de Madrid y metadatos por idioma. | Texto y enlaces en HTML inicial; títulos propios; canonical e idiomas coherentes; inicio de audio probado en móvil. |
| Semanas 3–4 | P1. Revisar rutas con viajeros y distribuir las páginas; mejorar los puntos de abandono. | 5–10 pruebas como objetivo de investigación, problemas registrados y correcciones prioritarias hechas. |
| Mes 2 | P2. Añadir hasta tres lugares en es/en y valorar Sevilla o Málaga. | Cada página aporta contenido útil propio; revisar indexación, impresiones y uso antes de ampliar. |
| Mes 3 | P2. Consolidar páginas que funcionan y decidir expansión. | Comparar periodos equivalentes y documentar qué ciudad, idioma e intención generan escuchas. |

Ingeniería implementa y valida; el propietario verifica Search Console mediante su cuenta/DNS y revisa la propuesta editorial. No hace falta contratar herramientas SEO para esta primera fase.

## Primer lote: cinco páginas, reutilizando tours publicados

| URL propuesta | Contenido |
|---|---|
| `/es/madrid/` | Audioguías y rutas a pie por Madrid; selección breve y enlaces a tours. |
| `/en/madrid/` | Versión inglesa de la página de ciudad. |
| `/es/madrid/rutas/madrid-esencial/` | Página del recorrido general español, con nombre editorial por revisar. |
| `/en/madrid/rutas/madrid-highlights/` | Página del recorrido general inglés; confirmar equivalencia antes de vincular idiomas. |
| `/es/madrid/rutas/madrid-de-los-austrias/` | Tour temático español ya publicado. No inventar una versión inglesa. |

Se conserva `rutas` como segmento técnico común para simplificar la plantilla; el texto y el slug de contenido se localizan. La forma exacta de ese segmento no es el factor decisivo del SEO.

Referencias actuales del catálogo: recorrido general es `5b393fef-f58b-5e42-861e-b3baafbb3a8a`; general en `169a5a4c-3748-51e9-8aa6-5f96df1eb8f4`; Austrias es `bdfc7fda-3643-5a06-ae6a-23a09489fc1e`. Revalidar publicación, texto y audio al implementar.

Cada ficha debe responder, antes del botón de inicio, dónde empieza, qué incluye, idioma, distancia y duración estimada. Después: lista completa de paradas, mapa complementario, descripción original, muestra de audio, transcripción accesible, fuentes y fecha de revisión real. El usuario puede abrir el texto sin escucharlo.

Ejemplo de título de ciudad: «Audioguía de Madrid gratis: rutas a pie | Nomuvia». Ejemplo de ruta: «Madrid de los Austrias: audioguía gratis | Nomuvia». Redactar descripciones propias que expliquen el recorrido y el beneficio, sin rellenarlas de palabras clave.

Más adelante: `/es/madrid/lugares/plaza-mayor/`, únicamente si hay una parada publicada adecuada. Mantener una identidad estable del lugar y enlazar los tours relacionados; no duplicar su historia por cada tour que lo visita.

## Trabajo técnico concreto

1. **Indexación selectiva.** Retirar el noindex global de la configuración pública y aplicarlo donde corresponda. Mantener previews, generación y áreas internas fuera del índice. Conservar las protecciones del proxy y del modo piloto; habilitar SEO no requiere desactivarlas. Incluir robots y sitemap en las rutas públicas verificadas.
2. **Páginas desde el servidor.** Usar las capacidades existentes de Next.js para entregar texto, paradas y enlaces en la primera respuesta. Mantener reproductor y mapa interactivos. Google puede ejecutar JavaScript, pero el HTML inicial reduce dependencias para descubrir el contenido. [Google sobre SEO y JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
3. **Catálogo SEO pequeño y explícito.** Empezar con una selección versionada que relacione ciudad, país, idioma, slug, UUID y equivalencias revisadas; sin construir un CMS. Consultar solo tours admitidos y publicados. No generar audio ni tours al visitar una página. Invalidar páginas/sitemap cuando un tour se retire; contenido inexistente devuelve 404, y una caída temporal del backend no se presenta como página vacía válida.
4. **Compatibilidad.** Conservar `/tours/{id}` y su progreso como entrada al reproductor. Las fichas nuevas enlazan al flujo actual mediante «Empezar tour». Excluir el reproductor con noindex y del sitemap cuando la ficha pública cubra su descubrimiento; no combinar esto con canonical hacia otra URL. Cada ficha SEO tiene canonical hacia sí misma. No redirigir enlaces de escucha ni cambiar UUIDs.
5. **Idiomas.** La URL fija idioma del HTML, texto y metadatos. Añadir hreflang recíproco solo entre equivalentes reales y enlaces de cambio de idioma. Una ruta temática y una general no son traducciones aunque compartan ciudad. No redirigir una URL localizada según cookies o ubicación. Reutilizar el [plan de internacionalización](../architecture/internationalization-plan.md), cuyo inventario de septiembre debe actualizarse; la migración completa del reproductor puede esperar. [Google sobre versiones localizadas](https://developers.google.com/search/docs/specialty/international/localized-versions).
6. **Descubrimiento.** Enlaces HTML desde catálogo a ciudades, de ciudad a rutas y de rutas a lugares. Sitemap automático solo con URLs canónicas, públicas, indexables y existentes; `lastmod` basado en cambios reales. No incluir filtros, estados de escucha ni borradores. [Google sobre sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
7. **Calidad móvil.** Medir carga de una ficha y tiempo hasta escuchar. Evitar descargar todo el audio o bloquear el texto mientras carga el mapa. Revisar PageSpeed y problemas reales antes de optimizaciones extensas. Datos estructurados de organización y navegación pueden acompañar la información visible, sin inventar reseñas ni prometer resultados especiales.

Archivos de partida: `deployment/pilot/Caddyfile.nomuvia-public`, `frontend/src/app/layout.tsx`, `frontend/src/app/tours/[id]/page.tsx`, `frontend/src/components/tours/ToursList.tsx`, `frontend/src/lib/backendProxy.ts`, `frontend/src/lib/analytics.ts` y `backend/src/api/routes/pilot.ts`.

La distancia del endpoint `walking-route` y su duración corresponden al desplazamiento. Revisar aparte tiempo de narración y visita; el `durationMinutes` persistido no basta para prometer un tiempo exacto.

## Promoción y medición

Dedicar la mayor parte del esfuerzo inicial a las páginas y al primer uso. En paralelo, preparar una lista de diez alojamientos, blogs o comunidades relevantes para proponer la ruta concreta y recoger comentarios. Ese número es un objetivo de trabajo, no una previsión de acuerdos. Usar QR/enlaces medibles para colaboraciones locales y piezas breves de una parada que lleven a su ruta. Este plan no incluye enviar mensajes ni publicar campañas.

Las recomendaciones y enlaces editoriales deben aportar utilidad real. Evitar compra de enlaces y publicación repetitiva en comunidades. No depender exclusivamente de Google para obtener las primeras pruebas con viajeros.

| Qué medir | Fuente | Decisión que permite |
|---|---|---|
| URLs enviadas, descubiertas e indexadas; motivos de exclusión | Search Console | Detectar problemas técnicos o páginas que necesitan mejorar. |
| Impresiones y clics de consultas sin «Nomuvia», por página/país/dispositivo | Search Console | Saber si nos encuentran personas que aún no conocen la marca. |
| Entradas por fuente → tour abierto → tour iniciado → primera escucha | Umami, con consentimiento | Distinguir adquisición de uso real. |
| Minutos escuchados, avance por paradas y errores de audio | Eventos existentes y los mínimos que falten | Mejorar calidad y reproducción. |

Métrica principal propuesta: sesiones procedentes de búsqueda que inician un tour y acumulan al menos dos minutos de escucha. Es una definición operativa de activación, no una prueba de que la persona haya recorrido físicamente la ruta. No confundir pulsar inicio con escuchar ni reproducir una parada con completar el tour.

La instrumentación actual envía pathname, pero no referrer ni UTM, y tiene auto-track desactivado. Completar atribución mínima después del consentimiento, conservarla durante la sesión y deduplicar activaciones. No guardar GPS ni URLs arbitrarias. Comparar la conversión solo dentro de la muestra medida; no dividir eventos consentidos entre todos los clics de Search Console ni unir personas con consultas de Google.

Revisión semanal breve. Establecer una línea base antes de fijar objetivos numéricos de crecimiento. Si hay impresiones pero pocos clics, revisar intención y presentación; si hay clics pero poca escucha, revisar ficha e inicio; si escuchan y abandonan, revisar audio y ruta. Si las URLs no se indexan, investigar antes de multiplicarlas.

## Límites y criterio para ampliar

El horizonte de 90 días sirve para aprender y decidir; no es una promesa de tráfico. Google señala que un rastreo solicitado puede tardar días o semanas y que solicitarlo no garantiza inclusión. [Google sobre solicitudes de rastreo](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

Ampliar cuando las plantillas funcionen, haya contenido revisado y se hayan interpretado las primeras señales de indexación y uso. Si el volumen es pequeño, complementarlo con pruebas cualitativas; no declarar éxito ni fracaso por unas pocas visitas.

No convertir automáticamente todo el catálogo en miles de páginas. Google considera abusiva la generación masiva destinada a manipular posiciones sin valor para el visitante; automatizar contenido útil sí puede formar parte del producto. [Políticas de spam de Google](https://developers.google.com/search/docs/essentials/spam-policies).

Las preguntas frecuentes pueden ayudar al viajero, pero no deben venderse como atajo a resultados enriquecidos: Google retiró esa función en mayo de 2026. [Actualizaciones de Google Search](https://developers.google.com/search/updates#may-2026).

La infraestructura P0, la medición y la ampliación solicitada a ciudades/tours/idiomas ya están publicadas. El propietario confirmó la verificación en Search Console y el envío inicial del sitemap con estado «Correcto». Quedan por revisar las señales de indexación y uso, completar pruebas con viajeros y decidir futuras páginas de lugares.
