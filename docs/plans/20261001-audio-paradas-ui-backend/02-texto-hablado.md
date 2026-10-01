# 02 · Texto hablado: fechas, números y abreviaturas legibles por el TTS

Estado: propuesto · Depende de: [01](01-fase0-backend-base.md) · Lo usan: [03](03-paradas-sin-orden.md) (solo para el texto hablado de los enlaces, en 04), [04](04-regeneracion-y-publicacion.md) · Responsable de la migración Prisma única del plan (§7.1)

## 1. Problema

VoxCPM2 lee el texto tal cual. No tiene SSML ni fonemas, y no normaliza en es/fr/de/it
(su opción `normalize=` solo cubre zh/en y Nano no la admite). El texto de las paradas
lleva cifras y romanos, y el audio las pronuncia mal: «siglo IV», «1876», «Jaime I»,
«d. C.», «15.800», «1657-1658».

Medido el 1 de octubre de 2026 sobre las 1.653 paradas publicadas:

| Idioma | Paradas | Años de 4 cifras | Siglo + romano | Rey/papa + romano | Abreviaturas (a. C., St., …) | Millares | % |
|---|---|---|---|---|---|---|---|
| es | 377 | 87 % | 60 % | 38 % | 10 % | 12 % | 1 % |
| fr | 319 | 97 % | 68 % («XIXe siècle») | 37 % | 11 % | 14 % | 1 % |
| it | 319 | 97 % | 66 % («XIX secolo») | 46 % | 11 % | 14 % | 1 % |
| de | 319 | 97 % | 86 % con ordinal con punto («19. Jahrhundert», «25. März») | 41 % | 12 % | 14 % | 1 % |
| en | 319 | 97 % | (escritos en letra) | 42 % | 13 % | 0 % | 1 % |

Conclusión: casi **todas** las paradas necesitan normalización, así que hay que
regenerar todo el audio (eso se hace una sola vez en [04](04-regeneracion-y-publicacion.md)).

### Qué hay hoy (no reutilizable tal cual)

- `pods/voxcpm-pod/src/utils/tour_audio_input.py:67-143` (`prepare_input`) aplica, en este orden:
  - `textReplacements` del preset, **solo en español** (`:131-133`). Son 6 entradas fijas pensadas para Sevilla, en `presets/guide-es-a.json`: `1248`, `1249`, `siglo XI`, `siglo XIV`, `Alfonso X`, `Pedro I`.
  - `sanitize_text`.
  - `_expand_french_years`, **solo en francés** (`:12-49`, `:137`).
  - `chunk_text(360)`.
- **Bug** en `pods/voxcpm-pod/src/utils/sanitize.py:17-20`: cambia `km`, `m`, `St.` y `Ave.` por las palabras **inglesas** «kilometers», «meters», «Saint» y «Avenue» en todos los idiomas. Además, `:39` borra un `\d+[.)]` al inicio de línea, así que un párrafo que empieza por «1492. …» pierde el año.
- La regla editorial de fechas (`docs/tours/regla-editorial-fechas-audioguias.md`) pide en su punto 8 «escribe los números como deben pronunciarse». **No se inyecta en producción:** solo actúa con `NARRATIVE_TEMPORAL_RULE=selected`, y ninguno de los 30 `combined-prompt.md` la contiene.
- El prompt de traducción (`backend/scripts/admin/deepseek-batch-text.py:492,524`) dice «numbers spelled out» en el sentido de *conservarlos*, no de convertirlos.
- No existe un campo de texto hablado:
  - `Place.description` y `Tour.introduction` sirven para pantalla y para audio.
  - `TourAudioService.ts:103` calcula el hash con `description`.
  - El texto hablado real solo queda en el sidecar `<id>.provenance.json` (`spokenText`).

## 2. Decisiones (no reabrir sin el usuario)

1. **El texto de pantalla y el hablado se separan.**
   - `description` / `introduction` siguen con cifras («siglo XIV», «1876»), que se leen mejor.
   - Se guarda `spokenText` aparte («siglo catorce», «mil ochocientos setenta y seis»).
2. **`spokenText` se persiste:** en la BD y en los JSON de lote. El audio y su hash se calculan sobre `spokenText`, así que cambiar la normalización de una pieza regenera solo esa pieza.
3. **El normalizador es determinista, en Python y por idioma.**
   - Vive en `pods/voxcpm-pod/src/utils/speech/`.
   - Usa `num2words==0.5.14` (verificado; da salidas correctas en es/fr/de/it/en, ver §4.0).
   - El LLM **solo** interviene en los residuos que el normalizador no resuelve con seguridad, y siempre bajo una guarda de diff (§6).
