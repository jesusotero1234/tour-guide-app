# Golden Fixtures — Narrative Quality Test Cases

**Date:** 2026-06-10
**Version:** 1.0

10 casos de prueba que cubren el espectro de POIs que el sistema debe manejar.
Cada fixture incluye evidencia de entrada, brief esperado, ejemplo aceptable,
ejemplo no aceptable, y resultado esperado del validador.

---

## Fixture 1 — Monumento Rico (Puerta de Alcalá, Madrid)

**Seed quality:** rich (>500 chars)
**Theme:** history
**Language:** es
**City:** Madrid

### Evidence Input
```json
{
  "localName": "Puerta de Alcalá",
  "cityName": "Madrid",
  "language": "es",
  "theme": "history",
  "seeds": {
    "wikidataClaims": {
      "P571": "1778",
      "P84": "Francesco Sabatini",
      "P149": "neoclásico",
      "P625": "40.42,-3.688"
    },
    "wikipediaLead": "La Puerta de Alcalá es una de las cinco antiguas puertas reales que daban acceso a Madrid. Fue construida por orden de Carlos III para sustituir otra puerta anterior del siglo XVI. Diseñada por Francesco Sabatini en estilo neoclásico, se inauguró en 1778.",
    "wikipediaBody": "Construida en granito y piedra blanca de Colmenar, presenta cinco arcos: tres de medio punto y dos adintelados. Está decorada con esculturas de ángeles y trofeos militares obra de Francisco Gutiérrez y Roberto Michel.",
    "osmTags": { "historic": "monument", "tourism": "attraction" }
  }
}
```

### Expected NarrativeBrief
```
allowedFacts: ["1778", "Francesco Sabatini", "neoclásico", "Carlos III", "granito", "piedra de Colmenar", "cinco arcos", "Francisco Gutiérrez", "Roberto Michel"]
visibleCues: ["cinco arcos", "granito y piedra blanca", "esculturas de ángeles", "trofeos militares", "Plaza de la Independencia"]
tone: "serious-cultivated"
```

### Acceptable Example (arrival)
"Has llegado a la Puerta de Alcalá. Fíjate en sus cinco arcos: tres de medio punto en el centro y dos adintelados en los laterales. La combinación de granito y piedra blanca de Colmenar le da un contraste que cambia con la luz del día."

### Unacceptable Example (arrival)
"Bienvenidos a la majestuosa Puerta de Alcalá, un lugar emblemático que se alza imponente en el corazón de Madrid. Su impresionante fachada de piedra refleja el poder y la riqueza de la monarquía española."

### Expected Validator Result
- **PASS** on acceptable example
- **FAIL** on unacceptable example: `banned-phrase-majestuosa`, `banned-phrase-imponente`, `banned-phrase-poder y riqueza`

---

## Fixture 2 — Edificio Cívico Rico (Palacio de Cibeles, Madrid)

**Seed quality:** rich
**Theme:** architecture/art
**Language:** es
**City:** Madrid

### Evidence Input
```json
{
  "localName": "Palacio de Cibeles",
  "cityName": "Madrid",
  "language": "es",
  "theme": "architecture",
  "seeds": {
    "wikidataClaims": {
      "P571": "1919",
      "P84": "Antonio Palacios, Joaquín Otamendi",
      "P149": "modernista, neoplateresco"
    },
    "wikipediaLead": "El Palacio de Cibeles (antiguo Palacio de Comunicaciones) es un edificio de estilo modernista con elementos neoplaterescos, construido entre 1907 y 1919 por los arquitectos Antonio Palacios y Joaquín Otamendi como sede de Correos.",
    "wikipediaBody": "Su fachada principal de piedra caliza blanca se organiza en tres cuerpos. Destaca la torre central de 40 metros. El interior alberga un patio de operaciones cubierto por una vidriera monumental.",
    "osmTags": { "amenity": "townhall", "tourism": "attraction" }
  }
}
```

