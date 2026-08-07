import { LongNarrativePromptInput } from '../prompts/narrative/types';

export type NarrativeSectionName = 'arrival' | 'history' | 'significance' | 'transition';

type SupportedLanguage = 'de' | 'en' | 'es' | 'fr' | 'it';

const COPY: Record<SupportedLanguage, {
  built: string;
  architect: string;
  style: string;
  heritage: string;
  located: string;
  observe: string;
  history: string;
  significance: string;
  transition: string;
  finalTransition: string;
}> = {
  es: {
    built: 'construido en', architect: 'obra de', style: 'de estilo', heritage: 'protegido como',
    located: 'se encuentra en', observe: 'Observa el edificio y su relación con el entorno inmediato.',
    history: 'forma parte de la historia urbana de', significance: 'Esta parada ayuda a entender el tema del recorrido:',
    transition: 'Desde aquí, continúa hacia', finalTransition: 'Aquí termina el recorrido. Conserva esta última imagen de la ciudad.',
  },
  fr: {
    built: 'construit en', architect: 'œuvre de', style: 'de style', heritage: 'classé comme',
    located: 'se trouve à', observe: 'Observez le bâtiment et sa relation avec son environnement immédiat.',
    history: "fait partie de l'histoire urbaine de", significance: 'Cette étape éclaire le thème du parcours :',
    transition: 'Depuis ici, poursuivez vers', finalTransition: 'Le parcours se termine ici. Gardez en mémoire cette dernière image de la ville.',
  },
  de: {
    built: 'erbaut im Jahr', architect: 'ein Werk von', style: 'im Stil', heritage: 'geschützt als',
    located: 'befindet sich in', observe: 'Betrachten Sie das Gebäude und seine Beziehung zur unmittelbaren Umgebung.',
    history: 'gehört zur Stadtgeschichte von', significance: 'Diese Station verdeutlicht das Thema des Rundgangs:',
    transition: 'Gehen Sie von hier weiter zu', finalTransition: 'Hier endet der Rundgang. Behalten Sie dieses letzte Bild der Stadt in Erinnerung.',
  },
  it: {
    built: 'costruito nel', architect: 'opera di', style: 'in stile', heritage: 'tutelato come',
    located: 'si trova a', observe: "Osserva l'edificio e il suo rapporto con l'ambiente circostante.",
    history: 'fa parte della storia urbana di', significance: 'Questa tappa aiuta a comprendere il tema del percorso:',
    transition: 'Da qui, prosegui verso', finalTransition: "Il percorso termina qui. Conserva quest'ultima immagine della città.",
  },
  en: {
    built: 'built in', architect: 'a work by', style: 'in the', heritage: 'protected as',
    located: 'stands in', observe: 'Notice the building and its relationship with the immediate surroundings.',
    history: "forms part of the urban history of", significance: 'This stop helps explain the tour theme:',
    transition: 'From here, continue toward', finalTransition: 'The tour ends here. Keep this final image of the city with you.',
  },
};

function languageCode(language: string): SupportedLanguage {
  const code = language.slice(0, 2).toLowerCase();
  return code in COPY ? code as SupportedLanguage : 'en';
}

function claim(claims: Record<string, string>, ...keys: string[]): string | undefined {
  const value = keys.map((key) => claims[key]).find(Boolean);
  return value?.replace(/-00-00$/, '');
}

function evidenceParts(input: LongNarrativePromptInput, language: SupportedLanguage): string[] {
  const claims = input.seeds?.wikidataClaims || {};
  const copy = COPY[language];
  const parts: string[] = [];
  const inception = claim(claims, 'inception', 'P571');
  const architect = claim(claims, 'architect', 'P84');
  const style = claim(claims, 'architecturalStyle', 'P149');
  const heritage = claim(claims, 'heritageDesignation', 'P1435');
  const locatedIn = claim(claims, 'locatedIn', 'P131');
  if (inception) parts.push(`${copy.built} ${inception}`);
  if (architect) parts.push(`${copy.architect} ${architect}`);
  if (style) parts.push(`${copy.style} ${style}`);
  if (heritage) parts.push(`${copy.heritage} ${heritage}`);
  if (locatedIn) parts.push(`${copy.located} ${locatedIn}`);
  return parts;
}

