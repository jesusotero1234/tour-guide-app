import { Place } from '../../domain/entities/Place';

export interface TourNarrativeStopPlan {
  position: number;
  placeName: string;
  role: string;
  openingArchetype: string;
  transitionPurpose: string;
}

export interface TourNarrativePlan {
  promise: string;
  centralQuestion: string;
  narrativeArc: string;
  introductionBrief: string;
  stopRoles: TourNarrativeStopPlan[];
  closingResolution: string;
}

export interface TourTextAudit {
  passed: boolean;
  score: number;
  reasons: string[];
  affectedStopPositions: number[];
  repeatedPhrases: string[];
  repeatedOpenings: string[];
  repeatedConcepts: string[];
}

const OPENING_ARCHETYPES = [
  'visible-detail',
  'historical-scene',
  'contrast',
  'human-anecdote',
  'urban-scale',
  'specific-question',
  'threshold-and-arrival',
];

const GUIDE_CONNECTORS: Record<string, string[]> = {
  es: ['fíjate', 'observa', 'mira', 'imagina', 'si miras'],
  en: ['notice', 'look at', 'imagine'],
  fr: ['remarque', 'observez', 'regarde'],
  de: ['schau', 'beachte'],
  it: ['osserva', 'guarda', 'immagina'],
};

const REPEATED_ABSTRACTIONS = [
  'capas', 'transformación', 'identidad', 'memoria', 'estructura urbana',
  'layers', 'transformation', 'identity', 'memory', 'urban fabric',
  'couches', 'transformation', 'identité', 'mémoire',
  'schichten', 'verwandlung', 'identität', 'erinnerung',
  'strati', 'trasformazione', 'identità', 'memoria',
];

const WELCOME_PATTERNS: Record<string, RegExp> = {
  es: /\bbienvenid[oa]s?\b/gi,
  en: /\bwelcome\b/gi,
  fr: /\bbienvenue\b/gi,
  de: /\bwillkommen\b/gi,
  it: /\bbenvenut[oi]\b/gi,
};

const STOP_WORDS = new Set([
  'a', 'al', 'and', 'con', 'da', 'das', 'de', 'del', 'der', 'di', 'die', 'do',
  'el', 'en', 'et', 'for', 'für', 'il', 'in', 'la', 'le', 'les', 'los', 'of',
  'on', 'para', 'por', 'the', 'to', 'un', 'una', 'und', 'von', 'y',
]);

