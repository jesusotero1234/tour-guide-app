# Ledger factual: guion de la Catedral de la Almudena

Fecha de auditoría: 2026-08-11

Estado: **todas las afirmaciones verificables enlazadas; cero warnings abiertos**

Este ledger audita [`script.md`](script.md) contra [`dossier.md`](dossier.md). Las metáforas y
transiciones se registran cuando podrían confundirse con una afirmación histórica.

## Claim ↔ fuente

| Claim | Afirmación usada en el guion | Proposición | Fuente | Certeza | Estado |
|---|---|---|---|---|---|
| C01 | Las fachadas de la Almudena y el Palacio parecen formar un conjunto, pero no fueron proyectadas a la vez. | P06, P07, P10 | S01–S05 | hechos altos; comparación editorial | verificado |
| C02 | Tras la muerte de María de las Mercedes, Alfonso XII impulsó una iglesia dedicada a la Almudena y destinada también a enterrar a la reina. | P01 | S02, S04, S05 | alta | verificado |
| C03 | Alfonso XII colocó la primera piedra en 1883; cuando Madrid pasó a tener diócesis propia en 1885, la parroquia pasó a ser futura catedral. | P02 | S02, S04, S05 | alta | verificado |
| C04 | Cubas proyectó una gran catedral neogótica inspirada en el gótico francés del siglo XIII. | P03 | S02, S04 | alta | verificado |
| C05 | Cubas murió en 1899; otros arquitectos heredaron la obra; la cripta se inauguró en 1911 mientras el templo superior seguía incompleto. | P04 | S02, S04 | alta | verificado |
| C06 | Los donativos eran insuficientes, las obras avanzaron lentamente y la Guerra Civil las interrumpió. | P05 | S01, S02, S04 | alta | verificado |
| C07 | El concurso nacional de 1944 buscó otra solución y fue ganado por Fernando Chueca Goitia y Carlos Sidro. | P06 | S02–S05 | alta | verificado |
| C08 | Cuando se replanteó el proyecto ya existían la cripta y parte de la estructura; se conservó la base y se cambiaron alzados, cúpula y fachada. | P06 | S02–S05 | alta | verificado |
| C09 | El proyecto exterior neogótico dejó de considerarse adecuado frente al Palacio; la solución final contuvo la altura y dio a la fachada un aire barroco clasicista. | P07 | S01, S03–S05 | alta para la intención declarada | verificado |
| C10 | El exterior es clásico y el interior conserva una raíz gótica simplificada. | P08 | S03, S04 | alta | verificado |
| C11 | La catedral fue consagrada el 15 de junio de 1993, ciento diez años después de la primera piedra. | P09 | S01, S02, S04 | alta; cálculo directo | verificado |
| C12 | Leer el edificio como unión de dos etapas y de una imagen cambiante de Madrid es una síntesis editorial de sus proyectos sucesivos. | P10 | S02–S05 | inferencia explícita | permitido |
| C13 | La Plaza de la Villa conserva trazado medieval y tres siglos de arquitectura civil. | P11 | S06 | alta | verificado |
| C14 | Contrastar la escala monumental de Palacio/Almudena con la escala medieval y civil de la plaza siguiente es una transición editorial. | P11 | S06 | inferencia explícita | permitido |

## Resolución de nombres y números

| Token | Tipo | Resolución |
|---|---|---|
| Catedral de la Almudena, Palacio Real, Plaza de la Villa, calle Mayor, Madrid | edificio, lugares y vía | autorizados por P01–P11 |
| Virgen de la Almudena, María de las Mercedes | advocación e identidad real | autorizadas por P01 |
| Alfonso XII | monarca ligado al inicio del proyecto | autorizado por P01, P02 |
| Francisco de Cubas, Fernando Chueca Goitia, Carlos Sidro | arquitectos de los proyectos narrados | autorizados por P03, P06 |
| Guerra Civil | acontecimiento histórico usado solo como interrupción documentada | autorizado por P05 |
| siglo XIII | referencia estilística del proyecto de Cubas | autorizado por P03 |
| 1883, 1899, 1911, 1944, 15 de junio de 1993 | hitos de la cronología | autorizados por P02–P09 |
| dos años, ciento diez años, tres siglos | cálculos o síntesis cronológicas directas | P02, P09, P11 |

Warnings abiertos: **0**.

## Inferencias y límites editoriales

- «Parecen pensadas a la vez» es una impresión visual que el guion niega inmediatamente; no afirma una
  autoría o cronología común.
- «La historia empezó con una ausencia» introduce la muerte documentada de María de las Mercedes sin
  atribuir emociones concretas a Alfonso XII.
- «El encargo ya había crecido» resume el paso documentado de parroquia a futura catedral.
- «Cada etapa recibió el mismo problema sin resolver» sintetiza la sucesión de directores y la obra
  incompleta; no afirma que todos tomaran idénticas decisiones.
- «El exterior habla en clásico» y «dos etapas de Madrid» son formulaciones orales de P08 y P10.
- «La imagen que la capital quería construir de sí misma» interpreta la intención documentada de adecuar
  el edificio al Palacio y a su entorno; no se atribuye a una persona concreta.
- No se usa la fecha discrepante del derribo de la iglesia anterior ni la errata «1983» de S05.
- No se presenta a Cubas, Chueca y Sidro como rivales personales ni se inventan escenas o diálogos.

## Redacción y reparación local

DeepSeek `deepseek-v4-flash`, a temperatura 0,7 y con pensamiento desactivado, produjo un primer borrador.
La revisión editorial conservó su arco general y modificó ventanas concretas:

1. Eliminó una personificación inicial demasiado ornamental y mantuvo una comparación visual más directa.
2. Sustituyó «Cubas [...] soñó» por la acción documentada de proyectar.
3. Eliminó la enumeración de cuatro arquitectos sucesivos, que aportaba precisión pero devolvía el texto
   al tono de ficha.
4. Corrigió «casas consistoriales de los siglos XV, XVI y XVII»: las tres son arquitectura civil, pero
   solo la Casa de la Villa fue sede municipal.
5. Redujo el texto a una duración oral cercana a tres minutos sin retirar el conflicto ni la revelación.
6. Precisó «proyecto exterior neogótico» para no sugerir que aquella fachada ya estaba construida.

## Lectura adversarial local

Gemma `gemma4:12b` se ejecutó en Ollama Windows sin poder de aprobación:

1. El primer pase incumplió el encargo objecional: emitió una aprobación, citó una proposición P12
   inexistente y afirmó que había una dirección de mirada hacia la cúpula que el guion no contiene. La
   respuesta se descartó completa.
2. El segundo pase recibió un esquema JSON estricto y la corrección explícita del error anterior, pero
   devolvió únicamente metadatos de pensamiento y ninguna objeción auditable. También se descartó.
3. La auditoría manual posterior sí detectó la ambigüedad entre fachada construida y proyecto exterior;
   se aplicó la reparación local número 6 y se reauditaron todas las afirmaciones.

Por tanto, Gemma no aporta evidencia positiva ni negativa sobre este guion. Su fallo queda registrado en
vez de convertir una salida inválida en una aprobación automática.