### Expected NarrativeBrief
```
allowedFacts: ["1919", "Antonio Palacios", "Joaquín Otamendi", "modernista", "neoplateresco", "Correos", "piedra caliza blanca", "torre central 40 metros"]
visibleCues: ["fachada de piedra caliza blanca", "torre central", "tres cuerpos", "Plaza de Cibeles"]
tone: "serious-cultivated"
```

### Acceptable Example (history)
"Este edificio fue la sede central de Correos desde 1919. Los arquitectos Antonio Palacios y Joaquín Otamendi mezclaron modernismo con detalles neoplaterescos. Fíjate en la torre central: 40 metros que antes dominaban el perfil de esta zona."

### Unacceptable Example (history)
"Este majestuoso palacio fue construido en 1919 como sede de correos. Su imponente torre central se alza sobre la plaza, creando una atmósfera de grandiosidad que cautiva a cada visitante."

### Expected Validator Result
- **PASS** on acceptable
- **FAIL** on unacceptable: `banned-phrase-majestuoso`, `banned-phrase-atmosfera`

---

## Fixture 3 — Iglesia Rica (Catedral de Toledo)

**Seed quality:** rich
**Theme:** history
**Language:** es
**City:** Toledo

### Evidence Input
```json
{
  "localName": "Catedral de Santa María de Toledo",
  "cityName": "Toledo",
  "language": "es",
  "theme": "history",
  "seeds": {
    "wikidataClaims": {
      "P571": "1493",
      "P149": "gótico"
    },
    "wikipediaLead": "La catedral de Santa María de Toledo, de estilo gótico, comenzó a construirse en 1226 sobre los restos de una mezquita y se terminó a finales del siglo XV.",
    "wikipediaBody": "Considerada el máximo exponente del gótico español. Su construcción se extendió durante más de dos siglos. Destaca la Capilla Mayor con su retablo de madera dorada y el Transparente de Narciso Tomé.",
    "osmTags": { "amenity": "place_of_worship", "religion": "christian", "denomination": "catholic" }
  }
}
```

### Expected NarrativeBrief
```
allowedFacts: ["1493", "1226", "gótico", "mezquita", "Capilla Mayor", "retablo de madera dorada", "Transparente", "Narciso Tomé", "siglo XV"]
visibleCues: ["fachada gótica", "torre", "Puerta del Reloj", "Puerta de los Leones"]
tone: "serious-cultivated"
```

### Acceptable Example (history)
"La catedral empezó a levantarse en 1226 sobre una antigua mezquita y no se terminó hasta finales del siglo XV. Son más de dos siglos de obra que dejaron la referencia del gótico español. Si entras, busca el Transparente de Narciso Tomé: es una ventana de luz esculpida en la girola."

### Unacceptable Example (history)
"Esta catedral gótica es un testimonio tangible del poder y la riqueza de la iglesia medieval. Su atmósfera misteriosa y sus juegos de luces y sombras te transportan a otra época."

### Expected Validator Result
- **PASS** on acceptable
- **FAIL** on unacceptable: `banned-phrase-testimonio tangible`, `banned-phrase-poder y riqueza`, `banned-phrase-atmosfera`, `banned-phrase-juego de luces`, `banned-phrase-sombras`

---

## Fixture 4 — Plaza Media (Plaza Mayor, Madrid)

**Seed quality:** medium (300-500 chars of evidence)
**Theme:** history
**Language:** es
**City:** Madrid

### Evidence Input
```json
{
  "localName": "Plaza Mayor",
  "cityName": "Madrid",
  "language": "es",
  "theme": "history",
  "seeds": {
    "wikidataClaims": {
      "P571": "1619",
      "P84": "Juan de Herrera, Juan Gómez de Mora"
    },
    "wikipediaLead": "La Plaza Mayor es una plaza porticada rectangular situada en el centro de Madrid. Construida en el siglo XVII por Juan de Herrera y Juan Gómez de Mora, ha sido escenario de mercados, corridas de toros y autos de fe.",
    "osmTags": { "tourism": "attraction", "highway": "pedestrian" }
  }
}
```

