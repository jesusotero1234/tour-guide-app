# Ledger factual: guion del Palacio Real

Fecha de auditoría: 2026-08-11

Estado: **todas las afirmaciones verificables enlazadas; cero warnings abiertos**

Este ledger audita el texto de [`script.md`](script.md) contra las proposiciones y fuentes de
[`dossier.md`](dossier.md). Las frases de orientación y enlace editorial se incluyen cuando podrían
interpretarse como afirmaciones históricas; las instrucciones puramente físicas no necesitan fuente.

## Claim ↔ fuente

| Claim | Afirmación usada en el guion | Proposición | Fuente | Certeza | Estado |
|---|---|---|---|---|---|
| C01 | El Palacio Real ocupa el mismo solar que el Alcázar de Madrid. | P01 | S02, S03 | alta | verificado |
| C02 | El Alcázar pasó de fortaleza medieval a residencia real cuando Felipe II instaló la Corte en Madrid en 1561. | P01 | S02, S03 | alta | verificado |
| C03 | Un incendio destruyó el Alcázar en la Nochebuena de 1734. | P02 | S02, S04 | alta | verificado |
| C04 | Se perdieron numerosas obras de las Colecciones Reales y otras pudieron salvarse. | P02 | S04, S07 | alta | verificado |
| C05 | Felipe V llamó a Juvarra en 1735; el arquitecto murió en 1736 antes de iniciarse las obras. | P03 | S02, S03, S05 | alta | verificado |
| C06 | Juvarra consideró insuficiente el solar para su proyecto horizontal y trabajó para un emplazamiento más amplio. | P04 | S03, S05 | alta | verificado |
| C07 | La Corona consideró demasiado costoso el proyecto y encargó a Sacchetti ajustarlo al solar antiguo. | P04 | S03 | alta | verificado |
| C08 | Sacchetti produjo un proyecto nuevo alrededor de un patio central y convirtió horizontalidad en verticalidad para alojar el programa de la Corte. | P05 | S01, S03 | alta | verificado |
| C09 | Desde Bailén se distinguen seis alturas y el edificio alcanza ocho donde desciende el terreno. | P06 | S01, S03 | alta | verificado |
| C10 | La estructura se construyó con bóvedas y sin madera estructural, salvo puertas y ventanas, para evitar nuevos incendios. | P07 | S02, S03 | alta | verificado |
| C11 | El palacio no está habitado; funciona como museo y acoge actos de la Corona y del Gobierno. | P08 | S01, S02 | alta, sensible al tiempo | verificado a 2026-08-11 |
| C12 | La Almudena atravesó interrupciones y cambios de proyecto, fue consagrada en 1993 y recibió una fachada clásica para armonizar con el Palacio Real. | P10 | S06 y evidencia V4 | alta | verificado |
| C13 | Contrastar sustitución tras un incendio con construcción prolongada es una síntesis editorial de las cronologías documentadas. | P02, P03, P10 | S02–S07 | inferencia explícita | permitido |

## Resolución de nombres y números

| Token | Tipo | Resolución |
|---|---|---|
| Palacio Real, Alcázar de Madrid, calle de Bailén, Catedral de la Almudena | nombre propio | autorizados por P01, P06 y P10 |
| Felipe II, Felipe V, Filippo Juvarra, Giambattista Sacchetti | persona | autorizados por P01, P03 y P04 |
| Corona, Gobierno, Corte, Colecciones Reales | institución o denominación histórica | uso común respaldado por S01–S04 |
| 1561, 1734, 1735, 1736, 1993 | fecha | verificadas en P01–P04 y P10 |
| seis, ocho | cantidad | verificadas en P06 con su contexto topográfico |

Warnings abiertos: **0**.

## Inferencias y límites editoriales

- «Tenía que hacer caber toda esa ambición» resume el cambio de programa documentado por S03; no se
  atribuye como pensamiento o cita a Sacchetti.
- «El edificio creció hacia arriba porque el lugar y el programa no cedían» parafrasea la relación causal
  explícita de S03 entre solar, funciones y verticalidad.
- «La memoria de 1734 [...] quedó dentro de la manera de construir» es una metáfora respaldada por la
  decisión documentada de evitar nuevos incendios; no añade un hecho independiente.
- No se afirma la causa del incendio, su duración, número de víctimas ni ninguna escena concreta de rescate.

## Lectura adversarial local

Gemma `gemma4:12b`, a temperatura 0 y semilla 42, formuló tres objeciones sin poder de aprobación:

1. **Aceptada:** «Juvarra encontró un problema» podía sonar a acceso a su proceso mental. Se sustituyó
   por la relación documental entre solar, programa y proyecto.
2. **Rechazada:** propuso eliminar la metáfora «la memoria de 1734 [...] quedó dentro de la manera de
   construir». Se conserva porque funciona como payoff oral y P07 demuestra literalmente que la
   estructura se diseñó para evitar nuevos incendios.
3. **Aceptada como mejora:** el puente hacia la Almudena incorpora ahora la relación visual entre su
   fachada clásica y el Palacio Real, respaldada por `almudena-observable`.

La revisión modificó únicamente los dos pasajes afectados y volvió a auditar el guion completo.
