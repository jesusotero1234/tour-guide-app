# Plan de internacionalización después del prototipo

Fecha: 8 de septiembre de 2026.
Estado: propuesta de diseño; implementación aplazada hasta estabilizar el prototipo y sus textos.
Alcance de este trabajo: documentación. No cambia la aplicación ni habilita idiomas.

## 1. Decisión y significado de «escalable»

Mantener una sola interfaz y un catálogo de traducciones por idioma. Todas las páginas comparten componentes, comportamiento y estilos. Añadir un idioma debe requerir traducción, configuración y validación, sin copiar páginas.

La estructura permite ampliar progresivamente; no significa traducir automáticamente a todos los idiomas del mundo. Cada idioma publicado necesita cobertura y revisión. Cada funcionalidad nueva debe incluir sus textos en todos los idiomas de interfaz que estén publicados. Los idiomas futuros se incorporan cuando se decide atender ese mercado.

Primero se termina el prototipo. Después se extraen sus textos y se incorpora esta estructura. No se exige rediseñar ahora la interfaz ni instalar dependencias. Estabilizar el diseño reduce trabajo de traducción, aunque no elimina futuras mejoras ni ajustes por textos largos o escrituras distintas.

## 2. Punto de partida verificado

- `frontend/src/types/api.ts` declara en, es, fr, de e it para tours.
- `frontend/src/components/tours/SearchBox.tsx` permite filtrar por esos cinco idiomas; no cambia el idioma de la web.
- `frontend/src/components/tour/listeningCopy.ts` contiene textos de escucha en inglés, español y francés; los demás códigos reciben inglés.
- `frontend/src/app/page.tsx` contiene textos ingleses directamente en la página.
- `frontend/src/app/layout.tsx` fija `lang="en"`.
- El frontend utiliza Next.js 15.5.25 y no tiene una biblioteca de traducción en sus dependencias directas.

Estas observaciones describen el código revisado, no certifican disponibilidad ni calidad del audio en producción. Antes de implementar se debe actualizar este inventario sobre el prototipo final y comprobar las capacidades reales del backend y del catálogo.

## 3. Tres conceptos independientes

| Concepto | Qué determina | Fuente propuesta |
|---|---|---|
| Idioma de interfaz | Navegación, formularios, controles, errores y metadatos | Idioma de la URL y catálogo de traducciones |
| Idioma del tour | Narración y transcripción solicitadas | Campo de idioma del tour, validado por backend |
| Disponibilidad real | Si un tour concreto tiene texto y audio listos en ese idioma | Estado del contenido y audio en backend |

Ejemplo: `/es/tours/123` presenta los controles en español. El tour 123 puede estar narrado en italiano. Cambiar el idioma de interfaz no traduce, regenera ni sustituye su audio.

Al crear un tour, se propone el idioma de interfaz si está admitido para narración. El usuario puede elegir otro. Si no está admitido, se pide escoger entre las opciones disponibles; no se promete generación por el mero hecho de tener la interfaz traducida.

No se debe unir el tipo de idioma de interfaz al tipo de idioma de generación. Tampoco deducir disponibilidad de audio a partir de cualquiera de ellos.

## 4. Estructura propuesta

```text
frontend/src/
  app/
    [locale]/
      layout.tsx
      page.tsx
      tours/                  # adaptar a las rutas reales del prototipo final
  components/                # una sola implementación de la interfaz
  i18n/
    config.ts                # idiomas de interfaz publicados, nombre nativo, dirección
    dictionaries.ts          # carga explícita del catálogo solicitado
    messages/
      en.json
      es.json
      fr.json
```

Es un esquema futuro, no un inventario de archivos existentes. Las rutas técnicas y API no se trasladan bajo `[locale]` por defecto. Antes de migrar, inventariar también enlaces compartidos y rutas de acceso del prototipo.