4. **Una puerta dura antes del TTS.** Si el texto que va a sintetizarse contiene una cifra, un romano, una abreviatura de la lista o un símbolo, la pieza **no se renderiza**. Es la garantía de que no vuelva a pasar.
5. **Los presets de voz no se tocan.** `presetSha256` forma parte de la identidad del audio (`AudioProvenance.ts:26`) y de `rendererKey` (`TourAudioService.ts:81-86`). Si se edita un preset, cambia `rendererKey`, todos los audios de ese idioma quedan obsoletos al desplegar el backend y sus tours **desaparecen de la API**: también los tours excluidos de la regeneración, y la reversión de [04](04-regeneracion-y-publicacion.md) §11 ya no funcionaría.
   - Los `textReplacements` (es) y `_expand_french_years` (fr) siguen tal cual para las piezas **sin** `spokenText` (camino heredado).
   - Se **ignoran** cuando la pieza trae `spokenText`; las reglas equivalentes viven en el normalizador y el léxico.
6. **`spokenText` es exactamente lo que se sintetiza.** El léxico y la limpieza (lo equivalente a `sanitize`) se aplican **dentro** de `normalize`. En el render, una pieza con `spokenText` solo pasa por la puerta y el troceado. Si `sanitize_text(spokenText) != spokenText`, el render falla, en lugar de corregirlo en silencio.
7. **Lo heredado no cambia ni un byte.** Una pieza sin `spokenText` produce exactamente el mismo texto, hash, transcript y huella que hoy. Se comprueba con pruebas de regresión (§10).

## 3. Arquitectura

```
description / introduction / texto de enlace (pantalla)
        │
        ▼
speech.normalize(text, lang, country_code)      ← determinista, versión SPEECH_VERSION
        │  ├─ limpieza (URL, corchetes, markdown: lo que hoy hace sanitize, sin las sustituciones inglesas)
        │  ├─ reglas por idioma (es.py, en.py, fr.py, de.py, it.py)
        │  └─ léxico de pronunciación (lexicon/<lang>.json)
        ▼
speech.gate(spoken, lang) ── violaciones ──► reparación LLM (solo frases marcadas, guarda de diff)
        │                                         │
        ▼                                         ▼
spokenText persistido (BD + JSON de lote) ◄───────┘   = texto EXACTO que se sintetiza
        │
        ▼
render-tour.py → prepare_input: si hay spokenText → comprobar sanitize(spokenText)==spokenText → gate → chunk_text
                               si no hay spokenText → camino heredado sin cambios (reemplazos es, sanitize, años fr, chunk)
```

### 3.1 Archivos nuevos (voxcpm-pod)

```
pods/voxcpm-pod/src/utils/speech/
  __init__.py      # normalize(), gate(), SPEECH_VERSION = "speech-1"
  common.py        # roman_to_int, parseo de números con separadores por locale, utilidades de tokens
  es.py en.py fr.py de.py it.py   # reglas por idioma; cada uno expone normalize(text, ctx) -> str
  gate.py          # check(text, lang) -> list[Violation]
  lexicon/{es,en,fr,de,it}.json   # respelling de nombres problemáticos (vacíos al inicio)
pods/voxcpm-pod/scripts/speech-normalize.py     # CLI por lotes (ver 3.2)
pods/voxcpm-pod/scripts/test-speech-normalize.py  # pruebas doradas + corpus
```

Añadir `num2words==0.5.14` a `pods/voxcpm-pod/requirements.txt` y a
`requirements-nano.txt` si el venv de render lo usa. Instalarlo con
`pods/voxcpm-pod/.venv/bin/pip install num2words==0.5.14`; hoy **no** está instalado.
Es Python 3.10, compatible.

El módulo `re` de Python no admite `\p{Lu}`. Usar clases explícitas
(`[A-ZÀ-ÖØ-Þ]`) o el paquete `regex`, que ya está en el venv pero no en los
requirements: si se usa, fijarlo con su versión instalada.

### 3.2 Contratos

```python
# speech/__init__.py
SPEECH_VERSION = "speech-1"   # subir en cada cambio de reglas o léxico

@dataclass
class Violation:
    kind: Literal["DIGIT","ROMAN","ABBR","SYMBOL","BRACKET","URL"]
    match: str
    start: int
    end: int
    sentence_index: int

@dataclass
class NormalizationResult:
    spoken: str
    changes: list[tuple[str, str]]   # (original, hablado) en orden
    violations: list[Violation]      # gate(spoken) tras normalizar

def normalize(text: str, lang: str, country_code: str | None = None) -> NormalizationResult: ...
def gate(text: str, lang: str, allow: Sequence[str] = ()) -> list[Violation]: ...
```

CLI (JSON por stdin y stdout, para usar desde Node y Python):

```
.venv/bin/python scripts/speech-normalize.py --lang es --country ES < pieces.json > speech.json
  entrada:  {"pieces":[{"pieceId":"...","text":"..."}]}
  salida:   {"speechVersion":"speech-1","pieces":[{"pieceId":"...","spokenText":"...","changes":[[a,b],...],"violations":[...]}]}
.venv/bin/python scripts/speech-normalize.py --check --lang es < speech.json   # código 1 si hay violaciones
```

### 3.3 Integración en `prepare_input` (`tour_audio_input.py:67-143`)

Nuevo orden por pieza. Se apoya en la función única `prepare_piece_text` de
[01](01-fase0-backend-base.md) §3.5:

