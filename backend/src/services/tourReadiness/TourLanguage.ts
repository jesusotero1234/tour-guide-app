const TOUR_LOCALES = ['es', 'fr', 'en', 'de', 'it'] as const;
export type TourLocale = typeof TOUR_LOCALES[number];

export function tourLocale(value: string): TourLocale {
  const locale = value.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  const supported = TOUR_LOCALES.find(value => value === locale);
  if (!supported) throw new Error('UNSUPPORTED_TOUR_LANGUAGE');
  return supported;
}

export function enabledTourLanguages(): TourLocale[] {
  return [...TOUR_LOCALES];
}

export const NARRATION_POLICY_VERSION = 'oral-es-fr-provisional-1';
export const RESEARCH_POLICY_VERSION = 'destination-evidence-4-source-use-20260908';
export const NARRATION_RATES = {
  es: { wordsPerMinute: 120, measured: false },
  fr: { wordsPerMinute: 120, measured: false },
  en: { wordsPerMinute: 120, measured: false },
  de: { wordsPerMinute: 120, measured: false },
  it: { wordsPerMinute: 120, measured: false },
} as const;

export function draftIntroduction(city: string, language: string): string {
  return {
    es: 'Descubre la historia de ' + city + ' a lo largo de este recorrido.',
    fr: 'Découvrez l’histoire de ' + city + ' au fil de ce parcours.',
    en: 'Discover the history of ' + city + ' along this route.',
    de: 'Entdecke die Geschichte von ' + city + ' auf diesem Rundgang.',
    it: 'Scopri la storia di ' + city + ' lungo questo percorso.',
  }[tourLocale(language)];
}

export function transferInstruction(nextStop: string, language: string): string {
  return {
    es: 'Desplázate por tu cuenta hasta ' + nextStop + '. El tiempo de este traslado queda fuera de la duración estimada del recorrido. Consulta un servicio de navegación para organizar el trayecto.',
    fr: 'Rejoignez ' + nextStop + ' par vos propres moyens. Le temps de ce déplacement est exclu de la durée estimée du parcours. Consultez un service de navigation pour organiser ce trajet.',
    en: 'Make your own way to ' + nextStop + '. This transfer is not included in the estimated tour duration. Use a navigation service to plan the journey.',
    de: 'Begib dich selbstständig zu ' + nextStop + '. Die Zeit für diesen Transfer ist nicht in der geschätzten Dauer des Rundgangs enthalten. Nutze einen Navigationsdienst, um den Weg zu planen.',
    it: 'Raggiungi ' + nextStop + ' per conto tuo. Il tempo di questo trasferimento è escluso dalla durata stimata del percorso. Consulta un servizio di navigazione per organizzare il tragitto.',
  }[tourLocale(language)];
}

export function outputLanguageInstruction(language: string): string {
  return {
    es: 'Escribe exclusivamente en español oral y natural. Las fuentes y ejemplos pueden estar en otro idioma: conserva sus hechos, incertidumbres y nombres locales útiles, sin copiar su idioma ni añadir hechos. Evita afirmar horarios, precios o condiciones actuales de acceso sin una comprobación específica.',
    fr: 'Écris exclusivement en français naturel, destiné à être écouté. Les sources et exemples peuvent être dans une autre langue : conserve leurs faits, leurs incertitudes et les noms locaux utiles, sans copier leur langue ni ajouter de faits. Évite toute affirmation sur les horaires, les prix ou les conditions actuelles d’accès non vérifiée spécifiquement.',
    en: 'Write exclusively in natural spoken English. Sources and examples may be in another language: preserve their facts, uncertainty and useful local names without copying their language or adding facts. Do not assert current opening hours, prices or access conditions unless specifically verified.',
    de: 'Schreibe ausschließlich in natürlichem, gesprochenem Deutsch. Quellen und Beispiele können in einer anderen Sprache vorliegen: Bewahre ihre Fakten, Unsicherheiten und hilfreichen lokalen Namen, ohne ihre Sprache zu übernehmen oder Fakten hinzuzufügen. Behaupte keine aktuellen Öffnungszeiten, Preise oder Zugangsbedingungen, die nicht eigens überprüft wurden.',
    it: 'Scrivi esclusivamente in italiano naturale, pensato per essere ascoltato. Fonti ed esempi possono essere in un’altra lingua: conservane i fatti, le incertezze e i nomi locali utili, senza copiarne la lingua né aggiungere fatti. Non affermare orari, prezzi o condizioni attuali di accesso senza una verifica specifica.',
  }[tourLocale(language)];
}