Usar claves estables con significado, como `home.title`, `tourForm.language` o `player.audioUnavailable`. Cada archivo contiene las mismas claves. Inglés será el catálogo fuente inicial, porque es la base actual; español y los demás serán traducciones revisadas.

Las frases completas se traducen como unidades. No concatenar fragmentos para construir oraciones. Usar parámetros con nombre para valores variables y comprobar que coincidan entre idiomas. No introducir HTML arbitrario en los mensajes.

Partir de diccionarios y carga por idioma, siguiendo el patrón de Next.js. Para fechas y números, usar `Intl`; para plurales, las reglas del idioma mediante `Intl.PluralRules`, sin asumir únicamente singular y plural. Si el inventario final requiere mensajes complejos de forma generalizada, evaluar entonces una biblioteca mantenida con soporte ICU, en vez de escribir un intérprete propio. La elección concreta de dependencia queda aplazada al inventario final.

## 5. Selección y navegación

Publicar rutas como `/en`, `/es` y `/fr`. La URL determina siempre el idioma de una página localizada, también cuando alguien comparte un enlace.

En una entrada sin idioma, resolver: preferencia guardada → idioma compatible del navegador → inglés. Guardar la elección explícita en una cookie legible por servidor para evitar mostrar primero inglés y cambiar después. Normalizar variantes como `es-MX` a `es` cuando solo exista español general. No crear variantes regionales hasta que haya diferencias necesarias.

El selector de cabecera muestra nombres propios: English, Español, Français. Conserva la página, el identificador del tour y los parámetros pertinentes. El cambio debe preservar los datos introducidos en formularios y el progreso de escucha; esto debe verificarse al diseñar los límites de navegación del prototipo final.

Aceptar únicamente idiomas publicados desde una lista explícita. Una URL con idioma desconocido devuelve una página de no encontrado; no cargar archivos a partir de rutas arbitrarias. Las rutas antiguas sin idioma deben seguir funcionando mediante redirecciones que conserven destino y parámetros. La detección por preferencia debe usar redirección temporal para no fijar una elección personal en caché.

## 6. Cómo crecer y mantener las traducciones

### Añadir un idioma

1. Elegir idioma y alcance comercial; comprobar aparte si se ofrecerá narración.
2. Crear su catálogo a partir de las claves del catálogo fuente.
3. Traducir con contexto de cada pantalla y un pequeño glosario común. La IA puede preparar borradores; la publicación exige revisión lingüística.
4. Comprobar claves, parámetros, plurales, enlaces y flujo completo en móvil.
5. Revisar textos largos, caracteres, fuentes y dirección de escritura.
6. Habilitar el idioma en la configuración de interfaz y publicar sus rutas.
7. Habilitar narración solo después de validar generación, pronunciación y audio de forma independiente.

Para portugués, por ejemplo, se añade `pt.json` y su configuración; no una nueva página principal. Para árabe también se requiere validar escritura de derecha a izquierda y establecer `dir="rtl"`. Compartir componentes reduce el trabajo, pero no elimina esas comprobaciones.

### Añadir una pantalla o cambiar un texto

Cada cambio actualiza el catálogo fuente y todas las traducciones afectadas de los idiomas publicados. Una corrección puramente visual no requiere retraducir mensajes que no cambian. Una nueva funcionalidad sí requiere traducciones en todos los idiomas habilitados para esa funcionalidad.

La igualdad de claves detecta traducciones ausentes, pero no una traducción antigua cuyo original ha cambiado. Por eso la revisión del cambio debe identificar también los mensajes modificados y exigir su actualización lingüística, aunque conserven la misma clave.

Los catálogos se guardan con el código y se publican en la misma versión que sus componentes. Inicialmente no hace falta un gestor externo de traducciones. Evaluarlo cuando varios traductores, entregas frecuentes o muchos idiomas hagan difícil mantener la revisión en el repositorio.

El coste de componentes no crece por idioma; el coste de traducción y revisión sí crece con los textos modificados y los idiomas publicados. No hay una arquitectura que elimine ese trabajo editorial.