1. Validación de id y CRLF→LF (como hoy).
2. `singleNewlineParagraphs` (como hoy).
3. **Si la pieza trae `spokenText`:**
   1. comprobar que `sanitize_text(spokenText) == spokenText` (si no, error `SPEECH_NOT_CLEAN`);
   2. **`speech.gate`**: con violaciones, lanzar `ValueError("SPEECH_GATE", stop_id, violations)`;
   3. no aplicar `textReplacements` ni años franceses.
4. **Si no la trae** (camino heredado): exactamente los pasos actuales (`:131-138`), sin la puerta, para no romper renders antiguos ni pruebas.
5. `chunk_text(360)` (como hoy).

`sanitize_text` se corrige **solo en lo que no altera el camino heredado de forma
visible**. Las sustituciones inglesas (`sanitize.py:17-20`) y el borrado de `\d+[.)]`
(`:39`) **no se ejecutan en `normalize`**, que tiene su propia limpieza. En el camino
heredado se dejan como están: tocarlas cambiaría el texto sintetizado de audios ya
publicados sin regenerarlos. El bug se documenta y deja de afectar en cuanto todas las
piezas tengan `spokenText`, tras [04](04-regeneracion-y-publicacion.md).

Además:

- `presets/*.json` **no se modifican** (§2.5).
- El sidecar (`render-tour.py:240-276`) añade `speechVersion` y `speechSource: "provided" | "legacy"`. `spokenText` ya existe.
- `AudioRenderInput` (`LocalVoxCpmRenderer.ts:8-12`): ampliar `stops[]` a `{ id, text, spokenText? }` y pasarlo a `input.json`. El límite de 40 piezas por trabajo está en `tour_audio_input.py:72-73` y `TourAudioService.ts:100`.

## 4. Reglas por idioma

Las reglas solo se aplican con **contexto suficiente**. Lo ambiguo se deja para que lo
marque la puerta y lo resuelva la reparación (§6). Todos los ejemplos de abajo son
**casos de prueba obligatorios** (salida exacta).

### 4.0 Salida verificada de num2words 0.5.14

| | 1876 | 1876 `to='year'` | 14 ordinal | 15800 | 2014 `to='year'` |
|---|---|---|---|---|---|
| es | mil ochocientos setenta y seis | igual | décimo cuarto | quince mil ochocientos | dos mil catorce |
| fr | mille huit cent soixante-seize | igual | quatorzième | quinze mille huit cents | deux mille quatorze |
| de | eintausendachthundertsechsundsiebzig | **achtzehnhundertsechsundsiebzig** | vierzehnte | fünfzehntausendachthundert | zweitausendvierzehn |
| it | milleottocentosettantasei | igual | quattordicesimo | quindicimilaottocento | duemilaquattordici |
| en | one thousand, eight hundred and seventy-six | **eighteen seventy-six** | fourteenth | fifteen thousand, eight hundred | twenty fourteen |

Consecuencias:

- En de y en se usa `to='year'` para años.
- En en hay que quitar de la salida las comas **y** el «and» («one hundred and forty-eight» → «one hundred forty-eight»).
- `to='year'` en inglés no cubre bien los años 1001–1009 («1005» da «one thousand and five»): escribir esa regla a mano («ten oh five»).
- En español los decimales usan «coma», no «punto» como devuelve num2words: el decimal se implementa a mano.

### 4.1 Detección común (`common.py`)

- **Año:** entero de 3 o 4 cifras entre 100 y 2100, sin separador de millares, en contexto temporal:
  - precedido de preposición o artículo temporal (es: en, de, desde, hasta, hacia, entre, año, el, del; fr: en, de, depuis, vers, jusqu'en, l'an; de: im, seit, bis, um, ab, Jahr, von; it: nel, dal, al, del, fino al, verso il, intorno al, anno; en: in, since, until, by, from, around, c.);
  - o dentro de una fecha («6 de abril de 1392»);
  - o al inicio de frase seguido de coma.

  - **Regla por defecto:** un entero de 4 cifras entre 1100 y 2099, sin separador y sin contexto, se trata como **año** (en estos textos casi siempre lo es), **salvo** que vaya seguido de una unidad o de un sustantivo contable de una lista por idioma (`metros`, `Meter`, `tubos`, `canne`, `personas`, `Einwohner`…). En ese caso se lee como cardinal.
  - En es, fr e it el año y el cardinal suenan igual, así que la distinción solo cambia el resultado en de y en («1691» → «sechzehnhunderteinundneunzig», pero «1665 Meter» → «eintausendsechshundertfünfundsechzig Meter»).
- **Rango:** `A[-–—]B`, con años o números.
  - es: «de A a B»; tras «entre»: «A y B»; tras «de» o «desde»: «A a B».
  - fr: «de A à B»; en: «A to B»; de: «A bis B»; it: «dal A al B». Si ya hay preposición delante, solo se sustituye el guion.
- **Millares:**
  - es/it/de: `\d{1,3}(\.\d{3})+`
  - fr: `\d{1,3}([   ]\d{3})+` (espacio, espacio duro o espacio fino)
  - en: `\d{1,3}(,\d{3})+`

  No confundir con años (4 cifras sin separador) ni con decimales (es/fr/it/de usan coma decimal; en, punto).
