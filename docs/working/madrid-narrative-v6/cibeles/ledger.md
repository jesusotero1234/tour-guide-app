# Ledger factual: guion de Cibeles

Fecha de auditoría: 2026-08-11

Estado: **aprobado por el gate humano; todas las afirmaciones verificables enlazadas; cero warnings factuales abiertos**

Este ledger audita [`script.md`](script.md) contra [`dossier.md`](dossier.md). La comprobación distingue la
posición original de la actual, el surtidor frontal que no llegó a construirse de los caños posteriores del
dragón y el oso, y la fecha de prohibición del uso público de la fecha del traslado.

## Claim ↔ fuente

| Claim | Afirmación usada en el guion | Proposición | Fuente | Certeza | Estado |
|---|---|---|---|---|---|
| C01 | La fuente ocupa hoy el centro de una rotonda rodeada de tráfico. | P09 | S01, observación actual | alta | verificado |
| C02 | Al principio las caballerías bebían de la fuente. | P05 | S01 | alta | verificado |
| C03 | Se instaló a comienzos de la década de 1780 fuera de la posición central actual, mientras el Salón del Prado transformaba una zona antes rural y suburbana. | P01, P04 | S01–S03 | alta | verificado |
| C04 | Su primer uso documentado fue el de abrevadero. | P05 | S01 | alta | verificado |
| C05 | El pilón original es de granito y hoy aparece elevado. | P03, P09, P10 | S01, S04 | alta | verificado |
| C06 | La diosa aparece sobre un carro tirado por dos leones. | P03 | S01, S04 | alta | verificado |
| C07 | Ventura Rodríguez diseñó Cibeles en 1777 para el programa del Salón del Prado durante el reinado de Carlos III. | P01, P02 | S01, S02 | alta | verificado |
| C08 | Las tres fuentes representaban cuatro elementos: Neptuno el Agua, Cibeles la Tierra y Apolo el Aire y el Fuego. | P02 | S01 | alta | verificado |
| C09 | En su primera posición estuvo frente a Buenavista, al comienzo de Recoletos, y miraba hacia Neptuno. | P04 | S01, S03 | alta | verificado |
| C10 | En 1791, Villanueva propuso un dragón y un oso con caños; terminados en 1794, uno servía al público y el otro a cincuenta aguadores. | P05 | S01 | alta | verificado |
| C11 | Las figuras se retiraron en 1862 al prohibirse el uso público y hoy están en el Museo de los Orígenes. | P06 | S01 | alta | verificado |
| C12 | La elevación de las rasantes dejó la fuente semienterrada. | P07 | S01 | alta | verificado |
| C13 | En 1891, López Sallaberry propuso llevarla al centro, elevarla y orientarla hacia Sol. | P07 | S01 | alta | verificado |
| C14 | La Academia de San Fernando se opuso y la polémica retrasó las obras. | P08 | S01, S03 | alta | verificado |
| C15 | El traslado terminó en 1895; la fuente quedó tres metros más alta y dejó de mirar hacia Neptuno. | P09 | S01, S04 | alta | verificado |
| C16 | Quien llega desde Sol se aproxima hoy a la cara de la diosa. | P09 | S01, S03 | inferencia espacial directa | permitido |
| C17 | El pilón superior es original y la taza inferior procede de la reforma de 1968. | P10 | S01 | alta | verificado |
| C18 | El paso de abrevadero y fuente pública a monumento resume cambios documentados de uso, posición y forma. | P05–P10 | S01–S04 | inferencia explícita | permitido |
| C19 | Puerta de Alcalá perteneció a las reformas de Carlos III y permaneció cuando la cerca desapareció y la ciudad se extendió alrededor. | P11 | S05, S06 | alta + síntesis directa | verificado |

## Resolución de nombres y números

| Token | Tipo | Resolución |
|---|---|---|
| Cibeles, Salón del Prado, Neptuno, Apolo | fuente, programa y figuras mitológicas | autorizados por P01–P04 |
| palacio de Buenavista, Recoletos, Puerta del Sol, Puerta de Alcalá, Museo de los Orígenes | lugares y orientaciones | autorizados por P04, P06, P09, P11 |
| Carlos III, Real Academia de Bellas Artes de San Fernando | monarca e institución | autorizados por P01, P08, P11 |
| Ventura Rodríguez, Juan de Villanueva, José López Sallaberry | arquitectos con una decisión narrativa concreta | autorizados por P02, P05, P07 |
| década de 1780; 1777, 1791, 1794, 1862, 1891, 1895, 1968 | fechas usadas | autorizadas por P02, P04–P10 |
| cincuenta aguadores, tres metros, tres fuentes, cuatro elementos | cifras usadas | autorizadas por P01, P02, P05, P09 |

Warnings factuales abiertos: **0**.

