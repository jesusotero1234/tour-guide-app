# 04 · Regeneración y publicación: informe

Hecho el 1 de octubre de 2026 en la rama `plan/20261001-fase0`, sin confirmar en git ni desplegar. **No se ha tocado producción, no se ha gastado nada en DeepSeek y no se ha usado la GPU.**

## Resultado

| Entregable | Estado |
|---|---|
| Herramienta `catalog-regeneration` con las doce fases, `status` y `rollback` | Hecha y ensayada de punta a punta en local |
| Importador de actualización con una transacción por tour, verificación tras `COMMIT` y compensación | Hecho y probado en memoria y contra Postgres real |
| Reversión desde el bloque `previous` | Hecha; **el ensayo encontró y corrigió un fallo** (ver abajo) |
| Cálculo de la huella con el código del backend, sin reimplementarlo | Hecho (`fingerprint.ts`) |
| `verify`: reversión, reaplicación, API, tramos, enlaces, referencias al orden, latencia e interruptor de emergencia | Hecho |
| Revisión humana (`review-pack`) con diferencias por palabras y reproductores | Hecha; **la aprobación es tuya** |
| Scripts del servidor: `remote-snapshot.cjs`, `remote-update.cjs`, `update-transfer.sh`, `update-install.sh` | Hechos. Los dos primeros se ejecutaron contra una copia real de Postgres. Los scripts de shell solo con `bash -n` |
| Release de backend con migración (`release-regeneration-backend.sh`) | Escrita y comprobada con `bash -n`. **No se ha ejecutado contra el servidor** |
| Snapshot de producción y comprobación cruzada con la API | **Pendiente** (necesita SSH) |
| Muestra de Valencia aprobada, render, publicación | **Pendiente** (necesitan tu autorización) |

## Ensayo de punta a punta

`backend/scripts/admin/rehearse-regeneration.cjs` crea `tour_guide_local_rehearsal` desde la base local (con `pg_dump`), enlaza el audio con hard links y recorre todas las fases con un modelo y un renderizador simulados. Con los 11 tours temáticos que la base local tiene admitidos:

| Fase | Resultado |
|---|---|
| `snapshot` | 11 tours, 58 paradas, con la voz y la huella de cada uno |
| `neutralize` | Estimación: 16 solicitudes, 0,02 USD. Con el modelo simulado: 11 de 11 aceptados por la guarda real |
| `speech` | 10 de 11 listos. El otro conserva 6 dígitos sueltos para la reparación guiada (estimación 0,0005 USD) |
| `legs` | 11 rutas base y 11 tours |
| `images` | 37 fotos: 34 con el mismo párrafo y 3 por similitud ≥ 0,6; ninguna sin párrafo |
| `render` | 5 trabajos y 179 piezas verificadas una a una |
| `stage-local` | 10 tours aplicados con el importador definitivo; línea base de la API igual al snapshot |
| `package` | 10 tours y 179 archivos con su `audio.sha256` |
| `verify` | Reversión a la huella del snapshot en 10 de 10; reaplicación en 10 de 10; 0 problemas HTTP; 0 referencias al orden; latencia dentro del 30 % |
| `remote-update.cjs` | `--dry-run` correcto; `--rollback` deja las huellas **idénticas** al snapshot; la actualización y su repetición se comportan |

Los tiempos del render y de la API no sirven de referencia: el renderizador era simulado y la base local tiene 11 tours.

## Lo que el ensayo encontró

**La reversión dejaba los tours fuera del catálogo.** El backend sirve, para cada parada, la fila de audio más reciente cuyo hash coincide con el texto. Si el texto hablado de una parada no cambia (no tiene cifras ni referencias al orden), el audio viejo y el nuevo comparten hash. Al revertir, los textos volvían a los anteriores pero el archivo nuevo seguía siendo el más reciente. Su versión no coincidía con la de la huella restaurada y `admittedToPilot` fallaba: **10 de 10 tours desaparecían**.

Corrección: la reversión borra, por id, las filas que creó el paquete (`audio_assets`, `tour_introduction_audio`, `tour_cue_audio` y `tour_walking_legs`). Los archivos se quedan en disco y nada anterior se toca. Hay una prueba que lo cubre y el ensayo lo comprueba con Postgres real. **Decisión que te toca confirmar:** el plan original decía que la reversión no borraba nada; borra únicamente lo que ella misma insertó.