- **Romanos:** `roman_to_int` valida la forma canónica (`M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})`, no vacía).
  - Solo se convierten en contexto de siglo o tras un nombre de gobernante o papa.
  - Lista inicial de nombres en §4.7. El ejecutor la amplía extrayendo del snapshot todos los pares `Nombre + romano` y revisándolos.
- **Paréntesis:** `(x)` pasa a `, x,` porque, en el modo de clonación controlable, un trozo que empieza por `(` se interpreta como instrucción de estilo. Corchetes y llaves se eliminan, como ya hace `sanitize`.
- **Porcentaje** `45 %` / `45%`: número + «por ciento» / «pour cent» / «Prozent» / «per cento» / «percent».
- **Unidades:** `km`, `m`, `m²`, `cm`, `kg`, `ha` tras número, con la palabra del idioma y en plural si el número es distinto de 1.

### 4.2 Español (`es.py`)

| Entrada | Salida |
|---|---|
| en 1876 | en mil ochocientos setenta y seis |
| el 6 de abril de 1392 | el seis de abril de mil trescientos noventa y dos |
| el 1 de mayo | el uno de mayo |
| siglo XIV | siglo catorce |
| siglos XIII y XIV | siglos trece y catorce |
| siglos XIII, XIV y XV | siglos trece, catorce y quince |
| siglo I a. C. | siglo primero antes de Cristo |
| siglo X | siglo diez |
| s. XV | siglo quince |
| Jaime I | Jaime primero |
| Felipe II | Felipe segundo |
| Alfonso X | Alfonso décimo |
| Alfonso XIII | Alfonso trece |
| Luis XIV | Luis catorce |
| 1657-1658 | mil seiscientos cincuenta y siete a mil seiscientos cincuenta y ocho |
| entre 1392 y 1398 | entre mil trescientos noventa y dos y mil trescientos noventa y ocho |
| 15.800 tubos | quince mil ochocientos tubos |
| 200 personas | doscientas personas |
| 21 torres | veintiuna torres |
| 1 iglesia | una iglesia |
| 3,5 km | tres coma cinco kilómetros |
| 52 m | cincuenta y dos metros |
| 45 % | cuarenta y cinco por ciento |
| 150.º aniversario | ciento cincuenta aniversario |
| 1.º / 2.ª | primero / segunda |
| n.º 31 / número 31 | número treinta y uno |
| c. 1450 / ca. 1450 | hacia mil cuatrocientos cincuenta |
| a. C. / d. C. | antes de Cristo / después de Cristo |
| los años 20 | los años veinte |
| St. Sebald (tour en DE/AT/CH) | Sankt Sebald |
| St. Michel (tour en FR/BE) | Saint Michel |

Reglas específicas:

- **Siglos:** cardinal, salvo el I, que es «primero».
- **Ordinales de gobernantes y papas:** del I al X se dicen como ordinal; a partir del XI, como cardinal.
- **Concordancia de género:**
  - Afecta a los números terminados en 1 (`un`/`una`, `veintiún`/`veintiuna`) y a las centenas (`-ientos`/`-ientas`).
  - Se aplica si la palabra siguiente es femenina según esta heurística: termina en `-a`, `-as`, `-ión`, `-iones`, `-dad`, `-dades`, `-tud`, o está en una lista de femeninos frecuentes como «torres», «personas», «obras» o «piezas»; excepciones masculinas en `-a`: «día», «mapa», «planeta», «tema».
  - Si la palabra siguiente es desconocida y el número termina en 1 o es una centena, **no** se adivina: queda como residuo.
- **Años:** nunca concuerdan.

### 4.3 Inglés (`en.py`)

| Entrada | Salida |
|---|---|
| in 1876 | in eighteen seventy-six |
| in 1900 / 2000 / 2014 / 1005 | in nineteen hundred / two thousand / twenty fourteen / ten oh five |
| the 1870s / mid-1860s | the eighteen seventies / mid eighteen sixties |
| October 15, 1813 | October fifteenth, eighteen thirteen |
| 15 October 1813 | the fifteenth of October, eighteen thirteen |
| Louis XIV | Louis the Fourteenth |
| Napoleon I | Napoleon the First |
| World War II | World War Two |
| Pope Pius IX | Pope Pius the Ninth |
| the 8th century | the eighth century |
| 148 B.C. / A.D. 30 | one hundred forty-eight B C / A D thirty |
| 1657-1658 | sixteen fifty-seven to sixteen fifty-eight |
| 15,800 | fifteen thousand eight hundred |
| 45% | forty-five percent |
| 15th USAAF | Fifteenth U S A A F |
| St. Sebald | Saint Sebald |

- La salida de num2words lleva comas («fifteen thousand, eight hundred»): eliminarlas.
- La «I» suelta **no** se trata como romano salvo tras un nombre de gobernante de la lista, para no confundirla con el pronombre.

### 4.4 Francés (`fr.py`)

