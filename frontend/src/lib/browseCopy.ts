import type { Language } from '@/types/api';

export const languageNames: Record<Language, string> = {
  es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano',
};

export function supportedLanguage(value: string | undefined | null): Language | undefined {
  const base = value?.trim().toLowerCase().split(/[-_]/)[0];
  return base && Object.hasOwn(languageNames, base) ? base as Language : undefined;
}

export function preferredLanguage(saved: string | undefined, acceptLanguage: string): Language {
  const preference = supportedLanguage(saved);
  if (preference) return preference;
  const languages = acceptLanguage.split(',').map(entry => {
    const [tag, weight] = entry.trim().split(';');
    return { language: supportedLanguage(tag), quality: weight ? Number(weight.trim().replace(/^q=/, '')) : 1 };
  }).filter(entry => entry.language && entry.quality > 0 && entry.quality <= 1)
    .sort((a, b) => b.quality - a.quality);
  return languages[0]?.language ?? 'en';
}

const copy = {
  es: {
    pageLanguage: 'Idioma de la página', eyebrow: 'La ciudad, a tu ritmo',
    heading: 'Tu próximo paseo empieza aquí.', intro: 'Escribe una ciudad y descubre los tours disponibles.',
    tourLanguage: 'Idioma del tour', cityLabel: '¿Qué ciudad quieres explorar?', cityPlaceholder: 'Escribe una ciudad',
    loading: 'Buscando tours…', searchError: 'No hemos podido buscar los tours. Inténtalo de nuevo.', retry: 'Reintentar',
    resultsLabel: 'Tours encontrados', available: 'Tours disponibles', emptyHint: 'Prueba con otra ciudad o cambia el idioma.',
    closing: 'A pie. Sin prisas. Con historias.', privateReview: 'En revisión privada', viewTour: 'Ver tour →',
    mapsCredit: 'Datos del mapa', wikipediaCredit: 'Contenido de Wikipedia',
    infoLabel: 'Información del tour', about: 'Sobre el prototipo y contacto', sources: 'Fuentes y licencias', privacy: 'Privacidad',
    languageNames: { es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano' },
    resultsCount: (n: number) => `${n} ${n === 1 ? 'tour encontrado' : 'tours encontrados'}`,
    stopsCount: (n: number) => `${n} ${n === 1 ? 'parada' : 'paradas'}`,
    emptyTitle: (city: string, language: string) => `Todavía no hay tours en ${language} para ${city}`,
  },
  en: {
    pageLanguage: 'Page language', eyebrow: 'The city, at your pace',
    heading: 'Your next walk starts here.', intro: 'Enter a city and discover the available tours.',
    tourLanguage: 'Tour language', cityLabel: 'Which city would you like to explore?', cityPlaceholder: 'Enter a city',
    loading: 'Searching for tours…', searchError: 'We couldn’t search for tours. Please try again.', retry: 'Try again',
    resultsLabel: 'Tours found', available: 'Available tours', emptyHint: 'Try another city or change the tour language.',
    closing: 'On foot. At your pace. With stories.', privateReview: 'In private review', viewTour: 'View tour →',
    mapsCredit: 'Map data', wikipediaCredit: 'Wikipedia content',
    infoLabel: 'Tour information', about: 'About and contact', sources: 'Sources and licences', privacy: 'Privacy',
    languageNames: { es: 'Spanish', en: 'English', fr: 'French', de: 'German', it: 'Italian' },
    resultsCount: (n: number) => `${n} ${n === 1 ? 'tour' : 'tours'} found`,
    stopsCount: (n: number) => `${n} ${n === 1 ? 'stop' : 'stops'}`,
    emptyTitle: (city: string, language: string) => `No tours in ${language} for ${city} yet`,
  },
  fr: {
    pageLanguage: 'Langue de la page', eyebrow: 'La ville, à votre rythme',
    heading: 'Votre prochaine balade commence ici.', intro: 'Saisissez une ville et découvrez les visites disponibles.',
    tourLanguage: 'Langue de la visite', cityLabel: 'Quelle ville souhaitez-vous explorer ?', cityPlaceholder: 'Saisissez une ville',
    loading: 'Recherche de visites…', searchError: 'Impossible de rechercher les visites. Veuillez réessayer.', retry: 'Réessayer',
    resultsLabel: 'Visites trouvées', available: 'Visites disponibles', emptyHint: 'Essayez une autre ville ou changez la langue de la visite.',
    closing: 'À pied. À votre rythme. Au fil des histoires.', privateReview: 'En cours de révision privée', viewTour: 'Voir la visite →',
    mapsCredit: 'Données cartographiques', wikipediaCredit: 'Contenu de Wikipédia',
    infoLabel: 'Informations sur la visite', about: 'À propos et contact', sources: 'Sources et licences', privacy: 'Confidentialité',
    languageNames: { es: 'espagnol', en: 'anglais', fr: 'français', de: 'allemand', it: 'italien' },
    resultsCount: (n: number) => `${n} ${n === 1 ? 'visite trouvée' : 'visites trouvées'}`,
    stopsCount: (n: number) => `${n} ${n === 1 ? 'étape' : 'étapes'}`,
    emptyTitle: (city: string, language: string) => `Pas encore de visites en ${language} à ${city}`,
  },
  de: {
    pageLanguage: 'Sprache der Seite', eyebrow: 'Die Stadt, in deinem Tempo',
    heading: 'Dein nächster Spaziergang beginnt hier.', intro: 'Gib eine Stadt ein und entdecke die verfügbaren Touren.',
    tourLanguage: 'Sprache der Tour', cityLabel: 'Welche Stadt möchtest du erkunden?', cityPlaceholder: 'Stadt eingeben',
    loading: 'Touren werden gesucht…', searchError: 'Die Touren konnten nicht gesucht werden. Bitte versuche es erneut.', retry: 'Erneut versuchen',
    resultsLabel: 'Gefundene Touren', available: 'Verfügbare Touren', emptyHint: 'Probiere eine andere Stadt oder ändere die Sprache der Tour.',
    closing: 'Zu Fuß. In deinem Tempo. Mit Geschichten.', privateReview: 'In privater Prüfung', viewTour: 'Tour ansehen →',
    mapsCredit: 'Kartendaten', wikipediaCredit: 'Wikipedia-Inhalte',
    infoLabel: 'Informationen zur Tour', about: 'Über das Projekt und Kontakt', sources: 'Quellen und Lizenzen', privacy: 'Datenschutz',
    languageNames: { es: 'Spanisch', en: 'Englisch', fr: 'Französisch', de: 'Deutsch', it: 'Italienisch' },
    resultsCount: (n: number) => `${n} ${n === 1 ? 'Tour' : 'Touren'} gefunden`,
    stopsCount: (n: number) => `${n} ${n === 1 ? 'Station' : 'Stationen'}`,
    emptyTitle: (city: string, language: string) => `Noch keine Touren auf ${language} in ${city}`,
  },
  it: {
    pageLanguage: 'Lingua della pagina', eyebrow: 'La città, al tuo ritmo',
    heading: 'La tua prossima passeggiata inizia qui.', intro: 'Inserisci una città e scopri i tour disponibili.',
    tourLanguage: 'Lingua del tour', cityLabel: 'Quale città vuoi esplorare?', cityPlaceholder: 'Inserisci una città',
    loading: 'Ricerca dei tour…', searchError: 'Non è stato possibile cercare i tour. Riprova.', retry: 'Riprova',
    resultsLabel: 'Tour trovati', available: 'Tour disponibili', emptyHint: 'Prova un’altra città o cambia la lingua del tour.',
    closing: 'A piedi. Al tuo ritmo. Tra le storie.', privateReview: 'In revisione privata', viewTour: 'Vedi il tour →',
    mapsCredit: 'Dati cartografici', wikipediaCredit: 'Contenuti di Wikipedia',
    infoLabel: 'Informazioni sul tour', about: 'Informazioni e contatti', sources: 'Fonti e licenze', privacy: 'Privacy',
    languageNames: { es: 'spagnolo', en: 'inglese', fr: 'francese', de: 'tedesco', it: 'italiano' },
    resultsCount: (n: number) => `${n} ${n === 1 ? 'tour trovato' : 'tour trovati'}`,
    stopsCount: (n: number) => `${n} ${n === 1 ? 'tappa' : 'tappe'}`,
    emptyTitle: (city: string, language: string) => `Non ci sono ancora tour in ${language} a ${city}`,
  },
};

export function browseCopy(language: Language) { return copy[language]; }
