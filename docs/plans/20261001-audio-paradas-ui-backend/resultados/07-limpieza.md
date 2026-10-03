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
| **7.1, 7.2, 7.3, 7.4, 7.8** | **Sin hacer.** Borran o mueven código de producción; necesitan tu autorización o van después de [04](../04-regeneracion-y-publicacion.md) |
| Etiqueta `archive/pre-cleanup-20261001` | **Sin crear**: solo hace falta cuando se autorice un borrado |

## Las tres suites del núcleo

Se revisó en cada caso si estaba mal la prueba o el código. En las tres el código es más reciente y deliberado; las pruebas conservaban expectativas antiguas.

| Suite | Qué había cambiado | Qué se hizo |
|---|---|---|
| `NarrativeEditorialAgentsV6` | El perfil escritor usa `deepseek-flash` (tarifa propia desde el 10 de septiembre); la prueba esperaba `deepseek-v4-flash` | La prueba espera el id actual |
| `EditorialStructuredLlmV6` | El perfil `qwen38_hybrid` pasó su auditor B de `gpt-5.4-mini` a `gpt-5.4`; el perfil canario de Gemini conserva el barato | Dos pruebas: la primera espera el auditor completo y la segunda fija el auditor del canario y compara el resto con el híbrido |
| `LandmarkTiering` | La puntuación de historia penaliza ahora los museos que no son escenario de un hecho | La prueba espera el nuevo orden y comprueba lo que de verdad prueba: que con etiquetas mezcladas no se aplica el tope de «fama transferible» (la categoría sigue siendo `major`) |

`scripts/check-all.known-failures.txt` ya no las lista. Quedan cuatro suites de Jest (`CodexTourGenerator`, `AutonomousNarrativePilotV1`, `NarrativePilotDeepSeekV1`,
`NarrativeCalibrationV6`), que desaparecen con 7.1 y 7.2, y una prueba de voz.

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

1. Autorizar los bloques de borrado 7.1 (con la lista de `anexos/reachability-*.txt` regenerada) y crear antes la etiqueta de archivo.
2. Decidir 7.2 (A o B) y, con ella, el borrado de las rutas y tablas del camino antiguo, que además necesita comprobar en producción que están vacías.
3. 7.3 y 7.4 (mover el pipeline fuera de `scripts/validation/` y unificar los dos juegos de lotes): conviene hacerlos cuando [04](../04-regeneracion-y-publicacion.md) haya terminado.
4. Autorizar subir `.github/workflows/ci.yml`.
5. Las 60 entradas de `backend/tmp` (874 MB) que nada referencia: archivarlas fuera del repo, si quieres.
