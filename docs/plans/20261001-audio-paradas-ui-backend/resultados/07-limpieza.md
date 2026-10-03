# 07 · Limpieza del backend: informe

Hecho el 2 de octubre de 2026 en la rama `plan/20261001-fase0`, sin confirmar en git ni subir nada a GitHub.

**Este paquete se hizo a medias a propósito.** Todo lo que borra código, tablas o datos necesita tu autorización con la lista exacta por bloque, y la
etiqueta de archivo antes de empezar. Esa parte no se ha tocado. Lo que no destruye nada sí se hizo.

## Resultado

| Punto | Estado |
|---|---|
| **7.9.1** Suites del núcleo que fallaban | Hecho: las tres se actualizaron (ver abajo) |
| **7.9.2** Pruebas sin conectar | Hecho: `npm run typecheck` (incluye pruebas y scripts del pipeline), `npm run test:admin` y `npm run test:node` |
| **7.9.3** CI | **Escrito, sin subir y sin probar en GitHub**: `.github/workflows/ci.yml` ejecuta `scripts/check-all.sh`. Subirlo necesita tu autorización |
| **7.6** `backend/tmp` | Hecho en lo que no mueve nada: variable `TOUR_DATA_DIR` (ruta absoluta; por defecto, el mismo `backend/tmp` de siempre), con prueba |
| **7.7** Documentación | Hecho: `ARCHITECTURE.md` nuevo, `docs/README.md` corregido y 13 documentos del pipeline anterior movidos a `docs/archive/` con su aviso |
| **7.5** Medición del servidor piloto | Medido (abajo); la refactorización **no** se hace: gana poco |
| **7.1** Experimentos y código muerto | **Hecho el 3 de octubre** (ver «Borrado del bloque 7.1» más abajo) |
| **7.2, 7.3, 7.4, 7.8** | **Sin hacer.** 7.2 necesita que elijas A o B; 7.3 y 7.4 mueven el pipeline de producción |
| Etiqueta `archive/pre-cleanup-20261001` | **Creada** antes de borrar: con ella se recupera todo |

## Las tres suites del núcleo

Se revisó en cada caso si estaba mal la prueba o el código. En las tres el código es más reciente y deliberado; las pruebas conservaban expectativas antiguas.

| Suite | Qué había cambiado | Qué se hizo |
|---|---|---|
| `NarrativeEditorialAgentsV6` | El perfil escritor usa `deepseek-flash` (tarifa propia desde el 10 de septiembre); la prueba esperaba `deepseek-v4-flash` | La prueba espera el id actual |
| `EditorialStructuredLlmV6` | El perfil `qwen38_hybrid` pasó su auditor B de `gpt-5.4-mini` a `gpt-5.4`; el perfil canario de Gemini conserva el barato | Dos pruebas: la primera espera el auditor completo y la segunda fija el auditor del canario y compara el resto con el híbrido |
| `LandmarkTiering` | La puntuación de historia penaliza ahora los museos que no son escenario de un hecho | La prueba espera el nuevo orden y comprueba lo que de verdad prueba: que con etiquetas mezcladas no se aplica el tope de «fama transferible» (la categoría sigue siendo `major`) |

`scripts/check-all.known-failures.txt` ya no las lista. Quedan cuatro suites de Jest (`CodexTourGenerator`, `AutonomousNarrativePilotV1`, `NarrativePilotDeepSeekV1`,
`NarrativeCalibrationV6`), que desaparecen con 7.1 y 7.2, y una prueba de voz.

## Borrado del bloque 7.1 (3 de octubre)

Autorizado por el usuario («borra lo otro») después de que terminara la regeneración. Dos commits en la rama `cleanup/7-1-dead-code`, sobre la etiqueta
`archive/pre-cleanup-20261001`. En total **219 archivos y unas 48.800 líneas menos** (38.200 de ellas en `backend/src`).

| Parte | Qué se borró |
|---|---|
| 1 | 47 scripts de experimento de `backend/scripts/validation/`, los 4 `validate-phase*.sh` y sus **28** entradas de `backend/package.json` |
| 2 | **87 fuentes** que solo alcanzaban las pruebas (26.879 líneas) y **78 pruebas** que solo las ejercitaban (13.264 líneas) |

