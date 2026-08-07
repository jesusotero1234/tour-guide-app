import assert from 'assert';
import { fallbackSection } from '../src/routes/narrativeFallback';
import {
  extractArchitects,
  guardSectionsAgainstSources,
  hasConstructionDateConflict,
  repairSectionSurfaceIssue,
  validateNarrativeClaims,
  validateSection,
} from '../src/routes/narrativeLong';
import { LongNarrativePromptInput } from '../src/prompts/narrative/types';
import { buildNarrativeBrief, buildRouteQuestion, describeStopRole, formatBriefForPrompt } from '../src/prompts/narrative/narrativeBrief';
import { arrivalPrompt } from '../src/prompts/narrative/arrival';
import { historyPrompt } from '../src/prompts/narrative/history';
import { significancePrompt } from '../src/prompts/narrative/significance';
import { transitionPrompt } from '../src/prompts/narrative/transition';

const input: LongNarrativePromptInput = {
  localName: 'Palais de la musique catalane',
  cityName: 'Barcelone',
  nextStopName: 'Cathédrale de Barcelone',
  theme: 'histoire',
  language: 'fr',
  position: 'middle',
  stopIndex: 3,
  totalStops: 8,
  previousStopName: 'Sainte-Marie-de-la-Mer',
  tourStopNames: [
    'Arc de Triomphe',
    'Sagrada Família',
    'Sainte-Marie-de-la-Mer',
    'Palais de la musique catalane',
    'Cathédrale de Barcelone',
    'Casa Batlló',
    'La Pedrera',
    'Place de Catalogne',
  ],
  seedQuality: 'rich',
  targetWords: '70 to 90',
  seeds: {
    wikipediaLead: 'Le palais se trouve dans le quartier Saint-Pierre de Barcelone.',
    wikipediaBody: "L'œuvre de Lluís Domènech i Montaner fut construite de 1905 à 1908. Elle fut inscrite au patrimoine mondial en 1997.",
    wikidataClaims: {
      architect: 'Lluís Domènech i Montaner',
      inception: '1908',
      locatedIn: 'Saint-Pierre',
      architecturalStyle: 'modernisme catalan',
    },
    osmTags: { tourism: 'attraction' },
  },
};