## 7. Calidad, rendimiento y publicación

- Exigir cobertura completa de mensajes para cada idioma publicado. Bloquear la entrega si faltan claves o no coinciden parámetros; el inglés de reserva será una defensa ante errores inesperados, no la forma normal de publicar un idioma incompleto.
- Traducir también estados vacíos, errores, accesibilidad, ayuda, pie y metadatos. Mostrar mensajes localizados a partir de códigos de error del backend; no exponer directamente errores técnicos como texto de interfaz.
- Cargar solo el catálogo del idioma solicitado. Pasar a componentes de cliente únicamente los mensajes que necesiten; no enviar todos los idiomas al navegador.
- Establecer `html lang` y dirección según la interfaz. Marcar el idioma de transcripciones cuando difiera. Validar teclado, lector de pantalla y ausencia de recortes con traducciones largas.
- Para páginas públicas indexables, definir títulos, descripciones, URL canónica y alternativas `hreflang` coherentes. Publicar alternativas únicamente cuando existan; no indexar páginas privadas o tours restringidos por añadirles un prefijo de idioma.
- Cualquier caché de páginas o contenido localizado debe distinguir idioma. No mezclar respuestas basadas en cookies de usuarios distintos.
- La traducción de interfaz no dispara generación ni costes de audio. No traducir textos estáticos mediante llamadas a IA en cada visita.

## 8. Fases después de cerrar el prototipo

| Fase | Trabajo | Condición para terminar |
|---|---|---|
| 0. Prototipo | Cerrar flujo, componentes y textos principales | Base de producto suficientemente estable para traducir |
| 1. Inventario | Revisar rutas, mensajes, errores y capacidad real de narración | Alcance y lista de idiomas iniciales confirmados |
| 2. Base | Extraer inglés; añadir rutas, carga, selector y preferencia | Mismo comportamiento del prototipo, enlaces anteriores compatibles |
| 3. Primera traducción | Completar español en todo el flujo y migrar textos de escucha a la base común | Navegación, formulario y escucha revisados en inglés y español |
| 4. Ampliación | Completar francés; después alemán e italiano según prioridad | Cada idioma cumple los mismos controles antes de habilitarse |
| 5. Nuevos mercados | Añadir catálogos y validar narración por separado | Nuevo idioma sin duplicación de páginas |

El orden es una propuesta de entrega, no una promesa de soporte actual. No iniciar estas fases durante el trabajo del prototipo por la mera existencia de este documento.

## 9. Criterios de aceptación de la implementación futura

1. Entrar directamente en `/es` muestra español desde la respuesta inicial.
2. La selección explícita se recuerda; abrir un enlace `/fr/...` respeta francés aunque la preferencia sea español.
3. Cambiar idioma conserva destino, datos de formulario y progreso; no cambia ni regenera la narración.
4. Los enlaces previos al cambio siguen llegando al recurso correcto.
5. No se publica ningún catálogo incompleto; un mensaje fuente modificado recibe revisión en todos los idiomas publicados.
6. Los errores y mensajes accesibles forman parte de la cobertura, no solo el texto visible de la página principal.
7. Añadir un idioma con la misma dirección de escritura no requiere copiar componentes ni páginas.
8. Se comprueba al menos un tour real con texto y reproducción antes de anunciar narración en un idioma.
9. El navegador no descarga los catálogos de todos los idiomas.

Validación futura: comprobación automática de catálogos, build del frontend y pruebas centradas en selección, persistencia, enlaces antiguos y conservación del estado; revisión visual y lingüística del flujo completo por idioma. No se ejecutan pruebas de aplicación por la creación de este documento.

## Referencia

Patrón de rutas por idioma y diccionarios: [Next.js 15 — Internationalization](https://nextjs.org/docs/15/app/guides/internationalization). Al implementar, contrastar los detalles con la versión de Next.js que utilice entonces el proyecto.
