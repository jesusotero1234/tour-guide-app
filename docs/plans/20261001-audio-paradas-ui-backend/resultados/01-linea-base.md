# 01 · Línea base de pruebas

Medida el 1 de octubre de 2026 sobre `master` (668b93a), rama `plan/20261001-fase0`, antes de tocar código.
Se obtiene con `scripts/check-all.sh`; los fallos conocidos están en `scripts/check-all.known-failures.txt`.

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` del backend (`src` y `tsconfig.generation-worker.json`) | Sin errores |
| Jest del backend | 218 suites: 209 pasan, 7 fallan siempre, 1 se omite. 2.198 pruebas: 2.176 pasan, 15 fallan, 6 pendientes |
| Pruebas de Python de `backend/scripts/admin` | 69 de 69 |
| `node --test` (3 de `scripts/validation` y 1 de `scripts/admin`) | 11 de 11, con `-r ts-node/register/transpile-only` |
| Pruebas del pod de voz (`test-tour-audio-input.py`) | 18 pruebas, **1 falla** |
| Pruebas del pod de voz (`test-sanitize.py`) | 3 de 3 |
| `tsc --noEmit` y `npm run lint` del frontend | Sin errores; 2 avisos de `react-hooks/exhaustive-deps` en `TourExperience.tsx` |

## Fallos conocidos (8)

Jest, 7 suites:

- Del núcleo de producción, por nombres de modelo y expectativas obsoletas (se arreglan en 07 §7.9.1): `NarrativeEditorialAgentsV6`, `EditorialStructuredLlmV6`, `LandmarkTiering`.
- Del camino antiguo de desarrollo (desaparece con 07 §7.2-A): `CodexTourGenerator`.
- De módulos muertos (se borran en 07 §7.1): `AutonomousNarrativePilotV1`, `NarrativePilotDeepSeekV1`, `NarrativeCalibrationV6`.

Pod de voz, 1 prueba: `test_documentary_profile_uses_reference_without_continuation`. La mitad «legacy» de la prueba espera que `guide-fr-a.json` use el modo de continuación, pero ese preset es hoy de clonación controlable. Es un fallo de la prueba, no del código, y no se toca el preset (02 §2.5).

## Correcciones al plan

1. **`node --test` necesita el cargador de TypeScript.** Sin `-r ts-node/register/transpile-only`, 3 de los 4 archivos fallan con «Cannot find module». El plan lo omitía.
2. **Una suite inestable:** `TourAudioService.test.ts` falló una vez en la pasada completa con `ENOTEMPTY` al borrar su carpeta temporal bajo carga paralela, y pasa 3 de 3 veces sola. No es un fallo conocido: `check-all.sh` reintenta sola cualquier suite que falle fuera de la lista y avisa si pasa.
3. **Antes de este trabajo no había nada sin confirmar:** el commit `b3c3b34` ya incluía la cadena de lote. La copia limpia de `master` compila y pasa todo lo anterior igual que el árbol de trabajo.