Condición operativa no factual: la intervención municipal prevista entre junio y octubre de 2026 puede
afectar temporalmente la visibilidad. Antes de una prueba en calle o grabación debe comprobarse si el pilón
y los dos niveles están despejados. No altera el texto histórico ni permite publicar una indicación visual
sin esa comprobación.

## Inferencias y límites editoriales

- «La mitología formaba parte del plano» resume el programa iconográfico y la disposición de las tres
  fuentes; no atribuye una motivación psicológica a sus autores.
- «La historia más humana» es una valoración editorial sostenida por la función pública y los cincuenta
  aguadores; no inventa individuos, reacciones o condiciones de trabajo.
- «La cara que aquella reforma mostró al nuevo centro» traduce la orientación hacia Sol documentada; no
  afirma que Sol sea el centro geográfico.
- La progresión abrevadero→fuente pública→monumento distingue el primer uso del pilón de los caños añadidos
  en 1794. No resucita el surtidor frontal previsto por Rodríguez que nunca se realizó.
- El contraste con Puerta de Alcalá se apoya en la desaparición documentada de la cerca y la plaza circular
  creada alrededor de la puerta; no supone que la puerta haya permanecido materialmente intacta.

## Redacción y reparación localizada

DeepSeek `deepseek-v4-flash`, con temperatura 0,7 y pensamiento desactivado, produjo el primer borrador en
10,1 segundos. La credencial procedió de `backend/.env` y no se registró.

La revisión no regeneró el texto completo. Conservó el arco abrevadero→ausencias→traslado→dos niveles→puerta
y corrigió ventanas locales para:

1. Separar la instalación de 1781–1782 de la posición central adquirida en 1895.
2. Eliminar una alusión a celebraciones excluida del dossier.
3. Atribuir el programa urbano sin convertir a Carlos III en sujeto directo de un encargo de Aranda.
4. Corregir «tres elementos» por tres fuentes que representan cuatro elementos.
5. Cambiar «Villanueva añadió en 1791» por la propuesta de 1791 y la terminación de 1794.
6. Distinguir el dragón de uso público del oso destinado a los barriles de los aguadores.
7. Sustituir el vago «todo desapareció» por el destino preciso de las dos figuras.
8. Vincular la subida de rasantes a la transformación documentada del entorno.
9. Retirar la metáfora engañosa «dar la espalda al paseo» y conservar solo el giro hacia Sol.
10. Precisar qué nivel del agua es original y cuál pertenece a 1968.
11. Comprimir el borrador de 463 a 421 palabras sin retirar ninguna pieza del arco.

## Lectura adversarial doble

### Primer pase

- DeepSeek, temperatura 0: cubrió las 57 unidades creadas por el segmentador sobre el Markdown original en
  23,4 segundos. Detectó la mezcla fecha/posición, el sujeto causal de Carlos III y la metáfora de orientación.
- Gemma `gemma4:12b`, temperatura 0 en Ollama Windows: tras fallar el esquema monolítico, cubrió las mismas
  57 unidades en cinco lotes válidos. Aportó de forma exclusiva la alusión no autorizada a «triunfos» y la
  ambigüedad de «todo eso desapareció».
- La revisión humana detectó además los cuatro elementos, la diferencia propuesta/ejecución de 1791–1794 y
  el exceso de duración.
- Se rechazó la objeción de Gemma a la mera frase «aquí viene lo curioso», porque una transición oral no
  necesita aparecer en la evidencia. También se rechazó su afirmación de que no existió una fase de fuente
  pública: confundía el surtidor inicial no construido con los caños posteriores documentados.

El primer segmentador trató varios saltos de línea de Markdown como límites de frase. Todo el contenido fue
leído, pero la reauditoría corrigió el método normalizando los espacios antes de generar IDs.

### Reauditoría

- DeepSeek reauditó 27/27 frases normalizadas en 17,7 segundos: 17 `supported`, 10
  `authorized_inference` y cero `unsupported`, `distorted` o `unclear`.
- Gemma reauditó 27/27 frases normalizadas en dos lotes válidos y 20,1 segundos: 23 `supported`, cuatro
  `authorized_inference` y cero `unsupported`, `distorted` o `unclear`.
- DeepSeek señaló como no bloqueantes la repetición funcional del pilón y la comprobación de visibilidad
  durante la restauración. La primera se conserva porque prepara y resuelve la revelación de 1968; la segunda
  queda como condición operativa explícita.

## Comprobación final previa al gate

- Respaldo factual: completo.
- Nombres y números: todos resueltos.
- Lectura estimada: 3–3,2 minutos a 130–140 palabras por minuto; duración orientativa, sin relleno.
- Dirección de mirada: acera, diosa, leones, pilón superior y taza inferior; nunca se ordena cruzar.
- Reparación: localizada; sin regeneración global.
- Estado editorial: aprobado por el responsable editorial el 11 de agosto de 2026.
