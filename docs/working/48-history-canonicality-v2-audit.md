# Auditoría history canonicality v2: multi-ciudad sin audio

Fecha: 2026-06-24  
Rama: `codex/history-canonicality-v2`

## Objetivo

Comprobar si las mejoras de selección histórica y narración generalizan fuera de Barcelona, sin audio, usando fuentes congeladas para no depender de llamadas repetidas a Wikipedia/Wikidata.

El criterio no era solo pasar tests: el tour debe sentirse como un guía real. Si el resultado queda correcto pero frío, repetitivo o con paradas poco memorables, todavía no cuenta como listo para vender.

## Qué se hizo

- Se capturaron snapshots de fuentes para Madrid/es, Berlin/de, Roma/it, Amsterdam/nl, Toulouse/fr y Málaga/es.
- Se regeneraron tours sin audio desde fixtures.
- Se evaluó cada tour con la rúbrica actual y review humano corto.
- Se corrigió un problema del llm-pod que podía producir fallbacks por configuración de entorno:
  - limpia valores con comentarios inline;
  - normaliza `OLLAMA_HOST`;
  - evita depender de que la variable venga con `http://`.

## Resultado general

| Ciudad / idioma | Score | Publicable | Fallbacks | Críticas | Duración | Veredicto humano |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Madrid / es | 93.5 | Sí | 0 | 0 | 95% | Sí lo pagaría |
| Berlin / de | 86.4 | Sí | 0 | 0 | 98% | Sí lo pagaría |
| Roma / it | 88.3 | Sí | 0 | 0 | 95% | Sí lo pagaría |
| Amsterdam / nl | 86.2 | Sí | 0 | 0 | 96% | Casi sí; necesita mejor arranque |
| Toulouse / fr | 76.9 | No | 0 | 0 | 93% | Todavía no |
| Málaga / es | 77.2 | No | 0 | 0 | 94% | Todavía no |

Lectura rápida:

- Lo técnico mejoró mucho: 0 fallbacks, 0 contradicciones críticas, duración en rango.
- La calidad fuerte ya no parece específica de un idioma: español, alemán, italiano y neerlandés pasan 85+.
- El problema que queda no es “el LLM no escribe”; es “la ruta a veces no escoge lo más inevitable para una ciudad histórica”.

## Review por ciudad

### Madrid / es

Ruta:

Puerta del Sol → Plaza Mayor → plaza de la Villa → Palacio Real → Senado → plaza de España → Callao → Chueca → Palacio de Buenavista → Palacio de Linares → Puerta de Alcalá → Colón → Teatro de la Zarzuela

Se siente como tour. El arranque en Puerta del Sol funciona porque habla de noticias, país, centro urbano y vida pública. La ruta tiene una lectura clara: poder, plazas, palacio, ciudad moderna y símbolos. Es el mejor candidato de esta tanda.

¿Lo pagaría? Sí. No perfecto, pero ya está en terreno comercial.

Pendiente:

- Reducir repetición de ideas como “transformación”, “identidad”, “capas” y “estructura urbana”.
- Hacer que algunas paradas medias suenen menos ensayísticas y más de guía caminando contigo.

### Berlin / de

Ruta:

Alexanderplatz → Berliner Schloss → Palast der Republik → Berliner Dom → Neue Wache → Gendarmenmarkt → Checkpoint Charlie → Potsdamer Platz → Reichstagsgebäude → Sowjetisches Ehrenmal → Denkmal für die ermordeten Juden Europas → Brandenburger Tor → Pariser Platz

Esta prueba respondió bien a la preocupación inicial: sí aparecen los iconos que uno espera para historia de Berlín, incluyendo Reichstag, Checkpoint Charlie, memorial del Holocausto y Puerta de Brandeburgo.

¿Lo pagaría? Sí. Tiene ruta reconocible y sensación de historia vivida.

Pendiente:

