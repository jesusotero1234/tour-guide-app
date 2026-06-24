# Multi-city tour quality audit — no audio

Date: 2026-06-24  
Scope: frozen fixture replay, no audio, no images, no UI changes.  
Model path: local `llm-pod` using `gemma4:26b`.

## Executive result

The system now passes the 80/100 target across the five tested city/language
pairs. Madrid/es, the main product-like case, reached 86.5/100. All five tours
have zero critical contradictions, zero generated fallbacks, full `claimCheck`
coverage and duration inside the 85%-115% gate.

That is good enough to continue, and strong enough to say the Barcelona fix was
not only a Barcelona/French hack. It is not yet enough to call the product
release-ready without another pass on route canonicality and narrative
repetition. The tours are now usable; the next battle is making them feel less
templated and more like a human guide with taste.

## What was implemented for this run

- Captured reusable source snapshots from existing fixture candidates, avoiding
  repeated Wikipedia/Wikidata calls during iteration.
- Regenerated tours from frozen fixtures without audio or images.
- Kept the changes general: no city-specific hacks for Madrid, Paris, Berlin,
  Roma or Barcelona.
- Let duration repair extend compact long tours with extra good nearby stops,
  instead of forcing a short route to pass.
- Tightened narrative validation so normal decimal facts like "3.418 rooms" do
  not look like coordinate leaks, while real coordinate pairs are still blocked.
- Reduced false factual fallbacks in Spanish/German by avoiding over-broad
  architect extraction.
- Banned weak English opening clichés such as "Have you ever wondered" and
  "Rumour has it".

## Source snapshots

| Snapshot | Wikidata payloads | Wikipedia payloads | Notes |
|---|---:|---:|---|
| `barcelona-history-fr.json` | 40 | 40 | Existing reference snapshot |
| `madrid-history-es.json` | 40 | 40 | Main product-like case |
| `paris-history-en.json` | 40 | 40 | English generalization case |
| `berlin-history-de.json` | 40 | 40 | German generalization case |
| `roma-history-it.json` | 40 | 39 | One candidate had no usable Wikipedia payload |

## Formal rubric results

| Tour | Stops | Score | Duration | Verified claims | Anchor coverage | Fallbacks | Critical contradictions | Publishable |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Barcelona / fr | 11 | 85.1 | 95% | 80.0% | 71.4% | 0 | 0 | Yes |
| Madrid / es | 12 | 86.5 | 99% | 100.0% | 75.0% | 0 | 0 | Yes |
| Paris / en | 13 | 82.3 | 96% | 100.0% | 62.5% | 0 | 0 | Yes |
| Berlin / de | 12 | 89.0 | 94% | 100.0% | 100.0% | 0 | 0 | Yes |
| Roma / it | 13 | 80.4 | 97% | 84.6% | 71.4% | 0 | 0 | Yes |

Success criteria:

- Good to continue: Madrid/es reaches 80+ → yes, 86.5.
- Good to trust the system: 4 of 5 languages reach 80+ → yes, 5 of 5.
- Good to aspire to release: all tested languages reach 80+ with no critical
  failures → technically yes, but the human review below still flags route
  canonicality and repetition as release risks.

## Human review

| Tour | Feels like a guide? | Would I pay? | Repetition | Route sense | Text density |
|---|---|---|---|---|---|
| Barcelona / fr | Yes, now it has a beginning and ending. | Yes for a self-guided tour. | Some repeated "réinventer/transformer/couches". | Coherent modernist/civic arc. | Fine: 3,052 words total, 277 per stop. |
| Madrid / es | Yes, strongest Spanish product case so far. | Yes. | Moderate repetition of "transformación/capas". | Coherent cultural-history route, though missing Plaza Mayor/Almudena hurts. | Fine: 3,251 words total, 271 per stop. |
| Paris / en | Mostly yes, but more institutional than magical. | Borderline yes. | Some repeated "layers/identity/transformation". | Works, but misses Notre-Dame, Sainte-Chapelle and Arc de Triomphe for a canonical first Paris history tour. | Fine: 3,666 words total, 282 per stop. |
| Berlin / de | Yes, probably the best tour in the batch. | Yes. | Some "Schichten/Wandel", but acceptable. | Strong historical logic, slightly Museum Island-heavy at the start. | Fine: 3,326 words total, 277 per stop. |
| Roma / it | Yes, but less premium than Berlin/Madrid. | Yes only at a low/moderate self-guided price. | Too much "trasformare/trasformazioni" and "secoli/strati". | Walkable and coherent to Vatican, but no Colosseum/Forum Romanum is a serious product gap. | Fine: 3,524 words total, 271 per stop. |

## Route samples

### Madrid / es

Route:
Museo del Prado → Museo Nacional Centro de Arte Reina Sofía → Museo Nacional de
Antropología → Palacio de Cristal del Retiro → Puerta de Alcalá → Museo
Arqueológico Nacional → Puerta del Sol → Monasterio de las Descalzas Reales →
Real Monasterio de la Encarnación → plaza de Oriente → Palacio Real de Madrid →
Templo de Debod.