### Expected NarrativeBrief
```
allowedFacts: ["1619", "Juan de Herrera", "Juan Gómez de Mora", "siglo XVII", "mercados", "corridas de toros", "autos de fe"]
visibleCues: ["plaza porticada rectangular", "arcos", "estatua ecuestre de Felipe III", "color rojo de los edificios"]
tone: "warm-practical"
```

### Acceptable Example (arrival)
"Has entrado en la Plaza Mayor. Es un rectángulo porticado de 129 por 94 metros. Mira arriba: los edificios rojos con balcones de hierro forjado rodean todo el perímetro. La estatua ecuestre del centro es Felipe III, el rey que ordenó construirla."

### Unacceptable Example (arrival)
"Bienvenidos a la Plaza Mayor, un lugar emblemático de Madrid que se presenta ante ti con todo su esplendor. Este espacio rectangular ha sido testigo de siglos de historia y refleja la esencia de la capital."

### Expected Validator Result
- **PASS** on acceptable
- **FAIL** on unacceptable: `banned-phrase-bienvenidos`, `banned-phrase-lugar emblematico`

---

## Fixture 5 — Mercado Medio (Mercado de San Miguel, Madrid)

**Seed quality:** medium
**Theme:** food/gastronomy
**Language:** es
**City:** Madrid

### Evidence Input
```json
{
  "localName": "Mercado de San Miguel",
  "cityName": "Madrid",
  "language": "es",
  "theme": "gastronomy",
  "seeds": {
    "wikidataClaims": {
      "P571": "1916",
      "P149": "modernista"
    },
    "wikipediaLead": "El Mercado de San Miguel es un mercado de abastos construido en 1916 en estilo modernista con estructura de hierro. Se encuentra junto a la Plaza Mayor.",
    "osmTags": { "amenity": "marketplace", "building": "yes" }
  }
}
```

### Acceptable Example (arrival)
"Estás frente al Mercado de San Miguel, construido en 1916. La estructura de hierro y las paredes de vidrio son puro modernismo de principios del siglo XX. Dentro, los puestos de comida ocupan todo el espacio que antes era un mercado de abastos tradicional."

### Unacceptable Example
"El Mercado de San Miguel es una joya gastronómica escondida en el centro de Madrid. Este lugar cautiva a cada visitante con su atmósfera vibrante y sus aromas irresistibles. Es un must-see para cualquier foodie."

### Expected Validator Result
- **FAIL** on unacceptable: `banned-phrase-hidden gem` (joya escondida), `banned-phrase-captivates`, `banned-phrase-must-see`

---

## Fixture 6 — POI Thin Seed (Fuente pequeña sin mucha historia)

**Seed quality:** thin (<300 chars)
**Theme:** history
**Language:** es

### Evidence Input
```json
{
  "localName": "Fuente de los Delfines",
  "cityName": "Madrid",
  "language": "es",
  "theme": "history",
  "seeds": {
    "wikidataClaims": {},
    "wikipediaLead": "",
    "osmTags": { "amenity": "fountain" }
  }
}
```

### Acceptable Example (arrival)
"Esta es la Fuente de los Delfines. Es una de las muchas fuentes ornamentales del barrio. Fíjate en los detalles escultóricos: los delfines de bronce que le dan nombre sostienen la pila central. El agua cae en tres niveles."

### Unacceptable Example (arrival)
"La Fuente de los Delfines data probablemente del siglo XVIII y fue diseñada por un discípulo de Ventura Rodríguez. Sus aguas han visto pasar a reyes y cortesanos."

### Expected Validator Result
- **PASS** on acceptable (breve, observacional, se ciñe a lo visible)
- **FAIL** on unacceptable: `unverified-date`, `unverified-architect`, `unverified-historical_person`

---

## Fixture 7 — Ciudad con RAG (Barcelona, Sagrada Familia)

**Seed quality:** rich (with enrichedContext from RAG)
**Theme:** architecture
**Language:** es
**City:** Barcelona