| Entrada | Salida |
|---|---|
| en 1776 | en mille sept cent soixante-seize |
| XIXe siècle / XIXᵉ siècle | dix-neuvième siècle |
| Ier siècle | premier siècle |
| Louis XIV / Napoléon III | Louis quatorze / Napoléon trois |
| François Ier | François premier |
| VIIIe siècle av. J.-C. | huitième siècle avant Jésus-Christ |
| apr. J.-C. | après Jésus-Christ |
| 15 800 tuyaux | quinze mille huit cents tuyaux |
| 45 % | quarante-cinq pour cent |
| le 2e régiment | le deuxième régiment |
| le 1er mai | le premier mai |
| de 1855 à 1856 / 1855-1856 | de mille huit cent cinquante-cinq à mille huit cent cinquante-six |
| St / Ste | Saint / Sainte |
| n° 28 | numéro vingt-huit |

Conservar los casos de prueba actuales de `_expand_french_years` (`test-tour-audio-input.py:43-96`).

### 4.5 Alemán (`de.py`)

| Entrada | Salida |
|---|---|
| 1691 | sechzehnhunderteinundneunzig |
| 2014 | zweitausendvierzehn |
| im 19. Jahrhundert | im neunzehnten Jahrhundert |
| das 19. Jahrhundert | das neunzehnte Jahrhundert |
| Ende des 16. Jahrhunderts | Ende des sechzehnten Jahrhunderts |
| seit dem 25. März 1994 | seit dem fünfundzwanzigsten März neunzehnhundertvierundneunzig |
| am 3. Juni | am dritten Juni |
| im 8. Jahrhundert v. Chr. | im achten Jahrhundert vor Christus |
| n. Chr. | nach Christus |
| 1.665 Meter | eintausendsechshundertfünfundsechzig Meter |
| 45 % | fünfundvierzig Prozent |
| St. Sebald | Sankt Sebald |
| z. B. / bzw. / Nr. 5 / ca. 1450 | zum Beispiel / beziehungsweise / Nummer fünf / circa vierzehnhundertfünfzig |

Reglas específicas:

- **Ordinal ante `Jahrhundert`/mes:**
  - Tras im, am, vom, zum, beim, dem, den, des, einem, eines: `-ten`.
  - Tras der, die, das, ein (nominativo): `-te`/`-ter`.
  - Sin artículo: residuo.
- **Gobernantes** (`Ludwig XIV.`, `Karl V.`, `Wilhelm II.`):
  - Tras unter, mit, von, bei, zu, nach, aus, seit: `dem Vierzehnten`.
  - Genitivo sajón («Ludwigs XIV.»): `des Vierzehnten`.
  - Tras für, durch, gegen, ohne, um: `den Vierzehnten`.
  - En cualquier otro caso: **residuo**, sin adivinar la declinación.
- **Cuidado:** el punto del ordinal alemán («XIV.», «19.») no es fin de frase. El normalizador corre **antes** de `chunk_text`, que separa frases por `[.!?]\s+`.

### 4.6 Italiano (`it.py`)

| Entrada | Salida |
|---|---|
| nel 1298 | nel milleduecentonovantotto |
| XIX secolo / secolo XIX | diciannovesimo secolo / secolo diciannovesimo |
| Luigi XIV / Vittorio Emanuele II | Luigi quattordicesimo / Vittorio Emanuele secondo |
| 148 a.C. / 30 d.C. | centoquarantotto avanti Cristo / trenta dopo Cristo |
| il 4 febbraio 1957 | il quattro febbraio millenovecentocinquantasette |
| il 1° maggio | il primo maggio |
| 15.800 canne | quindicimilaottocento canne |
| 45% | quarantacinque per cento |
| anni '60 | anni sessanta |
| 1657-1658 | dal milleseicentocinquantasette al milleseicentocinquantotto |
| S. Maria | Santa Maria |

«Nel XVIII» suelto, sin «secolo» («Nel XVIII, la città…»), también es un siglo en
italiano: se convierte a «Nel diciottesimo» solo si el romano está entre XI y XXI y va
precedido de nel/dal/al/del. En cualquier otro caso es residuo.

### 4.7 Nombres de gobernantes y papas (lista inicial)