Otros hallazgos menores, ya corregidos:

- Los recibos solo comprobaban sus propios archivos: un cambio aguas arriba no invalidaba lo posterior. Ahora la caducidad es en cadena.
- El normalizador no informaba de si el texto es un punto fijo del saneado, que el renderizador exige. Ahora lo informa y la fase `speech` lo trata como residuo.
- La diferencia por palabras pegaba palabras contiguas.

## Controles que la herramienta aplica por sí misma

- Sin `--execute` o `--repair` solo hay estimaciones. `neutralize`, `speech --repair` y `render` son los únicos pasos que gastan.
- Fuera de la muestra, la neutralización y la reparación exigen tu aprobación `sample-valencia`. El render exige además `cue-templates` y `full-catalog` para el resto.
- `render --max-hours N` se detiene entre trabajos al agotar el bloque que autorices.
- `package` se niega sin una entrada `publish` con `authorizationReference`, que copia literalmente. `publish` solo imprime el comando salvo con `--confirm-production`.
- `stage-local`, `verify` y `rollback` solo escriben en bases cuyo nombre acaba en `_rehearsal`, `_stage` o `_regen`.
- La herramienta nunca escribe `approvals.json`.
- Un tour con una pieza que no se puede resolver se marca `excluded` y conserva su contenido actual.

## Costes estimados sin red

| Concepto | Valor |
|---|---|
| Neutralización de todo el catálogo | 1.598 solicitudes, 1,83 USD como máximo |
| Reparación de residuos de todo el catálogo | 0,09 USD |
| GPU | ~18–24 h según el plan; se confirmará con la prueba de tiempos de la muestra |

## Verificación

`scripts/check-all.sh` en verde. Pruebas nuevas: 46 en `backend/src/services/regeneration/` (identificadores, fotos, tramos, importador, reversión con la colisión de hashes, plan de render, filas y hashes iguales a los de `TourAudioService`, manifiesto, comprobación cruzada, ensamblado, recibos, página de revisión y argumentos).

## Pendiente de ti

1. Autorizar y ejecutar la release de backend con la migración (primero `DRY_RUN=1`; necesita leer `_prisma_migrations` y que el servidor tenga la CLI de Prisma).
2. Autorizar el snapshot de producción (SSH, solo lectura) y la copia del audio vigente.
3. Validar las plantillas de enlace y escuchar muestras cortas.
4. Autorizar el gasto de la muestra de Valencia, la reparación de residuos y cada bloque de GPU.
5. Escribir tus aprobaciones en `approvals.json` y autorizar la publicación.

## Ejecución real: muestra de Valencia (2 de octubre)

Con tu autorización se tomó el snapshot de producción (solo lectura), se copió el audio vigente y se ejecutó la muestra de Valencia: 6 tours (los 5 idiomas del paseo histórico y el temático en español), 59 paradas y 6 introducciones.

| Paso | Resultado |
|---|---|
| Snapshot de producción | 216 tours, 1.653 paradas, **todos admitidos por el backend nuevo** con las huellas de producción, y comprobados uno a uno con la API pública |
| Copia local | pg_dump de 18 MB y 1.869 MP3 (2,7 GB), idénticos en número a los de producción |
| Neutralización con DeepSeek | 6 de 6 tours; **0,02 USD** en total |
| Reparación de residuos | 2 frases (ordinales en alemán); 0,001 USD |
| Tramos a pie (OSRM público) | 2 rutas base, 46 pares, 48 s |
| Render en la GPU | 6 trabajos, 162 piezas, 2,5 h de audio en **23 minutos: 6,5 veces tiempo real**, igual que la estimación. Los 106 enlaces duran de 3,1 a 6,7 s (media 4,5 s) |
| `stage-local` sobre la copia de producción | 6 de 6 aplicados; la línea base coincide con el snapshot y las huellas nuevas las admite el backend |
| Whisper | Paradas: error de palabras del 2 al 9 %. Enlaces: 3 % en español y 9 a 10 % en inglés, francés y alemán; **22 % en italiano**, casi todo por nombres propios («Torres de Quart») |