const brief = buildNarrativeBrief(input);
const briefText = formatBriefForPrompt(brief);
assert.match(describeStopRole(input), /contrast and transformation/);
assert.match(buildRouteQuestion(input), /reinvented public life/);
assert.doesNotMatch(buildRouteQuestion(input), /Barcelona/);
assert.strictEqual(brief.routeContext.stopNumber, 4);
assert.strictEqual(brief.routeContext.previousStop, 'Sainte-Marie-de-la-Mer');
assert.match(briefText, /Whole route: Arc de Triomphe -> Sagrada Família/);
assert.match(briefText, /Shared route question:/);
assert.match(briefText, /This stop's handoff:/);
const significanceBriefText = formatBriefForPrompt(brief, 'significance');
assert.match(significanceBriefText, /significance:/);
assert.doesNotMatch(significanceBriefText, /arrival:/);
assert.doesNotMatch(significanceBriefText, /history:/);
assert.match(arrivalPrompt(input).user, /make the visitor feel physically present/i);
assert.match(arrivalPrompt(input).user, /stable observations/i);
assert.match(arrivalPrompt(input).user, /cardinal directions/i);
assert.match(historyPrompt(input).user, /one historical change, choice, or human tension/i);
assert.match(historyPrompt(input).user, /Exact years present in the supplied source: 1905, 1908, 1997/);
assert.match(significancePrompt(input).user, /interpret the consequence/i);
assert.match(significancePrompt(input).user, /NEW CONTRIBUTION TEST/i);
assert.match(transitionPrompt(input).user, /next thought in a live conversation/i);
assert.match(transitionPrompt(input).user, /no route geometry was provided/i);
assert.match(transitionPrompt({ ...input, narrativeBriefText: briefText }).user, /Shared route question:/);
const openingStylePattern = /Required opening style|Style d'ouverture requis/i;
assert.match(arrivalPrompt(input).system, openingStylePattern);
assert.doesNotMatch(historyPrompt(input).system, openingStylePattern);
assert.doesNotMatch(significancePrompt(input).system, openingStylePattern);
assert.doesNotMatch(transitionPrompt(input).system, openingStylePattern);
assert.doesNotMatch(arrivalPrompt(input).system, /PHRASES INTERDITES/i);
assert.match(arrivalPrompt({ ...input, retry: true }).system, /PHRASES INTERDITES/i);

const spokenInput = {
  ...input,
  previousSectionsText: 'La façade introduit un contraste entre la rue médiévale et le projet moderniste.',
};
assert.match(historyPrompt(spokenInput).user, /WHAT THE VISITOR HAS JUST HEARD/);
assert.match(significancePrompt(spokenInput).user, /WHAT THE VISITOR HAS ALREADY HEARD/);
assert.match(transitionPrompt(spokenInput).user, /What the guide has just said/);

for (const section of ['arrival', 'history', 'significance', 'transition'] as const) {
  const text = fallbackSection(section, input, 'test');
  assert(!/You've arrived|From here|\bes un\b/i.test(text), `${section} leaked another language: ${text}`);
}
assert(fallbackSection('history', input, 'test').includes('Lluís Domènech i Montaner'));

assert.deepStrictEqual(
  extractArchitects("Conçu par l’architecte Rudy Ricciotti en 1997."),
  ['Rudy Ricciotti']
);
assert.deepStrictEqual(extractArchitects('La façade est signée par Rafael Moneo.'), ['Rafael Moneo']);
assert.deepStrictEqual(extractArchitects('Le bâtiment est conçu par Richard Meier. Ce projet transforme le quartier.'), ['Richard Meier']);
assert.deepStrictEqual(extractArchitects('El reloj de José Rodríguez de Losada organiza la vida diaria de la plaza.'), []);
assert.deepStrictEqual(extractArchitects('La ciudad de Madrid transforma este fragmento en memoria pública.'), []);
assert.deepStrictEqual(extractArchitects('El edificio fue diseñado por Juan de Villanueva.'), ['Juan de Villanueva']);
assert.strictEqual(validateSection(
  "La nef gothique prolonge une église romane plus ancienne et montre comment plusieurs campagnes de construction peuvent coexister dans un même monument. Cette superposition donne au visiteur une lecture concrète de la continuité urbaine, religieuse et architecturale du quartier au fil des siècles, encore visible autour de nous aujourd'hui.",
  { ...input, seeds: { ...input.seeds, wikipediaBody: 'La cathédrale gothique remplace une ancienne église romane.', wikidataClaims: {} } },
  'history'
), null);
assert.deepStrictEqual(extractArchitects('Designed by Richard Meier.'), ['Richard Meier']);
assert.deepStrictEqual(extractArchitects("Progettato dall'architetto Renzo Piano."), ['Renzo Piano']);

const medievalInput: LongNarrativePromptInput = {
  ...input,
  localName: 'Sainte-Marie-de-la-Mer',
  seeds: {
    ...input.seeds,
    wikipediaBody: 'La basilique fut construite entre 1329 et 1383.',
    wikidataClaims: { inception: '1329-00-00' },
  },
};
assert.strictEqual(
  hasConstructionDateConflict('Construite au début du 20e siècle, elle accompagne la croissance moderne.', medievalInput),
  'construction-date-conflict:20e-siècle:expected-1329'
);
assert.strictEqual(
  hasConstructionDateConflict('Construite au XIVe siècle, elle appartient au monde médiéval.', medievalInput),
  null
);

const shortTransition = "Quittons maintenant ce monument pour poursuivre vers la prochaine étape. Le parcours change de rythme, mais le thème historique continue de relier les lieux devant nous.";
assert.strictEqual(validateSection(shortTransition, input, 'transition'), null);
const falseProximity = "La ville change de rythme autour de ce monument et le thème historique prend une nouvelle direction. La prochaine étape se trouve juste à côté : laissez cette idée vous accompagner vers la cathédrale, où un autre chapitre du parcours pourra commencer.";
assert.strictEqual(validateSection(falseProximity, input, 'transition'), 'unsupported-proximity');
const falseDirection = "La ville change de rythme autour de ce monument et le thème historique prend une nouvelle direction. Laissez cette idée vous accompagner vers l'ouest, où la cathédrale ouvre un autre chapitre du parcours et révèle une nouvelle relation entre héritage religieux et vie publique.";
assert.strictEqual(validateSection(falseDirection, input, 'transition'), 'unsupported-route-geometry');
const spanishNumberInput: LongNarrativePromptInput = {
  ...input,
  localName: 'Palacio Real de Madrid',
  cityName: 'Madrid',
  language: 'es',
  seeds: {
    ...input.seeds,
    wikipediaBody: 'El Palacio Real de Madrid tiene 3.418 habitaciones y conserva un uso ceremonial vinculado a la vida pública del Estado.',
    wikidataClaims: {},
  },
};
const thousandsSeparatorText = "Al dejar atrás la plaza, fíjate en cómo el palacio concentra una escala casi difícil de imaginar. Sus 3.418 habitaciones no son un simple dato de tamaño: ayudan a entender la maquinaria ceremonial de la monarquía, la relación entre representación pública y vida urbana, y la forma en que Madrid convierte el poder en espacio visible.";
assert.strictEqual(validateSection(thousandsSeparatorText, spanishNumberInput, 'significance'), null);
const coordinatePairText = "En este punto, la narración no debe convertirse en ficha técnica. Aunque el mapa pueda guardar datos como 40.4168, -3.7038, una guía humana debe traducir la ubicación en orientación sensible, relación urbana y contexto histórico para que la visita mantenga ritmo natural, claro y cercano durante toda la parada.";
assert.strictEqual(validateSection(coordinatePairText, spanishNumberInput, 'history'), 'coordinates');
const repeatedEnglishOpening = "Have you ever wondered how this palace became part of the city's public memory? Look at the stone base and the way the building holds the street edge, because those visible details help connect political ambition, urban design, and the visitor's first physical impression of the stop.";
assert.match(validateSection(repeatedEnglishOpening, { ...input, language: 'en' }, 'arrival') || '', /^banned-cliche:/);
const unstableArrival = "Le palais brille sous le soleil de Barcelone tandis que sa façade attire immédiatement le regard. Les volumes du bâtiment structurent la rue et offrent un point de départ clair pour observer la relation entre ce lieu culturel, les constructions voisines et l'histoire urbaine qui accompagne notre parcours.";
assert.strictEqual(validateSection(unstableArrival, input, 'arrival'), 'unstable-observation');
assert.match(validateSection(shortTransition, input, 'history') || '', /^word-count-/);
const sourceLanguageDrift = "La cathédrale se développe sur une basílica paleocristiana, puis devient un centre religieux majeur. Cette évolution permet de comprendre comment le quartier s'est organisé autour du monument et comment la ville a conservé plusieurs couches de son histoire dans un même lieu. Le parcours révèle ainsi une continuité urbaine encore visible aujourd'hui.";
assert.strictEqual(validateSection(sourceLanguageDrift, input, 'history'), 'source-language-drift');
assert.strictEqual(validateSection(sourceLanguageDrift.replace('basílica paleocristiana', 'basílica gòtica'), input, 'history'), 'source-language-drift');
assert.doesNotMatch(repairSectionSurfaceIssue(sourceLanguageDrift, 'source-language-drift', input), /basílica|paleocristiana/i);
const visualRepairSource = "La Casa Milà se distingue par sa façade ondulante et par le débat urbain provoqué lors de sa construction. Une ombre spectaculaire traverse aujourd'hui les balcons. Le projet d'Antoni Gaudí remet en cause les conventions de son époque et permet de comprendre comment Barcelone a intégré une architecture expérimentale dans un quartier soumis à des règles précises.";
assert.doesNotMatch(repairSectionSurfaceIssue(visualRepairSource, 'unsupported-visual:ombre', input), /ombre/i);
const dateRepairSource = "Le théâtre devient un lieu de rencontre pour la bourgeoisie barcelonaise. Il ouvre ses portes en 1847 après une longue campagne privée. Son financement par des actionnaires, plutôt que par la monarchie, change la place de la culture dans la vie publique et révèle une initiative civique nouvelle.";
assert.doesNotMatch(repairSectionSurfaceIssue(dateRepairSource, 'unverified-date:1847', input), /1847/);
const clicheRepairSource = "Ce bâtiment raconte une histoire concrète de la ville et relie la musique aux transformations de la vie publique. Son financement collectif montre comment une institution culturelle peut devenir un point de rencontre durable sans perdre le lien avec le quartier qui l'entoure.";
assert.doesNotMatch(repairSectionSurfaceIssue(clicheRepairSource, 'banned-cliche:raconte une histoire', input), /raconte une histoire/i);
const spanishDriftSource = "La Casa Batlló, con su fachada revestida de vidrio, es una obra maestría. Remarquez ensuite comment la transformation commandée par Josep Batlló traduit l'ascension d'une bourgeoisie industrielle. Le projet utilise l'architecture pour affirmer un statut nouveau et change durablement la lecture de cette avenue barcelonaise.";
assert.doesNotMatch(repairSectionSurfaceIssue(spanishDriftSource, 'source-language-drift', input), /con su|obra maestría|vidrio/i);
const architectRepairSource = "Le musée devient une institution publique majeure après plusieurs décennies de débat. Sa façade est signée par Rafael Moneo et affirme une rupture avec les bâtiments environnants. Le projet transforme la place de l'art contemporain dans la ville et ouvre un espace durable de discussion culturelle.";
assert.doesNotMatch(repairSectionSurfaceIssue(architectRepairSource, 'unverified-architect:Rafael Moneo', input), /Rafael Moneo/i);
const seventyOneWordClosing = "Merci d’avoir parcouru Barcelone avec moi. Devant ce dernier édifice, gardez en mémoire les contrastes rencontrés : la pierre médiévale, l’audace moderniste, les lieux de musique, de foi, d’art et de soin. Ensemble, ils racontent une ville qui transforme chaque époque sans effacer la précédente. En reprenant votre chemin, observez comment cette histoire continue dans les rues, les façades et la vie quotidienne autour de vous. Merci pour votre attention curieuse.";
assert.strictEqual(validateSection(seventyOneWordClosing, { ...input, position: 'last' }, 'transition'), null);
assert.match(validateSection(seventyOneWordClosing, input, 'transition') || '', /^word-count-71$/);

const guarded = guardSectionsAgainstSources({
  history: "Le palais fut construit de 1905 à 1908 par Lluís Domènech i Montaner.",
  transition: "Construit en 1997 par l’architecte Rudy Ricciotti, ce bâtiment moderne se trouve à Montjuïc.",
}, input);

assert.strictEqual(guarded.sections.history.includes('1905'), true);
assert.strictEqual(guarded.sections.transition.includes('Rudy Ricciotti'), false);
assert.strictEqual(guarded.sections.transition.includes('Cathédrale de Barcelone'), true);
assert.strictEqual(guarded.reasons.length, 1);

const styleWarningOnly = guardSectionsAgainstSources({
  significance: "Le palais associe une structure moderniste à une inspiration gothique qui accompagne le passage entre tradition et innovation. Cette lecture stylistique donne au visiteur un fil concret pour comprendre comment l'édifice s'inscrit dans l'évolution culturelle et urbaine de Barcelone.",
}, input);
assert.strictEqual(styleWarningOnly.reasons.length, 0);
assert.match(styleWarningOnly.sections.significance, /inspiration gothique/);
const styleClaimCheck = validateNarrativeClaims(
  "Cette façade baroque contraste avec l'architecture environnante et propose une lecture différente de l'histoire urbaine.",
  input
);
assert.strictEqual(styleClaimCheck.criticalFailCount, 0);
assert.strictEqual(styleClaimCheck.warningCount > 0, true);

console.log('Narrative quality validation passed.');