`Luis, Louis, Luigi, Ludwig, Carlos, Charles, Carlo, Karl, Felipe, Philippe, Filippo, Philipp, Philip, Fernando, Ferdinand, Ferdinando, Jaime, Jacques, Giacomo, Jakob, James, Pedro, Pierre, Pietro, Peter, Alfonso, Alphonse, Enrique, Henri, Enrico, Heinrich, Henry, Federico, Frédéric, Friedrich, Frederick, Napoleón, Napoléon, Napoleone, Napoleon, Guillermo, Guillaume, Guglielmo, Wilhelm, William, Juan, Jean, Giovanni, Johann, John, Pío, Pie, Pio, Pius, León, Léon, Leone, Leo, Benedicto, Benoît, Benedetto, Benedikt, Benedict, Clemente, Clément, Clemens, Clement, Gregorio, Grégoire, Gregor, Gregory, Inocencio, Innocent, Innocenzo, Innozenz, Urbano, Urbain, Urban, Sixto, Sixte, Sisto, Sixtus, Ruggero, Roger, Cosimo, Cosme, Emanuele, Manuel, Vittorio, Victor, Umberto, Humbert, Otto, Otón, Ottone, Maximiliano, Maximilien, Massimiliano, Maximilian, Francisco, François, Francesco, Franz, Francis, Isabel, Isabelle, Isabella, Elisabeth, Elizabeth, Ricardo, Richard, Riccardo, Eduardo, Édouard, Edoardo, Eduard, Edward, Ramiro, Sancho, Martín, Martin, Martino, Bonifacio, Boniface, Bonifatius, Paulo, Paul, Paolo, Paulus, Alejandro, Alexandre, Alessandro, Alexander, Rodolfo, Rodolphe, Rudolf, Mastino, Cangrande, Lorenzo, Federigo, Ranieri, Guglielmo, Corrado, Konrad, Conrad, Lotario, Lothaire, Lothar, Berengario, Bérenger, Ugo, Hugues, Teodorico, Pepino, Pépin, Pipino, Pippin, Lambert, Clodoveo, Clovis, Childeberto, Childebert, Dagoberto, Dagobert, Sigismondo, Sigismund, Mattia, Matthias, Leopoldo, Léopold, Leopold, Gustavo, Gustave, Gustav, Cristiano, Christian, Federica, Margarita, Marguerite, Margherita, Margarete, Juana, Jeanne, Giovanna, Johanna, María, Marie, Maria, Mary, Ana, Anne, Anna, Catalina, Catherine, Caterina, Katharina, Victoria, Vittoria, Viktoria`

A propósito no se incluye «War». «World War II» es una regla aparte del inglés y su
equivalente en los demás idiomas («Segunda Guerra Mundial» ya va en letra).

## 5. Puerta (`gate.py`)

Una violación bloquea el render. Se evalúa sobre el texto que se va a sintetizar.

| Tipo | Patrón | Notas |
|---|---|---|
| DIGIT | `\d` | Sin excepciones. |
| ROMAN | token `\b[IVXLCDM]{2,}\b` que pase `roman_to_int`; además `«Nombre de §4.7» I\b` | Lista blanca por pieza (`allow`) para siglas legítimas («MIDI», «CIVIC»). |
| ABBR | es: `a\. ?C\.`, `d\. ?C\.`, `s\. `, `St\.`, `Sta\.`, `n\.º`, `nº`, `ca\.`, `c\. (?=\d)`; fr: `av\. J\.-C\.`, `apr\. J\.-C\.`, `St\b`, `Ste\b`, `n°`; de: `v\. Chr\.`, `n\. Chr\.`, `z\. ?B\.`, `bzw\.`, `Nr\.`, `St\.`, `Str\.`, `ca\.`; it: `a\.C\.`, `d\.C\.`, `S\. (?=[A-ZÀ-ÖØ-Þ])`; en: `B\.C\.`, `A\.D\.`, `St\.`, `c\. (?=\d)` | Ampliable. |
| SYMBOL | `%`, `°`, `º`, `ª`, `€`, `$`, `&`, `#`, `/` entre letras, `§` | |
| BRACKET | `(`, `)`, `[`, `]`, `{`, `}` | Por el modo de clonación con `(stylePrompt)`. |
| URL | `https?://`, `www\.` | |

**Avisos** (no bloquean, van al informe): siglas de 2 o más mayúsculas («USAAF»,
«UNESCO»). Sirven para alimentar el léxico tras la escucha o el control con Whisper.

## 6. Reparación LLM de residuos

Solo se aplica si, tras `normalize`, `gate` devuelve violaciones. Se espera que afecte
a ≤3 % de las piezas; si son más, revisar las reglas antes de gastar.

- **Proveedor:** DeepSeek, con el cliente existente `backend/scripts/admin/editorial_runtime/client.py` y el mismo registro de gasto. **Requiere autorización del usuario** (facturable).
- **Entrada:** solo las frases con violación, con su índice y el idioma.
- **Prompt (borrador):**

  > Reescribe estas frases en {idioma} exactamente como debe leerlas en voz alta un guía. Cambia SOLO las expresiones marcadas entre ⟦ ⟧ (números, fechas, números romanos, abreviaturas o símbolos). Escribe todo en letras. No cambies ninguna otra palabra, ni el orden, ni la puntuación. Si un número romano forma parte del nombre de un rey o papa, usa la forma que se diría en {idioma}, con la declinación correcta. Devuelve JSON: `[{"i": <índice>, "spoken": "<frase completa>"}]`.

- **Guarda determinista:**
  - Enmascarar en el original los tramos marcados.
  - Comprobar que la frase devuelta, sin los tramos sustituidos, conserva **idénticas** las palabras y la puntuación de alrededor (comparación token a token).
  - Comprobar que `gate(spoken) == []`.
- **Reintentos:** hasta 2. Si sigue fallando, la pieza pasa a `needs_manual` con su informe. El lote continúa con las demás y una pieza en `needs_manual` impide publicar **su tour**.
- **Registro:** cada reparación se guarda en `speech/<tourId>.json` → `pieces[].llmRepairs[] = {before, after, model, at}`.

