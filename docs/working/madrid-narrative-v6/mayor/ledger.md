# Ledger factual: guion de la Plaza Mayor

Fecha de auditoría: 2026-08-11

Estado: **todas las afirmaciones verificables enlazadas; cero warnings abiertos; gate humano aprobado**

Este ledger audita [`script.md`](script.md) contra [`dossier.md`](dossier.md). Las metáforas se registran
cuando condensan una relación histórica y las orientaciones se auditan por su utilidad física.

## Claim ↔ fuente

| Claim | Afirmación usada en el guion | Proposición | Fuente | Certeza | Estado |
|---|---|---|---|---|---|
| C01 | El rectángulo cerrado actual no corresponde a la forma inicial del lugar. | P01, P03, P09 | S01, S02, S04 | alta | verificado |
| C02 | La plaza del Arrabal era un mercado extramuros donde confluían los caminos de Toledo y Atocha. | P01 | S01, S02 | alta | verificado |
| C03 | Felipe II encargó a Herrera adaptar el espacio a la capital y Gómez de Mora dio forma al recinto desde 1617. | P02 | S01, S04 | alta | verificado |
| C04 | La plaza del XVII tenía bocacalles abiertas entre bloques de viviendas. | P03 | S01, S02 | alta | verificado |
| C05 | Durante siglos convivieron el mercado y los usos ceremoniales de la Corte. | P04 | S02, S04, S05 | alta para los usos; síntesis temporal prudente | verificado |
| C06 | La plaza acogió fiestas, canonizaciones, corridas, procesiones y autos de fe. | P04 | S02, S04, S05 | alta | verificado |
| C07 | Para los grandes actos se cerraban las bocacalles con tablados. | P05 | S02, S05 | alta | verificado |
| C08 | La Casa de la Panadería se reconoce por la fachada pintada y sus dos torres; Carlos Franco realizó las pinturas actuales en 1992 con figuras mitológicas y personajes inventados. | P05 | S07 | alta para el estado capturado | verificado |
| C09 | Los reyes tenían reservado su balcón principal y los demás espectadores se distribuían por rango. | P05 | S02, S05 | alta | verificado |
| C10 | En 1790, un incendio permaneció activo nueve días y destruyó un tercio del perímetro. | P06 | S01, S03, S04 | alta | verificado |
| C11 | La madera, el yeso y otros materiales inflamables favorecieron el avance de las llamas. | P08 | S02 | alta; causalidad explícita | verificado |
| C12 | Más de mil hombres participaron en la extinción y Carlos IV dispuso ayuda para los afectados. | P07 | S03 | alta | verificado |
| C13 | La uniformidad visible puede leerse como una cicatriz arquitectónica del incendio. | P09, hipótesis narrativa | S01, S02, S04 | inferencia explícita | permitido |
| C14 | Villanueva inició la reconstrucción, rebajó dos alturas, cerró esquinas y proyectó nueve arcos. | P09 | S01, S02, S04 | alta | verificado |
| C15 | La Casa de la Panadería sobrevivió y sirvió como referencia para unificar la reconstrucción. | P09 | S01, S02 | alta | verificado |
| C16 | La altura continua actual no es la conservación intacta del diseño de 1617. | P03, P09 | S01, S02, S04 | alta | verificado |
| C17 | La escalinata del Arco de Cuchilleros salva el desnivel hacia la calle. | P10 | S04 | alta | verificado |
| C18 | Puerta del Sol reúne calles alrededor de un lado semicircular y evolucionó de lugar extramuros a centro. | P11 | S06 | alta | verificado |

## Resolución de nombres y números

| Token | Tipo | Resolución |
|---|---|---|
| Plaza Mayor, plaza del Arrabal, Casa de la Panadería, Arco y calle de Cuchilleros | lugares y edificios | autorizados por P01–P10 |
| caminos de Toledo y Atocha, Puerta del Sol | origen y transición | autorizados por P01, P11 |
| Corte | institución histórica usada para los actos jerarquizados | autorizada por P04, P05 |
| Felipe II, Carlos IV | monarcas vinculados a la remodelación y la ayuda | autorizados por P02, P07 |
| Juan de Herrera, Juan Gómez de Mora, Juan de Villanueva | arquitectos documentados | autorizados por P02, P09 |
| Carlos Franco | autor de las pinturas murales actuales | autorizado por P05 |
| 1617, 1790 | fechas | autorizadas por P02, P06 |
| nueve días, un tercio, más de mil hombres, dos alturas, nueve arcos | cantidades | autorizadas por P06, P07, P09 |

Warnings abiertos: **0**.

## Inferencias y límites editoriales

