# Ledger factual: guion de la Plaza de la Villa

Fecha de auditoría: 2026-08-11

Estado: **todas las afirmaciones verificables enlazadas; cero warnings abiertos; gate humano aprobado**

Este ledger audita [`script.md`](script.md) contra [`dossier.md`](dossier.md). Las instrucciones físicas y
las transiciones orales solo se enlazan cuando pueden confundirse con una afirmación histórica.

## Claim ↔ fuente

| Claim | Afirmación usada en el guion | Proposición | Fuente | Certeza | Estado |
|---|---|---|---|---|---|
| C01 | La Plaza de la Villa contrasta por su escala con Palacio y Almudena dentro de esta ruta. | secuencia autorizada; columna vertebral V6 | dossier; doc 61 | comparación editorial de lugares consecutivos | permitido |
| C02 | Las calles del Codo, del Cordón y de Madrid pertenecen al trazado primitivo y la plaza fue un núcleo principal del Madrid medieval. | P01 | S01, S06 | alta | verificado |
| C03 | En pocos metros conviven edificios civiles de los siglos XV, XVI y XVII. | P02 | S01–S04 | alta | verificado |
| C04 | Álvaro de Luján mandó construir la Casa y Torre de los Lujanes antes de 1471; es una de las pocas casas-palacio del XV conservadas en Madrid. | P03 | S02 | alta | verificado |
| C05 | La torre mezcla piedra y ladrillo y conserva hacia la calle del Codo un arco de herradura descrito como único en la capital. | P04 | S02 | alta para el estado visible capturado | verificado |
| C06 | Leer los Lujanes como huella de la ciudad nobiliaria sintetiza su origen como casa señorial del XV. | P03, P04 | S02 | inferencia explícita | permitido |
| C07 | Durante más de tres siglos, los regidores se reunieron sobre el pórtico de la desaparecida iglesia de San Salvador. | P05 | S05, S06 | alta | verificado |
| C08 | En 1629, Felipe IV autorizó la sede del Concejo y se aprobó el proyecto de Juan Gómez de Mora. | P06 | S03, S06 | alta | verificado |
| C09 | Las obras de la Casa de la Villa comenzaron en 1644 y se prolongaron hasta 1696, más de medio siglo. | P06 | S03, S06 | alta; cálculo directo de 52 años | verificado |
| C10 | La Casa de la Villa tiene zócalo de granito, muros de ladrillo y torres con chapiteles de pizarra. | P08 | S03 | alta | verificado |
| C11 | El edificio fue concebido para servicios municipales y cárcel de la Villa. | P07 | S03, S06 | alta | verificado |
| C12 | «Gobernar y encarcelar bajo el mismo techo» es una síntesis oral de las dos funciones documentadas. | P07 | S03, S06 | inferencia directa | permitido |
| C13 | Un pasadizo elevado cruza la calle de Madrid y comunica la Casa de la Villa con la Casa de Cisneros, palacio del XVI. | P02, P09 | S01, S03, S04, S06 | alta | verificado |
| C14 | El Ayuntamiento compró la Casa de Cisneros en 1909 para instalar departamentos y Luis Bellido realizó la restauración y la conexión. | P09 | S03, S04 | alta | verificado |
| C15 | La ampliación de dependencias unió físicamente edificios de dos siglos distintos. | P09 | S03, S04 | hecho más síntesis editorial | permitido |
| C16 | El gobierno municipal es anterior a la casa del XVII construida para alojarlo. | P05, P06 | S03, S05, S06 | alta | verificado |
| C17 | La Plaza Mayor nació como mercado extramuros y después se transformó en un gran recinto público. | P10 | S07 | alta para origen y transformación; «escenario» es síntesis editorial | permitido |

## Resolución de nombres y números

| Token | Tipo | Resolución |
|---|---|---|
| Plaza de la Villa, Almudena, Palacio Real, calle Mayor, Plaza Mayor | lugares de la ruta | autorizados por la columna vertebral y P01, P10 |
| calles del Codo, del Cordón y de Madrid | vías visibles | autorizadas por P01, P04, P09 |
| Torre de los Lujanes, iglesia de San Salvador, Casa de la Villa, Casa de Cisneros | edificios | autorizados por P02–P09 |
| Concejo, Ayuntamiento, cárcel de la Villa | institución y función | autorizados por P05–P09 |
| Álvaro de Luján, Felipe IV, Juan Gómez de Mora, Luis Bellido | personas documentadas | autorizadas por P03, P06, P09 |
| siglos XV, XVI y XVII; 1471, 1629, 1644, 1696, 1909 | periodos y fechas | autorizados por P02–P09 |
| tres calles, tres siglos, más de tres siglos, más de medio siglo | cantidades o síntesis directas | P01, P02, P05, P06 |