### Evidence Input
```json
{
  "localName": "Basílica de la Sagrada Familia",
  "cityName": "Barcelona",
  "language": "es",
  "theme": "architecture",
  "seeds": {
    "wikidataClaims": {
      "P571": "1882",
      "P84": "Antoni Gaudí",
      "P149": "modernista"
    },
    "wikipediaLead": "La Sagrada Familia es una basílica católica diseñada por Antoni Gaudí. Iniciada en 1882, sigue en construcción. Es el máximo exponente de la arquitectura modernista catalana.",
    "wikipediaBody": "Gaudí diseñó 18 torres: 12 apóstoles, 4 evangelistas, la Virgen María y Jesucristo. Las fachadas del Nacimiento y la Pasión muestran estilos escultóricos radicalmente distintos. El interior imita un bosque de columnas arborescentes.",
    "enrichedContext": "--- LOCAL CONTEXT ---\nLa Sagrada Familia atrae 4.5 millones de visitantes al año. Es el monumento más visitado de España. La Junta Constructora financia las obras exclusivamente con donaciones y entradas.\n--- REGIONAL BACKGROUND ---\nEl modernismo catalán fue un movimiento arquitectónico y cultural de finales del siglo XIX y principios del XX."
  }
}
```

### Acceptable Example (significance)
"La Sagrada Familia no es solo el edificio más visitado de España — 4.5 millones de entradas al año financian su construcción. Es el único gran templo del mundo que se levanta sin dinero público, solo con donaciones y taquilla. Una obra que empezó en 1882 y que avanza hacia las 18 torres que Gaudí dibujó."

### Unacceptable Example (significance)
"La Sagrada Familia es una joya arquitectónica que deja sin aliento a todo el que la visita. Su atmósfera mística y sus juegos de luces y sombras crean una experiencia inolvidable. Es, sin duda, el lugar más impresionante de Barcelona."

### Expected Validator Result
- **PASS** on acceptable
- **FAIL** on unacceptable: `banned-phrase-atmosfera`, `banned-phrase-juego de luces`, `banned-phrase-sombras`

---

## Fixture 8 — Ciudad sin RAG (POI con solo OSM + Wikidata básico)

**Seed quality:** thin/medium
**Theme:** history
**Language:** en
**City:** small city

### Evidence Input
```json
{
  "localName": "Town Hall",
  "cityName": "Alcalá de Henares",
  "language": "en",
  "theme": "history",
  "seeds": {
    "wikidataClaims": {
      "P571": "1870"
    },
    "wikipediaLead": "The Town Hall of Alcalá de Henares is a 19th-century building located in the Plaza de Cervantes.",
    "osmTags": { "amenity": "townhall" }
  }
}
```

### Acceptable Example (arrival)
"You're standing in front of the Town Hall, built in 1870. The facade is symmetrical, with a central balcony overlooking Plaza de Cervantes. The brickwork and the wrought-iron details are typical of late 19th-century civic architecture in this region."

### Unacceptable Example (arrival)
"The Town Hall of Alcalá de Henares is a hidden gem of Spanish civic architecture. This timeless building whispers the past of a city steeped in history. Every visitor who arrives here is captivated by its timeless charm."

### Expected Validator Result
- **PASS** on acceptable
- **FAIL** on unacceptable: `banned-phrase-hidden gem`, `banned-phrase-steeped in history`, `banned-phrase-timeless charm`

---

## Fixture 9 — Tema History con hecho controvertido

**Seed quality:** rich
**Theme:** history
**Language:** es
**City:** Córdoba

### Evidence Input
```json
{
  "localName": "Mezquita-Catedral de Córdoba",
  "cityName": "Córdoba",
  "language": "es",
  "theme": "history",
  "seeds": {
    "wikidataClaims": {
      "P571": "786",
      "P149": "califal, renacentista, barroco"
    },
    "wikipediaLead": "La Mezquita-Catedral de Córdoba comenzó como basílica visigoda, fue mezquita desde 786 y catedral católica desde 1236. Su bosque de columnas y arcos de herradura es único en el mundo.",
    "wikipediaBody": "Abderramán I inició la construcción en 786 sobre una basílica visigoda. Las sucesivas ampliaciones crearon un espacio de 23.400 m² con más de 850 columnas de mármol, jaspe y granito. En 1236 Fernando III la consagró como catedral. En el siglo XVI se inserta una catedral renacentista en el centro.",
    "osmTags": { "amenity": "place_of_worship", "tourism": "attraction" }
  }
}
```

