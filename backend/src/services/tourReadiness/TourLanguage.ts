export type TourLocale = 'es' | 'fr';

export function tourLocale(value: string): TourLocale {
  const locale = value.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  if (locale !== 'es' && locale !== 'fr') throw new Error('UNSUPPORTED_TOUR_LANGUAGE');
  return locale;
}

export function enabledTourLanguages(): TourLocale[] {
  return process.env.TOUR_FRENCH_ENABLED === 'true' ? ['es', 'fr'] : ['es'];
}

export const NARRATION_POLICY_VERSION = 'oral-es-fr-provisional-1';
export const RESEARCH_POLICY_VERSION = 'destination-evidence-3';
export const NARRATION_RATES = {
  es: { wordsPerMinute: 120, measured: false },
  fr: { wordsPerMinute: 120, measured: false },
} as const;

export function draftIntroduction(city: string, language: string): string {
  return tourLocale(language) === 'fr'
    ? 'Brouillon du parcours de ' + city + '. En attente de révision.'
    : 'Borrador del recorrido por ' + city + '. Pendiente de revisión.';
}

export function transferInstruction(nextStop: string, language: string): string {
  return tourLocale(language) === 'fr'
    ? 'Rejoignez ' + nextStop + ' par vos propres moyens. Le temps de ce déplacement est exclu de la durée estimée du parcours. Consultez un service de navigation pour organiser ce trajet.'
    : 'Desplázate por tu cuenta hasta ' + nextStop + '. El tiempo de este traslado queda fuera de la duración estimada del recorrido. Consulta un servicio de navegación para organizar el trayecto.';
}

export function outputLanguageInstruction(language: string): string {
  const locale = tourLocale(language);
  return locale === 'fr'
    ? 'Écris exclusivement en français naturel, destiné à être écouté. Les sources et exemples peuvent être dans une autre langue : conserve leurs faits, leurs incertitudes et les noms locaux utiles, sans copier leur langue ni ajouter de faits. Évite toute affirmation sur les horaires, les prix ou les conditions actuelles d’accès non vérifiée spécifiquement.'
    : 'Escribe exclusivamente en español oral y natural. Las fuentes y ejemplos pueden estar en otro idioma: conserva sus hechos, incertidumbres y nombres locales útiles, sin copiar su idioma ni añadir hechos. Evita afirmar horarios, precios o condiciones actuales de acceso sin una comprobación específica.';
}