Good sample:

> Busca la marca en el suelo que señala el kilómetro cero de las carreteras
> radiales, instalado aquí desde 1950.

Human note: this is finally guide-like. It points the user to something visible,
uses local context and avoids the old generic fallback voice. I would pay for
this Madrid tour. The main product concern is route taste: Plaza Mayor and
Almudena are absent.

### Paris / en

Route:
Eiffel Tower → Musée du quai Branly → Musée d'art moderne de Paris → Grand
Palais → Petit Palais → Élysée Palace → La Madeleine → Palais Garnier →
Palais-Royal → Louvre Museum → Louvre Palace → arc de triomphe du Carrousel →
Musée d'Orsay.

Good sample:

> Look closely at the intricate lattice of wrought iron stretching toward the
> sky.

Weakness: the tour is coherent, but the route feels like a monuments/institutions
axis more than a first-choice Paris history walk. A paying tourist may expect
Notre-Dame, Sainte-Chapelle, the Latin Quarter or Arc de Triomphe depending on
the route promise.

### Berlin / de

Route:
Pergamonmuseum → Museumsinsel → Neues Museum → Alte Nationalgalerie → Berliner
Dom → Hackesche Höfe → Neue Synagoge → Deutscher Dom → Bundesrat → Denkmal für
die ermordeten Juden Europas → Sowjetisches Ehrenmal mit Soldatenfigur → Neue
Nationalgalerie.

Good sample:

> Tritt einen Moment näher an die Fassade der Oranienburger Straße heran.

Human note: this is the strongest tour of the set. It has historical gravity and
the route builds from museum/civic memory into twentieth-century rupture and
modernism. The only real issue is that the opening cluster is a bit dense around
Museum Island.

### Roma / it

Route:
Pantheon → Piazza Navona → Campo de' Fiori → Teatro di Marcello → Musei
Capitolini → Colonna di Foca → Vittoriano → Foro di Traiano → Ara Pacis →
Castel Sant'Angelo → cappella Sistina → basilica di San Pietro → Città del
Vaticano.

Good sample:

> Fermati un istante e osserva le imponenti colonne che sorreggono questo
> portico.

Weakness: Roma passes the rubric, but it is the weakest pass. The absence of the
Colosseum and Forum Romanum is conspicuous for a history tour. The route is still
sellable as a Pantheon-to-Vatican historical walk, but not as the default Rome
history product.

### Barcelona / fr

Route:
palais de la musique catalane → cathédrale Sainte-Eulalie de Barcelone → église
Sainte-Marie-de-la-Mer de Barcelone → La Rambla → Grand théâtre du Liceu → musée
d'art contemporain de Barcelone → place de Catalogne → Casa Batlló → Casa Milà
→ Sagrada Família → hôpital de Sant Pau.

Good sample:

> Loin de l'opulence du Liceu, vous arrivez maintenant dans le quartier d'El
> Raval.

Human note: stable after restart and still publishable. The main remaining smell
is stylistic: some stops lean on the same ideas of transformation, identity and
historic layers too often.

## Repetition smell

This is not a hard gate yet, but it matches the subjective feeling that the
tours sometimes sound like the same guide thesis repeated in every city.

| Tour | Transformation-family terms | Identity terms | Layer/era-family terms |
|---|---:|---:|---:|
| Barcelona / fr | 18 | 1 | 21 |
| Madrid / es | 28 | 2 | 35 |
| Paris / en | 16 | 7 | 31 |
| Berlin / de | 14 | 4 | 55 |
| Roma / it | 36 | 2 | 48 |

Interpretation: the rubric now catches factual and structural failure, but it
does not yet fully penalize repeated conceptual scaffolding. Roma exposes this
best: it passes at 80.4, while the prose still overuses the same transformation
frame.

## What I would do next to reach 85-90 reliably

1. Add a route-canonicality score to route selection, not only audit.
   The route builder should prefer expected flagship anchors when they are
   geographically plausible. This is the difference between "technically
   coherent" and "a tourist would not feel cheated".

2. Add a tour-level repetition budget.
   Prompts already ban some phrases, but the system needs a whole-tour pass that
   notices repeated frames across stops: transformation, identity, layers,
   reinvention, continuity.

3. Add stronger visual grounding.
   A guide should point to visible things at the stop. The next evaluator should
   reward concrete visual anchors and penalize unsupported "look at..." claims.

4. Create two route profiles per city/theme.
   Example: "canonical first-time history walk" versus "museum/civic memory
   walk". Paris and Roma are acceptable under narrower promises, but risky under
   a generic "history tour" promise.

5. Run one audio/listening pass after text hits 85+.
   The current batch is reviewed as text. The next commercial check should
   listen to timing, pauses and whether 270-280 words per stop feels natural
   while walking.

## Bottom line

The plan achieved its quality target: 5/5 tested tours are above 80, with no
critical factual failures and no fallbacks. Madrid/es is good enough to keep
building from. Berlin/de is the quality ceiling in this run. Roma/it shows the
next real product problem: not broken generation, but route expectation and
over-repeated narrative framing.