**Extrapolación a las 216 tours:** unas 80 horas de audio y **13 a 15 horas de GPU**.

**Defectos de la herramienta que el uso real destapó, ya corregidos**

- El presupuesto editorial (0,50 USD) y el tope de 5 intentos del cliente eran **por carpeta**, pensados para una ejecución de laboratorio: se agotaban a la quinta llamada y las demás piezas salían como «sin respuesta válida». Ahora cada tour tiene su propio presupuesto y cada solicitud su propia carpeta de intentos.
- Una introducción que es un itinerario («Empezamos en A. Seguiremos por B. Terminaremos en C») necesita reescribir casi todas sus frases, y la guarda de las paradas (15 % de cambios) la rechazaba. Para las introducciones la guarda permite reescribir hasta el 75 % y comprueba, en su lugar, que siguen nombrándose todas las paradas; solo se puede borrar entera una frase que sea un simple anuncio. El texto de la petición pide reescribir cada frase del itinerario completa.
- Un tour excluido por la neutralización o por el texto hablado no se reintentaba; ahora cada fase reintenta sus propias exclusiones.
- La muestra se renderiza sin aprobaciones previas: es lo que tú escuchas para aprobarla. El resto del catálogo sí las exige.

**Servidor de producción**

Tiene **2,8 GB libres de 38 GB (93 % de uso)**. Lo ocupan 21 releases de 1,2 GB cada una. El paquete de audio nuevo pesa unos 3 GB y la release del backend 1,2 GB más; `update-install.sh` exige 9 GB libres. **Hay que borrar releases antiguas en producción antes de publicar**, y eso necesita tu autorización explícita.


## Ejecución real: catálogo completo (2 de octubre, en curso)

Tu decisión sobre los enlaces: **variante C** («Ahora, vamos hacia X.», «Heading to X.», «En route vers X.», «Weiter zu X.», «Andiamo verso X.») para `first` y `next`; el cierre no cambia. Quedó en `approvals.json` con tu frase literal. Por cada parada hay un clip «first» (si es la primera que eliges) y uno «next» (si vas a ella después de otra), más un cierre por tour: 3.492 clips en 214 tours.

| Paso | Resultado |
|---|---|
| Neutralización con DeepSeek | **214 de 216 tours**. Excluidos y con su contenido actual: Barcelona (es) y Venecia (fr), cuya introducción no pasó la guarda tras tres intentos |
| Texto hablado | **214 de 214 listos**. Los últimos 10 eran numerales romanos de reyes alemanes («Ludwig VII.»: el punto es del ordinal), `Friedrichstraße/Zimmerstraße`, `via IV Novembre` y `Sat.1`; se resolvieron con la extensión del tramo marcado y 3 entradas de léxico |
| Tramos a pie | 51 rutas base para 214 tours (las rutas de un mismo itinerario se comparten entre idiomas) |
| Fotos | 214 tours: 1.587 exactas, 42 similares, 2 las más cercanas |
| Render | 133 trabajos, **5.283 piezas, 97,9 h de audio, 17,3 h de GPU estimadas**; ritmo medido, unas 5 piezas por minuto. Arrancó a las 16:25 y termina hacia las 09:00 del 3 de octubre. Se puede reanudar: lo ya renderizado se reutiliza |

**Defectos de la herramienta corregidos en esta fase**

- La fase `speech` reutilizaba un fichero con piezas sin resolver aunque hubiera cambiado el léxico o la regla; ahora lo rehace, y al quedar listo levanta la exclusión.
- El cliente de DeepSeek reproduce una respuesta guardada cuando ve el mismo identificador de petición, aunque se haya marcado otro texto. Los identificadores llevan ahora un hash de lo que se pregunta.
- `legs` e `images` tomaban el mismo candado que el render y no podían correr a su lado durante 17 horas. El render usa `run.lock`, ellos `side.lock`, y el resto de comandos toman ambos.

**Whisper** no se ha vuelto a ejecutar: con el texto hablado en la mano no aporta nada que justifique la hora de GPU que ocupa. Queda fuera salvo que me digas lo contrario.