Warnings abiertos: **0**.

## Inferencias y límites editoriales

- «Esto parece otra ciudad» es una impresión de escala dentro de la ruta y no afirma una discontinuidad histórica.
- «Tres siglos [...] en unos pocos metros» describe la convivencia visible de tres edificios, no una
  cronología completa de Madrid.
- «Ciudad nobiliaria» se limita al origen señorial de la Casa de los Lujanes; no caracteriza a toda la población.
- La repetición oral «sobre el pórtico de una iglesia» subraya la localización documentada y no añade un hecho.
- «Gobernar y encarcelar bajo el mismo techo» no asigna una función a cada puerta ni describe el funcionamiento de la cárcel.
- «Unió físicamente dos siglos» relaciona las fechas de los edificios mediante un pasadizo real; no afirma
  que la intervención conservara intactas todas sus formas originales.
- «Gran escenario público» anticipa la transformación documentada de la plaza del Arrabal; los usos
  ceremoniales concretos se explicarán y documentarán en el dossier de Plaza Mayor.
- No se utiliza el supuesto cautiverio de Francisco I, el récord discutible de antigüedad ni pensamientos
  atribuidos al Concejo o a los arquitectos.

## Redacción y reparación localizada

DeepSeek `deepseek-v4-flash`, con temperatura 0,7 y pensamiento desactivado, produjo el primer borrador
completo. La credencial se cargó desde `backend/.env` y no se persistió ni apareció en los diagnósticos.

La revisión conservó el arco, los hechos seleccionados y la mayor parte de la voz del modelo, pero abrió
ventanas locales para:

1. Sustituir izquierda/derecha por anclajes visibles que funcionan con cualquier orientación.
2. Evitar afirmar de forma absoluta que el Concejo no tuvo ninguna casa propia durante tres siglos.
3. Corregir «casi medio siglo»: 1644–1696 son 52 años, por tanto **más** de medio siglo.
4. Eliminar las muletillas «Ahora, la revelación», «Ese era el alcance» y «Vamos».
5. Quitar la teleología de «Madrid aprendió a gobernarse» y la causalidad de «gobierno asentado».
6. Hacer visible el pasadizo sobre la calle de Madrid y cambiar «desbordó su sede» por la acción respaldada
   «amplió sus dependencias».

No se regeneró el guion completo.

## Lectura adversarial doble

Ambos lectores recibieron las frases con IDs estables y tuvieron prohibido puntuar o aprobar.

### DeepSeek, temperatura 0

- Primer pase válido: auditó las 28 frases exactamente una vez.
- Se aceptaron sus objeciones sobre «tomaba decisiones», la frase redundante «Ese era el alcance», la
  teleología de «aprendió» y el vínculo causal «ya con su gobierno asentado».
- Se rechazaron las objeciones que ignoraban la continuidad garantizada con Palacio/Almudena o trataban
  el orden no cronológico de los tres edificios como error factual.
- Reauditoría válida: cubrió las 22 frases del texto reparado. Las tres inferencias señaladas estaban
  autorizadas; se aceptó únicamente suavizar «desbordó su sede».

### Gemma, temperatura 0, Ollama Windows

- Primer pase válido: auditó las 28 frases exactamente una vez y aportó dos objeciones editoriales únicas.
- Se aceptaron la eliminación de «Ahora, la revelación» y «Vamos» como marcadores innecesarios. Su
  clasificación como hechos «unsupported» era incorrecta, pero la observación editorial sí era útil.
- Reauditoría válida: cubrió las 22 frases. Su única objeción fue eliminar Palacio y Almudena de la
  apertura; se rechazó porque ambas son paradas anteriores aprobadas y el contraste de escala forma parte
  de la secuencia autorizada.

Gemma aporta en esta parada dos mejoras exclusivas y una objeción rechazada. Se mantiene como auditor en
sombra; este resultado no basta todavía para incorporarlo al futuro agente.

## Comprobación final previa al gate

- Respaldo factual: completo.
- Nombres y números: todos resueltos.
- Lectura estimada: 2,8–3 minutos a 130–140 palabras por minuto.
- Dirección de mirada: Torre de los Lujanes, Casa de la Villa y pasadizo sobre la calle de Madrid.
- Reparación: localizada; sin regeneración global.
- Estado editorial: aprobado por el responsable editorial el 11 de agosto de 2026.