## 7. Persistencia y servicios (backend)

1. **Una sola migración Prisma aditiva para todo el plan**, cuyo responsable es este paquete. Nombre: `<timestamp>_spoken_text_cues_legs`. Incluye también los modelos de [03](03-paradas-sin-orden.md) §5.1 y §7, para no encadenar migraciones que choquen:
   - `Place.spokenText String? @map("spoken_text")`
   - `Tour.introductionSpokenText String? @map("introduction_spoken_text")`
   - `TourCueAudio` y `TourWalkingLegs` (contratos en 03), con sus relaciones inversas en `Tour` (`cueAudios TourCueAudio[]` y `walkingLegs TourWalkingLegs?`), que Prisma exige.
   - Despliegue: `prisma generate` + `prisma migrate deploy` con `/etc/tour-guide/migration.env`, y `GRANT SELECT` a `nomuvia_app` sobre las tablas nuevas (ver [04](04-regeneracion-y-publicacion.md) §10.2).
2. **Repositorio:** `backend/src/infrastructure/postgres/PostgresTourRepository.ts` lee y escribe los campos nuevos. Las entidades `backend/src/domain/entities/Place.ts` y `Tour` los exponen como opcionales, **convirtiendo `null` en `undefined`**.
3. **`backend/src/services/TourAudioService.ts` `snapshot()` (`:69-111`).** Cada parada pasa a llevar dos textos:
   - `spoken`, usado para el hash y el render: `place.spokenText ?? <texto actual>`;
   - `display`, para `transcripts`: el texto actual, idéntico byte a byte al de hoy.

   Detalles:
   - **Parada 0 sin introducción separada** (`:94-98`, `split` falso): `display` sigue siendo «aviso + introducción + descripción», como hoy. `spoken` usa `spokenText` solo si **todas** las piezas implicadas lo tienen; si no, es igual a `display`.
   - **`firstHash`** (`:91`): hoy calcula el hash de `places[0].description`. Pasa a `hash(lang + rendererKey + spoken de la parada 0 con split)`, es decir, `places[0].spokenText ?? places[0].description.trim()`. **Si no se cambia, la introducción se desactiva** al regenerar y la parada 0 absorbe la introducción.
   - **`introductionHash`** (`:88`): calculado sobre `aviso + '\n\n' + (introductionSpokenText ?? introduction.trim())`.
   - **`introduction.text`** (público, `:106-108`): sigue siendo el texto de **pantalla** (`introductionText` actual).
   - **`hashes`** (`:103`): se calculan sobre `spoken`.
   - **`transcripts`** (`:156`): se calculan sobre `display`. Hoy usan `stop.text`, que es la entrada del hash; con este cambio siguen dando lo mismo para lo heredado y nunca publican `spokenText`.
4. **El aviso de voz IA** (`AudioProvenance.ts`, `audioDisclosure`) también pasa por la puerta cuando la pieza tiene `spokenText`. Revisar que no lleve cifras.
5. **`backend/src/services/PilotRelease.ts` `pilotFingerprint()` (`:75-91`).**
   - **Riesgo:** la huella es un `JSON.stringify` en el que `null` se serializa y `undefined` desaparece. Añadir un campo nuevo sin más **cambia la huella de los 216 tours** al desplegar y todos dejan de servirse.
   - **Regla:** cada campo nuevo se añade **solo si tiene valor**, con el mismo patrón que `catalogTitle` en `:81`. Por ejemplo, `...(place.spokenText ? { spokenText: place.spokenText } : {})`. Lo mismo para `introductionSpokenText` y, en 03, para `cues`, `walkingLegsSha256` y `orderFlexible`.
   - **Prueba de regresión obligatoria:**
     - tomar un tour real publicado, su estado de audio y su `pilotRelease.fingerprint` guardado;
     - montarlo como fixture desde un `pg_dump` local o la exportación de [04](04-regeneracion-y-publicacion.md) §4;
     - comprobar que el código nuevo produce **byte a byte** la misma huella.
6. **No exponer `spokenText` en la API pública.** Ni `presentPilotTour`, ni `transcripts`, ni `introduction.text` lo incluyen.

## 8. Tours nuevos (pipeline de lote)

1. `deepseek-batch-text.py`: tras escribir `final/<lang>.json`, ejecutar la CLI y guardar `final/<lang>.speech.json` (`{speechVersion, pieces:[{pieceId, spokenText, changes, llmRepairs, violations}]}`), con reparación LLM de residuos si procede. Un recibo de fase (`phase_receipts.py`) liga ese archivo al hash de `final/<lang>.json`.
2. `deepseek-europe-audio.cjs` y `translate-europe-audio.cjs` pasan `spokenText` en `input.json`. Ojo: el id de audio europeo depende del texto (`uuid(runId|slug|pieceId|text)`) y debe pasar a depender de `spokenText`.
3. Cambiar el prompt de traducción (`deepseek-batch-text.py:492,524`) a: «conserva las cifras y los números tal como aparecen en el original». El texto de pantalla lleva cifras.
4. **Decisión pendiente del usuario, no activar por defecto:** inyectar la regla editorial de fechas (`NARRATIVE_TEMPORAL_RULE=selected`) para reducir la carga de años. La parada del Palau de la Generalitat de Valencia tiene unas 19 fechas en 2.500 caracteres. En su prueba anterior no superó la aceptación editorial (`docs/tours/ejecucion-regla-fechas-deepseek-20260916.md`). Proponerlo con una prueba A/B de escucha, no aplicarlo.

