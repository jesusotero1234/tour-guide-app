# Propuesta V8: selección esencial y búsqueda fiable para cualquier ciudad

Fecha: 2026-08-13

Estado: **propuesta de implementación y validación mediante canary; el flujo productivo por defecto permanece intacto**

## Diagnóstico

Hay dos fallos independientes:

1. **La ruta optimiza proximidad antes que relevancia editorial.**
   - Sagrada Família fue el candidato mejor puntuado, pero el sistema solo exige “algún flagship”, no identidades imprescindibles.
   - Además, el bucle de flagships compara la cantidad total seleccionada, no la cantidad real de flagships, en [`RouteSelection.ts`](../../backend/src/services/poi/RouteSelection.ts).
   - Resultado: un monumento céntrico puede satisfacer la cuota y desplazar al icono que define la ciudad.

2. **La investigación mezcla descubrimiento, captura y validación en un flujo rígido.**
   - Dominios y país están parcialmente fijados para algunas ciudades en [`NarrativeSourcesV6.ts`](../../backend/src/services/poi/NarrativeSourcesV6.ts).
   - Se ejecutan seis búsquedas fijas y hasta ocho capturas aunque el problema real cambie por parada, en [`NarrativeResearchV6.ts`](../../backend/src/services/poi/NarrativeResearchV6.ts).
   - Wikimedia se intenta capturar como HTML y devuelve 403.
   - Las dos paradas con buenas fuentes fallaron porque el LLM tuvo que copiar literalmente fragmentos, no porque faltara grounding.

## Cambios propuestos

### 1. Elegir primero lo esencial y después resolver la geometría

- Reutilizar el resolver editorial existente para producir `requiredCanonicalIds`, con identidades Wikidata exactas.
- Resolver el núcleo editorial antes de calcular proximidad, duración u orden.
- Tratar esos IDs como restricciones duras: otro flagship nunca puede sustituir un lugar requerido.
- Corregir también el contador defectuoso del selector antiguo, aunque deje de ser la garantía principal.
- Añadir `wikidataId` a todos los candidatos estructurales y conservarlo durante ranking, selección y escritura.
- Seleccionar los lugares opcionales por contribución narrativa, evidencia disponible, variedad y cercanía a los lugares requeridos.

No habrá fixtures ni allowlists por ciudad. Barcelona será una validación real, no una regla codificada.

### 2. Dos bloques caminables y traslado libre

No se construirá un planificador de transporte.

Para recorridos de 120 minutos:

- Máximo dos bloques caminables.
- Máximo un enlace `self_transfer` entre bloques.
- El traslado no tendrá línea, vehículo, ruta, proveedor, instrucciones ni duración estimada.
- Texto fijo, no generado por el LLM:
  `La siguiente parada es {nombre}. Llega por el medio que prefieras y reanuda el recorrido allí.`
- La duración mostrará:
  - `guidedDurationMinutes`
  - `externalTransferTimeIncluded: false`
  - Copia visible: `≈120 min de experiencia guiada + traslado libre`
- Si los lugares imprescindibles necesitan más de dos bloques, devolver `route_review_required`; no eliminarlos silenciosamente.

Interfaz mínima:

```ts
type TourLegV8 =
  | {
      type: 'walking';
      fromStopId: string;
      toStopId: string;
      durationSeconds: number;
    }
  | {
      type: 'self_transfer';
      fromStopId: string;
      toStopId: string;
      durationSeconds: null;
    };
```

### 3. Separar descubrimiento de captura

Arquitectura:

- **SearXNG self-hosted:** descubrimiento web.
- **Firecrawl self-hosted:** `/scrape` y `/map`.
- **APIs de Wikimedia/Wikibase:** identidad, aliases, contenido y revisión.
- **Firecrawl Cloud:** completamente deshabilitado.