- «Este rectángulo cerrado no nació así» contrasta la forma actual con P01/P03; no niega que hubiera una
  plaza del Arrabal antes de la regularización.
- «Doble pulso» une usos comerciales y ceremoniales documentados a lo largo del tiempo; ya no se afirma
  que ambos estuvieran presentes siempre o simultáneamente.
- «Cada lugar marcaba un rango» parafrasea el protocolo jerárquico; no atribuye estados mentales al público.
- «Cicatriz» es la metáfora central autorizada: la unidad visible deriva de la reconstrucción posterior al incendio.
- La Casa de la Panadería sobrevivió al incendio de 1790, pero el guion no la llama intacta ni original en todas sus partes.
- Las pinturas visibles se identifican como una intervención de 1992; no se confunden con la fachada del XVII.
- «Madrid no lo es» se limita al desnivel visible hacia Cuchilleros; no formula una descripción topográfica
  completa de la ciudad.
- El puente a Sol compara dos experiencias espaciales. No afirma que Sol nunca tuviera cierre o límite histórico.
- No se transforman «afectados» en víctimas, no se inventan muertes y no se dramatiza un rescate individual.

## Ajuste posterior al gate

El responsable editorial aprobó el guion y señaló que echaba en falta las pinturas visibles de la Casa
de la Panadería. Se añadió una sola frase, respaldada por S07, que identifica a Carlos Franco, 1992 y la
combinación de mitología con personajes inventados. Para compensar su duración se comprimieron la
apertura y el puente, sin retirar hechos.

DeepSeek y Gemma reauditaron después las 25 frases exactamente una vez. Ninguno detectó hechos nuevos,
distorsiones ni objeciones que exigieran cambios. La adición visual queda incorporada al texto aprobado.

## Redacción y reparación localizada

DeepSeek `deepseek-v4-flash`, con temperatura 0,7 y pensamiento desactivado, produjo el primer borrador.
La credencial se cargó desde `backend/.env` sin persistirse ni registrarse.

Se conservaron el arco, la metáfora de la cicatriz, la selección del incendio y la transición a Sol. Una
única ronda editorial modificó ventanas concretas para:

1. Eliminar el absoluto «siempre» del doble uso de la plaza.
2. Retirar «la plaza era de todos», una igualdad no demostrada para el mercado cotidiano.
3. Sustituir la psicología de «tu mirada delataba tu lugar» por el protocolo de rangos documentado.
4. Reducir la acumulación de fecha, hora y cifras del incendio sin perder escala humana.
5. Eliminar la intención inventada «no fue un capricho» y «pensado para contener y ordenar».
6. Reemplazar «a tu derecha» por la escalinata que permite reconocer el Arco de Cuchilleros.
7. Cambiar «Sol no se cerró» por una comparación visual entre perímetro y convergencia.

No se regeneró el texto completo.

## Lectura adversarial doble

### DeepSeek, temperatura 0

- Primer pase válido: auditó las 26 frases exactamente una vez.
- Se aceptaron sus objeciones sobre la psicología de la mirada, la causalidad del supuesto «capricho» y
  la intención de «contener y ordenar».
- Se rechazó neutralizar «cicatriz»: el dossier autoriza expresamente esa lectura y la metáfora constituye
  el payoff de la escena.
- Reauditoría válida: cubrió las 24 frases reparadas y no formuló objeciones.

### Gemma, temperatura 0, Ollama Windows

- Primer pase válido: auditó las 26 frases. Coincidió con DeepSeek sobre la psicología de la mirada; su
  objeción a «no nació perfecta» se rechazó porque la frase se refiere a la forma actual.
- Reauditoría válida: cubrió las 24 frases y volvió a objetar solo «este rectángulo cerrado no nació así».
  Se rechazó: P01, P03 y P09 documentan exactamente la transformación formal que resume la apertura.
- No aportó en esta parada una objeción aceptada que DeepSeek o la revisión editorial no hubieran detectado.

Resultado acumulado del auditor en sombra: Gemma aportó dos mejoras exclusivas en Villa y ninguna en
Plaza Mayor. La decisión sobre su incorporación futura sigue abierta hasta completar las cinco paradas nuevas.

## Comprobación final previa al gate

- Respaldo factual: completo.
- Nombres y números: todos resueltos.
- Lectura estimada: 2,9–3,1 minutos a 130–140 palabras por minuto.
- Dirección de mirada: Casa de la Panadería, altura continua y escalinata de Cuchilleros.
- Reparación: localizada; sin regeneración global.
- Estado editorial: aprobado por el responsable editorial el 11 de agosto de 2026.