## 9. Control de calidad con Whisper (recomendado, no bloqueante)

- Tras el render, transcribir una muestra con faster-whisper: por idioma, el 5 % de las piezas y todas las que tengan reparación LLM o avisos de siglas.
- Hay base reutilizable en `output/voxcpm2-emocion-20260920/verify.py:38-66` (faster-whisper small, CPU).
- Comparar `normalize(transcripción)` con `spokenText`, normalizando **ambos lados**, porque Whisper escribe cifras y romanos (`docs/operations/voxcpm2-voice-a-paragraphs-20260906.md:44`).
- Si el WER de una pieza supera 0,15, va a la cola de escucha humana y su informe propone entradas de léxico.
- Informe: `resultados/02-texto-hablado.md` (en esta carpeta).

## 10. Pruebas

Cómo ejecutarlas:

```
cd pods/voxcpm-pod
.venv/bin/python scripts/test-speech-normalize.py     # nuevo
.venv/bin/python scripts/test-tour-audio-input.py     # actualizar
.venv/bin/python scripts/test-sanitize.py             # actualizar
```

1. **Doradas:** todas las filas de las tablas de §4, con salida exacta y como mínimo 25 por idioma. Incluir casos que **no** deben cambiar: «Via Roma 3» queda como residuo, «I» pronombre, decimales en IDs.
2. **Idempotencia:** `normalize(normalize(x).spoken).spoken == normalize(x).spoken`.
3. **Puerta:** cada tipo de violación tiene un caso positivo y uno negativo.
4. **Corpus**, sin depender de [04](04-regeneracion-y-publicacion.md):
   - descargarlo de la API pública (`GET https://nomuvia.com/api/backend/tours?limit=50&offset=N` y `GET …/tours/:id`, sin SSH) con un script `pods/voxcpm-pod/scripts/fetch-public-corpus.py` que escriba en un directorio temporal, **no en el repo**;
   - pasar las 1.869 piezas (1.653 paradas + 216 introducciones);
   - informar por idioma de cuántas quedan limpias y cuántos residuos hay, por tipo.

   **Objetivo:** ≥97 % limpias sin LLM.
5. **`test-tour-audio-input.py`:** las pruebas actuales del camino heredado (`:32-41` reemplazos es, `:43-96` años fr y `:157-167` identidad en/de/it) **siguen pasando sin cambios**. Se añaden pruebas del camino con `spokenText`:
   - la puerta bloquea;
   - `SPEECH_NOT_CLEAN`;
   - no se aplican reemplazos ni años franceses.
6. **Normalizador:** su limpieza no produce «meters», «kilometers», «Saint» ni «Avenue» en textos es/it/de/fr (el bug de `sanitize.py:17-20` no se reproduce).
7. **Backend:**
   - pruebas de `TourAudioService`: el hash usa `spokenText` cuando existe; `firstHash` lo usa; `transcripts` e `introduction.text` siguen siendo de pantalla;
   - con datos heredados, los hashes, transcripts y versiones son idénticos a los de antes del cambio;
   - prueba de regresión de la huella (§7.5).

## 11. Criterios de aceptación

- [ ] `speech.normalize` + `gate` implementados para es/en/fr/de/it, con las pruebas doradas en verde.
- [ ] El bug de `sanitize.py:17-20` no afecta a ninguna pieza con `spokenText`, con prueba.
- [ ] `prepare_input` aplica la puerta a toda pieza con `spokenText`. Las piezas heredadas producen el mismo texto que hoy.
- [ ] Migración Prisma única aplicada en local. `TourAudioService` y `pilotFingerprint` actualizados, con las pruebas de regresión de huella y hashes en verde.
- [ ] Ningún preset de `pods/voxcpm-pod/presets/` modificado.
- [ ] Informe de corpus con ≥97 % de piezas limpias sin LLM. El resto queda reparado o en `needs_manual`.
- [ ] Muestra de escucha validada por el usuario: 1 tour por idioma con al menos 10 fechas o romanos.
- [ ] Informe en `resultados/02-texto-hablado.md`.

## 12. Riesgos

- **Errores silenciosos del normalizador** (género, declinación): mitigados por la política de no adivinar, que manda lo dudoso a residuo, y por Whisper y la escucha de muestra.
- **Cambio de preset:** invalidaría todas las identidades de ese idioma y sacaría sus tours de la API. Por eso está prohibido (§2.5).
- **Nombres extranjeros** leídos con la voz del idioma del tour (por ejemplo «palais du Louvre» con voz española): fuera de alcance. El léxico permite corregirlos caso a caso.