### Acceptable Example (history)
"Este edificio cuenta 1.300 años en tres capas. Empezó como basílica visigoda, Abderramán I la convirtió en mezquita en 786, y en 1236 Fernando III la consagró catedral. El resultado es un bosque de 850 columnas de mármol y jaspe con arcos de herradura bicolores. No hay otro espacio así en el mundo."

### Unacceptable Example (history)
"La Mezquita-Catedral representa el choque de civilizaciones entre el mundo islámico y el cristiano. Su atmósfera misteriosa revela siglos de conflictos religiosos. Los arcos de herradura crean un efecto hipnótico que invita a la reflexión espiritual."

### Expected Validator Result
- **PASS** on acceptable (ceñido a facts, descriptivo)
- **FAIL** on unacceptable: `banned-phrase-atmosfera` — also contains editorializing not supported by evidence

---

## Fixture 10 — Tema Architecture/Art con detalles técnicos

**Seed quality:** rich
**Theme:** architecture
**Language:** en
**City:** Barcelona

### Evidence Input
```json
{
  "localName": "Casa Milà (La Pedrera)",
  "cityName": "Barcelona",
  "language": "en",
  "theme": "architecture",
  "seeds": {
    "wikidataClaims": {
      "P571": "1912",
      "P84": "Antoni Gaudí",
      "P149": "modernista"
    },
    "wikipediaLead": "Casa Milà, popularly known as La Pedrera (the stone quarry), is a modernist building designed by Antoni Gaudí. Built between 1906 and 1912, it was Gaudí's last civil work before dedicating himself entirely to the Sagrada Familia.",
    "wikipediaBody": "The building is famous for its undulating stone facade, wrought-iron balconies, and rooftop chimneys. Gaudí used a self-supporting stone facade with no load-bearing walls, allowing free floor plans. The rooftop features 28 chimneys shaped like warriors.",
    "osmTags": { "tourism": "attraction", "building": "yes" }
  }
}
```

### Acceptable Example (history)
"Casa Milà was Gaudí's last civilian project — finished in 1912, after which he focused only on the Sagrada Familia. He did something radical here: the stone facade is self-supporting. No load-bearing walls inside meant every floor could have a different layout. The curved exterior isn't decoration — it's engineering."

### Unacceptable Example
"La Pedrera is a breathtaking masterpiece of Catalan modernism. Its undulating facade and mysterious rooftop chimneys create an atmosphere of wonder that captivates every visitor. This hidden gem tells a story of Gaudí's unique genius and invites you to imagine his creative world."

### Expected Validator Result
- **PASS** on acceptable
- **FAIL** on unacceptable: `banned-phrase-atmosphere`, `banned-phrase-hidden gem`, `banned-phrase-captivates`, `banned-phrase-invites you to imagine`

---

## Summary

| # | Fixture | Seed Quality | Key Risk |
|---|---------|-------------|----------|
| 1 | Puerta de Alcalá | rich | AI-isms, adjetivación vacía |
| 2 | Palacio de Cibeles | rich | Clichés arquitectónicos |
| 3 | Catedral de Toledo | rich | Prosa atmosférica inventada |
| 4 | Plaza Mayor | medium | Frases formulaicas de bienvenida |
| 5 | Mercado de San Miguel | medium | Hipérbole gastronómica |
| 6 | Fuente thin | thin | Invención de facts |
| 7 | Sagrada Familia + RAG | rich | Ignorar datos concretos del RAG |
| 8 | Town Hall sin RAG | thin | Clichés en inglés |
| 9 | Mezquita-Catedral | rich | Editorialización histórica |
| 10 | Casa Milà | rich | Prosa turística vs. datos técnicos |