export function fallbackSection(
  name: NarrativeSectionName,
  input: LongNarrativePromptInput,
  _reason: string
): string {
  const language = languageCode(input.language || 'en');
  const copy = COPY[language];
  const city = input.cityName || input.localName;
  const evidence = evidenceParts(input, language);
  const joinedEvidence = evidence.length > 1
    ? `${evidence.slice(0, -1).join(', ')} ${language === 'fr' ? 'et' : language === 'es' ? 'y' : language === 'de' ? 'und' : language === 'it' ? 'e' : 'and'} ${evidence[evidence.length - 1]}`
    : evidence[0];
  const factSentence = evidence.length > 0
    ? language === 'fr' ? `Pour replacer ${input.localName} dans l'histoire de ${city}, retenez ces repères : ${joinedEvidence}.`
      : language === 'es' ? `Para situar ${input.localName} en la historia de ${city}, quédate con estas referencias: ${joinedEvidence}.`
      : language === 'de' ? `Um ${input.localName} in die Geschichte von ${city} einzuordnen, helfen diese Eckdaten: ${joinedEvidence}.`
      : language === 'it' ? `Per collocare ${input.localName} nella storia di ${city}, tieni presenti questi riferimenti: ${joinedEvidence}.`
      : `To place ${input.localName} in the history of ${city}, keep these reference points in mind: ${joinedEvidence}.`
    : `${input.localName} ${copy.history} ${city}.`;

  const themeLabels: Record<SupportedLanguage, Record<string, string>> = {
    fr: { history: "l'histoire", architecture: "l'architecture", art: "l'art", food: 'la gastronomie' },
    es: { history: 'la historia', architecture: 'la arquitectura', art: 'el arte', food: 'la gastronomía' },
    de: { history: 'der Geschichte', architecture: 'der Architektur', art: 'der Kunst', food: 'der Gastronomie' },
    it: { history: 'la storia', architecture: "l'architettura", art: "l'arte", food: 'la gastronomia' },
    en: { history: 'history', architecture: 'architecture', art: 'art', food: 'food' },
  };
  const theme = themeLabels[language][input.theme] || input.theme;
  const claims = input.seeds?.wikidataClaims || {};
  const interpretiveAnchor = claim(claims, 'architecturalStyle', 'P149')
    || claim(claims, 'heritageDesignation', 'P1435')
    || claim(claims, 'locatedIn', 'P131');

  const significanceSentence = language === 'fr'
    ? `Dans ce parcours consacré à ${theme}, ${input.localName} montre comment un lieu précis peut rendre l'évolution de ${city} visible${interpretiveAnchor ? `, notamment à travers ${interpretiveAnchor}` : ''}. C'est ce lien avec la ville qui donne tout son sens à cette étape.`
    : language === 'es'
      ? `En este recorrido sobre ${theme}, ${input.localName} permite ver cómo un lugar concreto hace visible la evolución de ${city}${interpretiveAnchor ? `, especialmente a través de ${interpretiveAnchor}` : ''}. Ese vínculo con la ciudad da sentido a esta parada.`
      : language === 'de'
        ? `Auf diesem Rundgang zu ${theme} zeigt ${input.localName}, wie ein einzelner Ort die Entwicklung von ${city} sichtbar macht${interpretiveAnchor ? `, besonders durch ${interpretiveAnchor}` : ''}. Diese Verbindung zur Stadt gibt der Station ihren Sinn.`
        : language === 'it'
          ? `In questo percorso dedicato a ${theme}, ${input.localName} mostra come un luogo preciso renda visibile l'evoluzione di ${city}${interpretiveAnchor ? `, soprattutto attraverso ${interpretiveAnchor}` : ''}. È questo legame con la città a dare senso alla tappa.`
          : `On this ${theme} tour, ${input.localName} shows how one place can make the evolution of ${city} visible${interpretiveAnchor ? `, especially through ${interpretiveAnchor}` : ''}. That connection to the city is what gives this stop its purpose.`;

  switch (name) {
    case 'arrival':
      return `${input.localName} ${copy.located} ${city}. ${copy.observe}`;
    case 'history':
      return factSentence;
    case 'significance':
      return significanceSentence;
    case 'transition':
      if (input.position === 'last') {
        if (language === 'fr') return `Nous terminons ici, devant ${input.localName}. Gardez surtout le fil qui relie les étapes : la manière dont ${city} transforme son histoire en lieux encore présents dans la vie quotidienne.`;
        if (language === 'es') return `Terminamos aquí, ante ${input.localName}. Quédate sobre todo con el hilo que une las paradas: la manera en que ${city} convierte su historia en lugares que siguen vivos en la ciudad cotidiana.`;
        return copy.finalTransition;
      }
      return `${copy.transition} ${input.nextStopName || city}.`;
  }
}