SearXNG se desplegará internamente con salida JSON y una imagen oficial fijada por digest. Firecrawl soporta conectarse a SearXNG, aunque el workflow narrativo lo consultará directamente para conservar diagnósticos por búsqueda y motor. [Firecrawl self-hosting](https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md), [API de búsqueda de SearXNG](https://docs.searxng.org/dev/search_api.html).

Firecrawl se reservará para páginas que realmente necesitan captura o renderizado, usando también `/map` para localizar contenido dentro de dominios oficiales conocidos. [Firecrawl Map API](https://docs.firecrawl.dev/api-reference/endpoint/map).

Interfaces versionadas:

```ts
interface NarrativeDiscoveryProviderV7 {
  search(input: {
    query: string;
    language: string;
    countryCode: string;
    limit: number;
  }): Promise<DiscoveryResultV7[]>;

  mapOfficialSite(input: {
    origin: string;
    search: string;
    limit: number;
  }): Promise<DiscoveryResultV7[]>;
}

interface NarrativeCaptureProviderV7 {
  capture(url: string): Promise<CapturedSourceV7>;
}
```

Las capturas Wikimedia utilizarán las APIs oficiales, evitando depender del scraping HTML. [MediaWiki Action API](https://www.mediawiki.org/wiki/API%3AQuick_start_guide), [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API).

### 4. Autoridades dinámicas y búsqueda adaptativa

Para cada ejecución:

- Obtener aliases, idiomas locales e identidad desde Wikidata.
- Derivar dominios oficiales desde `P856` del lugar, ciudad y hasta tres niveles de `P131`.
- Aceptar únicamente claims HTTPS no obsoletos.
- Registrar QID, revisión Wikidata, dominio y origen de cada autoridad.
- Si una redirección abandona el dominio registrado o la página no coincide con ningún alias del lugar, degradarla a fuente de descubrimiento.

Presupuesto por parada:

1. Hasta cuatro consultas deterministas.
2. `/map` en un máximo de tres dominios oficiales.
3. Captura de hasta doce URLs únicas.
4. Solo si quedan huecos, una llamada LLM para proponer hasta cuatro consultas adicionales.
5. Detenerse inmediatamente cuando la evidencia sea suficiente.

Se enviarán siempre el país y el idioma reales; desaparecerá el `country: 'ES'` fijo. Solo se reintentarán timeouts, 429 y 5xx. Los 403 y 404 se clasificarán, pero no se repetirán.

### 5. Grounding mediante spans, no citas copiadas por el LLM

- Segmentar cada captura en spans estables con `evidenceSpanId`.
- El curador seleccionará entre uno y tres IDs contiguos.
- El backend reconstruirá la cita exacta y comprobará que pertenece a la fuente indicada.
- El LLM no volverá a escribir citas literales manualmente.

Suficiencia mínima por parada:

- Identidad confirmada.
- Un detalle públicamente observable.
- Una contribución histórica relevante para el recorrido.
- Al menos uno de: función, conflicto/contraste o rasgo distintivo.

Una fuente primaria bastará para hechos atómicos directos. Las afirmaciones discutibles, causales o controvertidas exigirán dos publicaciones independientes.

Si falta evidencia para una parada requerida, se bloqueará y explicará. Si la parada es opcional, se probará una reserva del mismo bloque sin regenerar todo el tour.

## Estados y diagnóstico

Añadir razones explícitas:

- `core_disagreement`
- `required_identity_missing`
- `too_many_self_transfers`
- `guided_duration_infeasible`
- `no_results`
- `capture_blocked`
- `parse_empty`
- `authority_insufficient`
- `curator_contract_failed`

Registrar por fase: proveedor, idioma, país, resultados, URLs mapeadas, HTTP final, autoridad, cache hit, huecos de evidencia, sustituciones, cobertura del núcleo editorial y número de traslados libres.

## Verificación

Pruebas genéricas, sin fixtures de Barcelona:

- Un QID imprescindible alejado permanece aunque exista un flagship céntrico.
- Un flagship genérico no satisface otro QID requerido.
- El selector cuenta flagships reales, no elementos totales.
- Un tour de 120 minutos permite como máximo dos bloques y un `self_transfer`.
- `self_transfer` no contiene navegación, transporte ni duración.
- Más de un traslado produce revisión sin eliminar lugares esenciales.
- País e idioma llegan correctamente a SearXNG.
- Una búsqueda vacía activa la fase adaptativa; evidencia suficiente detiene nuevas llamadas.
- Wikimedia sigue funcionando aunque su HTML devuelva 403.
- Un span válido se acepta y uno alterado o perteneciente a otra fuente se rechaza.
- 429 se reintenta; 403 no.
- Los artefactos V6 y su replay permanecen inmutables.

Smoke test local:

- SearXNG responde JSON.
- Firecrawl `/search`, `/map`, HTML, PDF y protección SSRF funcionan.
- Ninguna petición alcanza Firecrawl Cloud.

Validación final:

- Ejecutar canaries vivos en tres ciudades sin snapshots de paradas concretas.
- Ejecutar Barcelona una sola vez y verificar manualmente que Sagrada Família aparece como identidad requerida y permanece en la ruta.
- Si el resolver editorial no la considera requerida, devolver revisión para QA; nunca añadir un hardcode.
- No lanzar escritores hasta que ruta y evidencia hayan pasado sus gates.

## Entrega para revisión por otro LLM

El documento de QA deberá incluir diagnóstico, contratos, resultados de pruebas, métricas del canary y diffs relevantes. El revisor responderá únicamente:

- `Approve`
- `Request changes`

Cada objeción deberá citar una sección o evidencia concreta, explicar el riesgo y proponer la corrección mínima. Deberá revisar especialmente:

- Que no haya lógica específica de Barcelona.
- Que una identidad imprescindible nunca pueda sustituirse por una cuota genérica.
- Que SearXNG y Firecrawl Cloud no sean dependencias externas.
- Que el sistema no intente resolver cómo viaja el usuario.
- Que la duración no incluya implícitamente el traslado libre.

## Supuestos cerrados

- Firecrawl Cloud seguirá eliminado.
- No se implementará planificación de transporte.
- Los usuarios elegirán cómo desplazarse entre bloques.
- Un tour de 120 minutos admite como máximo un traslado libre.
- No habrá fixtures ni listas manuales por ciudad.
- Los artefactos V6 permanecerán intactos.
- Primero se validará mediante canary; no se cambiará todavía el flujo productivo por defecto.