**Cómo se eligió la parte 2.** La lista `reachability-c-tests-only-sources.txt` no se podía borrar tal cual: 69 archivos que se quedan (sobre todo pruebas) todavía
mencionaban esas fuentes, porque las pruebas de un módulo muerto importan también algún apoyo vivo. Se tomó el cierre: una fuente se borra solo si todo
lo que la importa también se borra, y se cuenta como prueba muerta la de su mismo nombre. Salieron **87 de 96**.

**Se quedan a propósito** (los usa código vivo o pruebas vivas): `TourBlueprint.test-support.ts`, `EditorialEvaluationManifest.ts`, `EditorialRouteBrief.ts`,
`EditorialSiteV3.ts`, `NarrativeBenchmarkV6.ts`, `NarrativeEvidenceFixturesV8.test-support.ts`, `PoiEnrichmentSnapshot.ts`, `TourQualityEvaluator.ts` y un fixture JSON.
También se quedan, porque el plan pide tu confirmación: `prisma/seed.ts`, `scripts/audit/multi-route-overlap.ts` (y el inspector de lotes que importa) y
`EditorialEvaluationInputV3.ts`.

**Comprobado tras cada parte:** `tsc` de `src` y de `scripts`; Jest completo (solo fallan `CodexTourGenerator`, que desaparece con 7.2-A, y la integración de
Overpass, que `check-all.sh` ya omite); 133 pruebas de Python de `scripts/admin`; `node --test`; carga de la app compilada en modo piloto; y `scripts/check-all.sh` en
**verde**. Las tres suites de módulos muertos que fallaban (`AutonomousNarrativePilotV1`, `NarrativePilotDeepSeekV1`, `NarrativeCalibrationV6`) desaparecen con su código,
y salen de `check-all.known-failures.txt`.

## Medición del servidor piloto

Cargando el código compilado con `PILOT_MODE=true` (sin base de datos):

| Qué se carga | Módulos | De ellos en `services/poi` | RSS |
|---|---|---|---|
| Solo el router piloto | 153 | 1 | 64 MB |
| `app` (el servidor completo) | 299 | 24 | 77 MB |
| `server` | 305 | 24 | 78 MB |

Las rutas de generación ya se cargan de forma perezosa y no entran en estas cifras. Los 24 módulos de `poi` entran por el repositorio de planos y por
`TourBlueprint`. Extraerlos ahorraría unos 13 MB sobre 78; no compensa tocar el servidor mientras se regenera el catálogo. Queda anotado por si el
servidor vuelve a ir justo de memoria.

## Qué no se pudo comprobar

- **El CI.** No hay forma de ejecutarlo aquí. Puede fallar la primera vez en GitHub por archivos que solo existen en este equipo; `check-all.sh` se ejecuta en verde en local.
- **`typecheck` excluye cuatro scripts** que no compilan hoy y son candidatos a borrado (`prisma/seed.ts`, `seed-flexible-pass-inventory.ts`, `inspect-osm-tour.ts` y `narrative-canary-v8.ts`).
- **`OverpassCoordinator.integration`** no se ejecuta: escribe en `backend/tmp` y `check-all.sh` ya lo omite.

## Pendiente de ti

1. ~~Autorizar los bloques de borrado 7.1~~ Hecho el 3 de octubre. Falta decidir qué hacer con lo que se conservó a propósito: `prisma/seed.ts` (¿se usa en desarrollo?), `scripts/audit/multi-route-overlap.ts` y `EditorialEvaluationInputV3.ts`.
2. Decidir 7.2 (A o B) y, con ella, el borrado de las rutas y tablas del camino antiguo, que además necesita comprobar en producción que están vacías.
3. 7.3 y 7.4 (mover el pipeline fuera de `scripts/validation/` y unificar los dos juegos de lotes): conviene hacerlos cuando [04](../04-regeneracion-y-publicacion.md) haya terminado.
4. Autorizar subir `.github/workflows/ci.yml`.
5. Las 60 entradas de `backend/tmp` (874 MB) que nada referencia: archivarlas fuera del repo, si quieres.
