import type { Language } from '@/types/api';
export const consentCopy: Record<Language, {
  title: string; intro: string; accept: string; reject: string; settings: string;
  essential: string; essentialText: string; analytics: string; analyticsText: string;
  save: string; close: string; privacy: string; unavailable: string; noticeIntro: string; understood: string;
}> = {
  es: {
    noticeIntro: "Guardamos tu idioma y el progreso del tour en este dispositivo. Las estadísticas de uso no están activas. Puedes consultar y cambiar tus preferencias de privacidad.", understood: "Entendido",
    title: 'Tu paseo. Tu privacidad.', intro: 'Guardamos tu idioma y el progreso del tour en este dispositivo. Las estadísticas de uso son opcionales: tú decides si nos ayudas a mejorar la experiencia.',
    accept: 'Aceptar estadísticas', reject: 'Rechazar estadísticas', settings: 'Configurar privacidad',
    essential: 'Idioma y progreso', essentialText: 'Recordamos tu idioma, la parada, la escucha y los avisos vistos. Puedes borrar el progreso desde Privacidad. Esto no activa tu ubicación.',
    analytics: 'Estadísticas opcionales', analyticsText: 'Con tu permiso, Umami mide visitas, país aproximado, interacciones y tiempo de lectura y escucha. También permite enviar valoraciones voluntarias. Sin publicidad ni GPS. Puedes retirar el permiso aquí.',
    save: 'Guardar preferencias', close: 'Cerrar', privacy: 'Privacidad y almacenamiento', unavailable: 'Las estadísticas no están disponibles o tu navegador las tiene bloqueadas.',
  },
  en: {
    noticeIntro: "We save your language and tour progress on this device. Usage statistics are not active. You can review and change your privacy preferences.", understood: "Got it",
    title: 'Your walk. Your privacy.', intro: 'We save your language and tour progress on this device. Usage statistics are optional: you choose whether to help us improve the experience.',
    accept: 'Accept statistics', reject: 'Reject statistics', settings: 'Privacy settings',
    essential: 'Language and progress', essentialText: 'We remember your language, stop, listening progress and notices seen. You can erase progress in Privacy. This does not enable location access.',
    analytics: 'Optional statistics', analyticsText: 'With your permission, Umami measures visits, approximate country, interactions and reading and listening time. It also enables voluntary ratings. No advertising or GPS. You can withdraw permission here.',
    save: 'Save preferences', close: 'Close', privacy: 'Privacy and storage', unavailable: 'Statistics are unavailable or blocked by your browser.',
  },
  fr: {
    noticeIntro: "Nous conservons votre langue et votre progression sur cet appareil. Les statistiques d’utilisation ne sont pas actives. Vous pouvez consulter et modifier vos préférences de confidentialité.", understood: "Compris",
    title: 'Votre balade. Votre vie privée.', intro: 'Nous conservons votre langue et votre progression sur cet appareil. Les statistiques sont facultatives : vous choisissez de nous aider à améliorer l’expérience.',
    accept: 'Accepter les statistiques', reject: 'Refuser les statistiques', settings: 'Paramètres de confidentialité',
    essential: 'Langue et progression', essentialText: 'Nous mémorisons votre langue, votre étape, votre écoute et les avis consultés. Vous pouvez effacer la progression dans Confidentialité. Cela n’active pas la localisation.',
    analytics: 'Statistiques facultatives', analyticsText: 'Avec votre accord, Umami mesure les visites, le pays approximatif, les interactions et le temps de lecture et d’écoute. Il permet aussi les évaluations volontaires. Sans publicité ni GPS. Vous pouvez retirer votre accord ici.',
    save: 'Enregistrer mes choix', close: 'Fermer', privacy: 'Confidentialité et stockage', unavailable: 'Les statistiques sont indisponibles ou bloquées par votre navigateur.',
  },
  de: {
    noticeIntro: "Wir speichern deine Sprache und deinen Tourfortschritt auf diesem Gerät. Nutzungsstatistiken sind nicht aktiv. Du kannst deine Datenschutzeinstellungen ansehen und ändern.", understood: "Verstanden",
    title: 'Dein Spaziergang. Deine Privatsphäre.', intro: 'Wir speichern deine Sprache und deinen Tourfortschritt auf diesem Gerät. Nutzungsstatistiken sind freiwillig: Du entscheidest, ob du uns helfen möchtest, das Erlebnis zu verbessern.',
    accept: 'Statistiken akzeptieren', reject: 'Statistiken ablehnen', settings: 'Datenschutzeinstellungen',
    essential: 'Sprache und Fortschritt', essentialText: 'Wir merken uns Sprache, Station, Hörfortschritt und gelesene Hinweise. Den Fortschritt kannst du unter Datenschutz löschen. Der Standort wird dadurch nicht aktiviert.',
    analytics: 'Optionale Statistiken', analyticsText: 'Mit deiner Erlaubnis misst Umami Besuche, das ungefähre Land, Interaktionen sowie Lese- und Hörzeit. Freiwillige Bewertungen sind ebenfalls möglich. Ohne Werbung oder GPS. Hier kannst du deine Erlaubnis widerrufen.',
    save: 'Einstellungen speichern', close: 'Schließen', privacy: 'Datenschutz und Speicherung', unavailable: 'Statistiken sind nicht verfügbar oder werden von deinem Browser blockiert.',
  },
  it: {
    noticeIntro: "Salviamo la lingua e i progressi del tour su questo dispositivo. Le statistiche di utilizzo non sono attive. Puoi consultare e modificare le tue preferenze sulla privacy.", understood: "Ho capito",
    title: 'La tua passeggiata. La tua privacy.', intro: 'Salviamo la lingua e i progressi del tour su questo dispositivo. Le statistiche sono facoltative: scegli tu se aiutarci a migliorare l’esperienza.',
    accept: 'Accetta le statistiche', reject: 'Rifiuta le statistiche', settings: 'Impostazioni privacy',
    essential: 'Lingua e progressi', essentialText: 'Ricordiamo lingua, tappa, ascolto e avvisi letti. Puoi cancellare i progressi nella pagina Privacy. Questo non attiva la posizione.',
    analytics: 'Statistiche facoltative', analyticsText: 'Con il tuo permesso, Umami misura visite, paese approssimativo, interazioni e tempo di lettura e ascolto. Consente anche valutazioni volontarie. Senza pubblicità né GPS. Puoi revocare il permesso qui.',
    save: 'Salva preferenze', close: 'Chiudi', privacy: 'Privacy e archiviazione', unavailable: 'Le statistiche non sono disponibili o sono bloccate dal browser.',
  },
};