function languageCode(language: string): string {
  return language.slice(0, 2).toLowerCase();
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

function firstSentence(text: string): string {
  return text.split(/[.!?]/, 1)[0]?.trim() || text.trim();
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length;
}

function buildSpanishPlan(city: string, theme: string, placeNames: string[]): TourNarrativePlan {
  const isHistory = theme.toLowerCase() === 'history';
  const promise = isHistory
    ? `recorrer cómo ${city} pasó de sus primeros centros de poder a la ciudad que reconocemos hoy`
    : `aprender a leer ${city} a través de ${theme}`;
  const centralQuestion = isHistory
    ? `¿Cómo fue cambiando ${city} sin borrar por completo las ciudades que existieron antes?`
    : `¿Qué detalles permiten entender ${city} desde ${theme}?`;
  const genericRoles = [
    'presentar el punto de partida y la tensión central',
    'mostrar el origen o la base histórica',
    'explicar una institución o cambio de poder',
    'conectar el lugar con la vida cotidiana',
    'mostrar una transformación urbana concreta',
    'ampliar la historia hacia la ciudad moderna',
    'resolver la pregunta del recorrido',
  ];
  return {
    promise,
    centralQuestion,
    narrativeArc: `Del origen del recorrido a una respuesta progresiva sobre ${city}.`,
    introductionBrief: `Dar la bienvenida una sola vez, situar al visitante y prometer ${promise}.`,
    stopRoles: placeNames.map((placeName, position) => {
      const roleIndex = position === 0
        ? 0
        : position === placeNames.length - 1
          ? genericRoles.length - 1
          : 1 + ((position - 1) % (genericRoles.length - 2));
      return {
        position,
        placeName,
        role: `${genericRoles[roleIndex]}: ${placeName}`,
        openingArchetype: `${OPENING_ARCHETYPES[position % OPENING_ARCHETYPES.length]}: ${placeName}`,
        transitionPurpose: position === placeNames.length - 1
          ? 'cerrar el recorrido y resolver su pregunta'
          : `conectar esta idea con ${placeNames[position + 1]}`,
      };
    }),
    closingResolution: `Responder con ejemplos concretos a: ${centralQuestion}`,
  };
}

export function buildTourNarrativePlan(params: {
  city: string;
  theme: string;
  language: string;
  placeNames: string[];
}): TourNarrativePlan {
  const code = languageCode(params.language);
  if (code === 'es') return buildSpanishPlan(params.city, params.theme, params.placeNames);

  const localized = code === 'fr'
    ? {
      promise: `découvrir comment lire ${params.city} à travers le thème ${params.theme}`,
      question: `Qu'est-ce qui relie ces lieux en une seule histoire de ${params.city} ?`,
      arc: `Passer d'une question initiale à une réponse concrète sur ${params.city}.`,
      roles: ['poser la question du parcours', 'montrer une origine concrète', 'expliquer un changement de pouvoir', 'relier le lieu à la vie quotidienne', 'montrer une transformation urbaine', 'ouvrir le récit sur la ville moderne', 'résoudre la question du parcours'],
      close: 'conclure le parcours',
      connect: 'relier cette idée à',
    }
    : code === 'de'
      ? {
        promise: `${params.city} anhand des Themas ${params.theme} zu lesen`,
        question: `Was verbindet diese Orte zu einer Geschichte über ${params.city}?`,
        arc: `Von einer Ausgangsfrage zu einer konkreten Antwort über ${params.city}.`,
        roles: ['die Leitfrage einführen', 'einen konkreten Ursprung zeigen', 'einen Machtwechsel erklären', 'den Ort mit dem Alltag verbinden', 'einen städtischen Wandel zeigen', 'die Geschichte zur modernen Stadt öffnen', 'die Leitfrage beantworten'],
        close: 'den Rundgang abschließen',
        connect: 'diese Idee verbinden mit',
      }
      : code === 'it'
        ? {
          promise: `leggere ${params.city} attraverso il tema ${params.theme}`,
          question: `Che cosa unisce questi luoghi in un unico racconto su ${params.city}?`,
          arc: `Da una domanda iniziale a una risposta concreta su ${params.city}.`,
          roles: ['porre la domanda del percorso', 'mostrare un’origine concreta', 'spiegare un cambiamento di potere', 'collegare il luogo alla vita quotidiana', 'mostrare una trasformazione urbana', 'aprire il racconto verso la città moderna', 'risolvere la domanda del percorso'],
          close: 'concludere il percorso',
          connect: 'collegare questa idea a',
        }
        : {
          promise: `discover how ${params.city} can be read through ${params.theme}`,
          question: `What connects these places into one story about ${params.city}?`,
          arc: `Move from an opening question to a concrete answer about ${params.city}.`,
          roles: ['establish the tour question', 'show a concrete origin', 'explain a shift in power', 'connect the place to daily life', 'show an urban transformation', 'open the story toward the modern city', 'resolve the tour question'],
          close: 'close the tour',
          connect: 'connect this idea to',
        };
  const promise = localized.promise;
  const centralQuestion = localized.question;
  return {
    promise,
    centralQuestion,
    narrativeArc: localized.arc,
    introductionBrief: `Welcome the visitor once, orient them, and promise to ${promise}.`,
    stopRoles: params.placeNames.map((placeName, position) => {
      const roleIndex = position === 0
        ? 0
        : position === params.placeNames.length - 1
          ? localized.roles.length - 1
          : 1 + ((position - 1) % (localized.roles.length - 2));
      return {
        position,
        placeName,
        role: `${localized.roles[roleIndex]}: ${placeName}`,
        openingArchetype: `${OPENING_ARCHETYPES[position % OPENING_ARCHETYPES.length]}: ${placeName}`,
        transitionPurpose: position === params.placeNames.length - 1
          ? localized.close
          : `${localized.connect} ${params.placeNames[position + 1]}`,
      };
    }),
    closingResolution: `Answer: ${centralQuestion}`,
  };
}

export function buildTourIntroduction(params: {
  city: string;
  theme: string;
  language: string;
  durationMinutes: number;
  firstStopName: string;
  plan: TourNarrativePlan;
}): string {
  const code = languageCode(params.language);
  if (code === 'es') {
    return `Bienvenido a este recorrido por ${params.city}. Durante aproximadamente ${params.durationMinutes} minutos vamos a ${params.plan.promise}. Empezamos en ${params.firstStopName}, pero la intención no es encadenar monumentos como una lista: en cada parada buscaremos una pista distinta y algo concreto que puedas observar desde donde estás. La pregunta que nos acompañará es sencilla: ${params.plan.centralQuestion} Avanza a tu ritmo, detente cuando algún detalle te llame la atención y deja que cada lugar complete una parte de la respuesta.`;
  }
  if (code === 'fr') {
    return `Bienvenue dans cette visite de ${params.city}. Pendant environ ${params.durationMinutes} minutes, nous allons ${params.plan.promise}. Nous commençons à ${params.firstStopName}, mais le but n'est pas d'enchaîner les monuments comme une simple liste. À chaque étape, nous chercherons un indice différent, une histoire propre à ce lieu et un détail concret que vous pourrez observer autour de vous. Une question nous accompagnera tout au long du parcours : ${params.plan.centralQuestion} Avancez à votre rythme, prenez le temps de regarder et laissez chaque lieu compléter une partie de la réponse.`;
  }
  if (code === 'de') {
    return `Willkommen zu diesem Rundgang durch ${params.city}. In ungefähr ${params.durationMinutes} Minuten werden wir versuchen, ${params.plan.promise}. Wir beginnen bei ${params.firstStopName}, doch dieser Weg soll keine bloße Liste von Sehenswürdigkeiten sein. An jeder Station suchen wir einen eigenen Hinweis, eine ortsspezifische Geschichte und ein konkretes Detail, das du direkt vor dir erkennen kannst. Achte unterwegs auch darauf, wie sich Maßstab, Material und Nutzung von Ort zu Ort verändern. Eine Frage begleitet den ganzen Weg: ${params.plan.centralQuestion} Gehe in deinem eigenen Tempo, nimm dir Zeit zum Schauen und lass jeden Ort einen Teil der Antwort ergänzen.`;
  }
  if (code === 'it') {
    return `Benvenuto in questo percorso attraverso ${params.city}. Per circa ${params.durationMinutes} minuti proveremo a ${params.plan.promise}. Cominciamo da ${params.firstStopName}, ma l'obiettivo non è mettere in fila i monumenti come in un semplice elenco. In ogni tappa cercheremo un indizio diverso, una storia specifica del luogo e un dettaglio concreto che puoi osservare da dove ti trovi. Una domanda ci accompagnerà lungo tutto il cammino: ${params.plan.centralQuestion} Procedi con il tuo ritmo, fermati quando qualcosa attira la tua attenzione e lascia che ogni luogo completi una parte della risposta.`;
  }
  return `Welcome to this walk through ${params.city}. Over roughly ${params.durationMinutes} minutes, we will ${params.plan.promise}. We begin at ${params.firstStopName}, but the idea is not to move through a simple checklist of landmarks. At every stop we will look for a different clue, a story that belongs to that place, and one concrete detail you can notice from where you stand. One question will stay with us throughout the route: ${params.plan.centralQuestion} Walk at your own pace, pause when something catches your attention, and let each place add one part of the answer.`;
}

export function auditTourText(params: {
  introduction: string;
  language: string;
  places: Array<Pick<Place, 'id' | 'position' | 'name' | 'description' | 'metadata'>>;
}): TourTextAudit {
  const reasons = new Set<string>();
  const affected = new Set<number>();
  const repeatedPhrases = new Set<string>();
  const repeatedOpenings = new Set<string>();
  const repeatedConcepts = new Set<string>();
  const welcomePattern = WELCOME_PATTERNS[languageCode(params.language)] || WELCOME_PATTERNS.en;
  const guideConnectors = GUIDE_CONNECTORS[languageCode(params.language)] || GUIDE_CONNECTORS.en;

  if (countMatches(params.introduction, welcomePattern) !== 1) reasons.add('introduction_welcome_count');
  const introWords = words(params.introduction).length;
  if (introWords < 100 || introWords > 150) reasons.add('introduction_word_count');

  const phraseOwners = new Map<string, number>();
  const openingOwners = new Map<string, number>();
  const conceptOwners = new Map<string, Set<number>>();
  const connectorTotals = new Map<string, number>();

  params.places.forEach((place) => {
    const text = place.description || '';
    const normalizedText = normalize(text);
    const stopWords = words(text);

    if (countMatches(text, welcomePattern) > 0) {
      reasons.add('welcome_outside_introduction');
      affected.add(place.position);
    }
    if (stopWords.length < 160) {
      reasons.add('stop_too_short');
      affected.add(place.position);
    }
    if (stopWords.length > 420) {
      reasons.add('stop_too_long');
      affected.add(place.position);
    }

    const narrationMeta = place.metadata?.narrationMeta;
    const claimCheck = narrationMeta?.claimCheck as { criticalFailCount?: number; verifiedRate?: number } | undefined;
    if (narrationMeta?.fallback || narrationMeta?.replacedWeakNarration === true || Number(narrationMeta?.sectionsFallbacked || 0) > 0) {
      reasons.add('fallback_stop');
      affected.add(place.position);
    }
    if ((claimCheck?.criticalFailCount || 0) > 0) {
      reasons.add('critical_claim');
      affected.add(place.position);
    }
    if (typeof claimCheck?.verifiedRate === 'number' && claimCheck.verifiedRate < 0.8) {
      reasons.add('verified_claim_rate');
      affected.add(place.position);
    }

    const opening = words(firstSentence(text)).slice(0, 5).join(' ');
    const openingOwner = openingOwners.get(opening);
    if (opening.length > 0 && openingOwner !== undefined) {
      repeatedOpenings.add(opening);
      affected.add(place.position);
    } else if (opening.length > 0) {
      openingOwners.set(opening, place.position);
    }

    for (let index = 0; index <= stopWords.length - 7; index += 1) {
      const phraseWords = stopWords.slice(index, index + 7);
      if (phraseWords.filter((word) => !STOP_WORDS.has(word)).length < 4) continue;
      const phrase = phraseWords.join(' ');
      const owner = phraseOwners.get(phrase);
      if (owner !== undefined && owner !== place.position) {
        repeatedPhrases.add(phrase);
        affected.add(place.position);
      } else {
        phraseOwners.set(phrase, place.position);
      }
    }

    for (const connector of guideConnectors) {
      const count = normalizedText.match(new RegExp(`\\b${normalize(connector).replace(/\s+/g, '\\s+')}\\b`, 'g'))?.length || 0;
      if (count > 1) {
        reasons.add(`connector_repeated_in_stop:${connector}`);
        affected.add(place.position);
      }
      connectorTotals.set(connector, (connectorTotals.get(connector) || 0) + count);
    }

    for (const concept of REPEATED_ABSTRACTIONS) {
      if (!normalizedText.includes(normalize(concept))) continue;
      const owners = conceptOwners.get(concept) || new Set<number>();
      owners.add(place.position);
      conceptOwners.set(concept, owners);
    }
  });

  if (repeatedPhrases.size > 0) reasons.add('repeated_cross_stop_phrase');
  if (repeatedOpenings.size > 0) reasons.add('repeated_opening');
  for (const [connector, count] of connectorTotals) {
    if (count > 2) reasons.add(`connector_over_tour_quota:${connector}`);
  }
  for (const [concept, owners] of conceptOwners) {
    if (owners.size <= 2) continue;
    repeatedConcepts.add(concept);
    [...owners].sort((a, b) => a - b).slice(2).forEach((owner) => affected.add(owner));
  }
  if (repeatedConcepts.size > 0) reasons.add('repeated_abstract_framing');

  const score = Math.max(0, 100
    - (reasons.size * 8)
    - (repeatedPhrases.size * 2)
    - (repeatedOpenings.size * 5)
    - (repeatedConcepts.size * 4));

  return {
    passed: reasons.size === 0 && score >= 80,
    score,
    reasons: [...reasons],
    affectedStopPositions: [...affected].sort((a, b) => a - b),
    repeatedPhrases: [...repeatedPhrases].slice(0, 20),
    repeatedOpenings: [...repeatedOpenings],
    repeatedConcepts: [...repeatedConcepts],
  };
}