- El verificador de claims puntúa bajo aunque el contenido no tenga fallos críticos; probablemente hay margen en claim extraction multi-idioma.
- La variedad de aperturas salió en 0; conviene evitar que demasiadas paradas empiecen con estructuras parecidas tipo “Schau/Betrachte”.

### Roma / it

Ruta:

Pantheon → piazza Venezia → Colonna Traiana → Foro di Traiano → Foro di Augusto → Foro Romano → Campidoglio → Quirinale → piazza di Spagna → Castel Sant'Angelo → piazza San Pietro → Palazzo Apostolico → cappella Sistina

Muy sólida. Se siente como historia real porque el recorrido pisa lugares donde ocurrió la vida pública, imperial, religiosa y política de Roma. El eje antiguo funciona especialmente bien.

¿Lo pagaría? Sí.

Pendiente:

- Mejorar cobertura de anchors esperados: la ruta es buena, pero la rúbrica indica que no captura todos los “obvios”.
- Cuidar palabras recurrentes como “strati” y “memoria”.

### Amsterdam / nl

Ruta:

Museumplein → Leidseplein → Rembrandtplein → Munttoren → Homomonument → Anne Frank Huis → Noorderkerk → Sint-Olofskapel → Nieuwmarkt → Warmoesstraat → Paleis op de Dam → Nationaal Monument → Dam

Funciona bien cuando llega a Munttoren, Homomonument, Anne Frank Huis y Dam. La parada de Anne Frank se siente humana y con historia concreta, no solo arquitectura.

¿Lo pagaría? Casi sí. El contenido central es bueno, pero el arranque con Museumplein/Leidseplein/Rembrandtplein puede sentirse más urbano-cultural que “historia inevitable”.

Pendiente:

- Mejorar el inicio de ruta para que el primer minuto ya prometa historia.
- Arreglar variedad de aperturas, que también salió en 0.

### Toulouse / fr

Ruta:

canal de Brienne → église Saint-Nicolas → place Saint-Pierre → université Toulouse-Capitole → basilique Saint-Sernin → place Saint-Georges → église Notre-Dame de la Dalbade → place de la Trinité → basilique de la Daurade → hôtel de Jean Bernuy → capitole → place du Capitole → église des Cordeliers

Pasa los gates técnicos, pero no se siente suficientemente premium. Hay demasiadas paradas que parecen “espacio urbano / iglesia / plaza” y no siempre se percibe por qué ese punto era inevitable para un tour histórico.

¿Lo pagaría? Todavía no.

Pendiente:

- Proteger más fuerte los lugares icónicos locales antes de optimizar continuidad.
- Reducir narrativa genérica de “el espacio se transforma”.
- Subir “wow histórico”: hechos, personajes, conflictos y épocas concretas.

### Málaga / es

Ruta:

Palacio de Buenavista → Catedral → Palacio de la Aduana → Muralla nazarí → Marqués de Larios → antigua estación del ferrocarril suburbano → Fuerte de San Lorenzo → Conservatorio María Cristina → Plaza de la Merced → Gibralfaro → plaza de toros → Cementerio Inglés → Castillo y Muralla de Santa Catalina

Aquí está el fallo más claro de producto: para historia de Málaga uno esperaría Alcazaba y Teatro Romano, y no deberían perder frente a puntos secundarios como una antigua estación suburbana o el conservatorio.

¿Lo pagaría? No todavía. Tiene material bueno, pero la selección de paradas rompe confianza.

Pendiente:

- Asegurar Alcazaba / Teatro Romano / Gibralfaro como anchors históricos fuertes cuando existan en candidatos.
- Penalizar infraestructura secundaria si desplaza lugares históricos obvios.
- Separar “edificio con fecha” de “lugar donde la historia de la ciudad se entiende”.

## Qué aprendimos

La mejora sí escala, pero no de forma completa.

Para ciudades con anchors muy famosos y bien rankeados, el sistema ya produce tours buenos. Para ciudades medianas o con datos menos homogéneos, el algoritmo puede elegir POIs verificables pero no suficientemente deseables.

La siguiente mejora no debería ser más texto. Debe ser mejor criterio editorial de ruta:

1. Primero asegurar lo inevitable.
2. Luego ordenar caminablemente.
3. Luego narrar con naturalidad.

Si invertimos ese orden, obtenemos tours correctos pero no comprables.

## Plan para subir de 85 a 90

### 1. Protección de anchors icónicos por ciudad

Objetivo: que historia incluya los lugares que un usuario esperaría aunque no sepa pedirlos.

Regla propuesta:

- Para `history`, reservar 2-4 slots a anchors de alta fama histórica antes de completar la ruta.
- Usar señales generales, no hacks por ciudad:
  - sitelinks / popularidad Wikidata;
  - categorías históricas fuertes: castle, archaeological site, city gate, palace, monument, battlefield, fortification, old town hall, ancient theatre;
  - coincidencia con Wikipedia local;
  - penalización si el lugar es principalmente museo moderno, oficina, institución secundaria o infraestructura menor.

### 2. Diferenciar “museo de historia” vs “lugar donde ocurrió historia”

No todo museo debe perder, pero en un tour de historia el museo debe justificar por qué es parte de la historia urbana. Si solo contiene historia, pero el lugar no la encarna, baja prioridad.

Esto responde exactamente al caso que vimos: “histórico” no debe significar “sale un museo”; debe significar “aquí ocurrió algo o este lugar explica la ciudad”.

### 3. Repair automático de rutas bajo 80

Si un tour queda por debajo de 80:

- detectar anchors esperados ausentes;
- reinsertar 1-2 anchors;
- quitar los POIs más débiles;
- regenerar solo el tour afectado sin tocar fuentes.

Esto debe aplicarse primero a Málaga y Toulouse.

### 4. Menos repetición narrativa

Hay que bajar recurrencias de:

- transformación;
- identidad;
- capas / estratos;
- memoria;
- estructura urbana.

No se deben prohibir totalmente, pero sí limitar por tour y pedir alternativas más humanas:

- “mira lo que cambia al girar esta esquina”;
- “este lugar cuenta una pelea concreta”;
- “aquí la ciudad tomó una decisión”;
- “este edificio sobrevivió porque...”.

### 5. Mejor variedad de aperturas por idioma

Berlin y Amsterdam perdieron puntos por variedad de aperturas. Esto se puede mejorar sin tocar rutas:

- rotar arranques visuales, pregunta, contraste, personaje, fecha, rumor local;
- evitar que muchas paradas empiecen con el mismo verbo;
- validar por idioma, no solo en español.

### 6. Mejor claim checking multi-idioma

Berlin y Roma tienen contenido aceptable, pero baja tasa de claims verificados. Probablemente el auditor no extrae igual de bien en alemán/italiano, o no enlaza todas las fuentes disponibles.

Objetivo: no castigar tours buenos por limitación del evaluador.

## Próximo paso recomendado

No seguir puliendo Madrid. Madrid ya está muy bien.

Siguiente iteración:

1. Implementar protección general de anchors históricos.
2. Probar solo Málaga y Toulouse.
3. Si ambas suben a 80+, regenerar el set completo de 6.
4. Si 6/6 pasan, entonces trabajar la naturalidad para subir de 85 a 90.

## Criterio de éxito para la siguiente rama

- Málaga sube de 77.2 a 80+ incluyendo Alcazaba o Teatro Romano si están disponibles.
- Toulouse sube de 76.9 a 80+ con menos sensación de ruta genérica.
- Madrid, Berlin, Roma y Amsterdam no bajan de 85.
- Todos mantienen:
  - 0 fallbacks;
  - 0 contradicciones críticas;
  - duración entre 85% y 115%;
  - narración natural de guía.
