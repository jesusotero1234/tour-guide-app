import type { Language } from '@/types/api';

export interface SeoCopy {
  languageNav: string;
  cityEyebrow: string;
  cityPromise: string;
  findWalk: string;
  walksHeading: string;
  audioText: string;
  atPace: string;
  stops: string;
  estimate: string;
  exploreRoute: string;
  readingHeading: string;
  faqTitle: string;
  disclosure: string;
  about: string;
  allCities: string;
  otherCities: string;
  cities: string;
  breadcrumbs: string;
  routeEyebrow: string;
  routePromise: string;
  planWalk: string;
  startPoint: string;
  duration: string;
  audioAndText: string;
  audioLanguage: string;
  walkingOnly: string;
  durationNote: string;
  startWalk: string;
  directions: string;
  headphones: string;
  walkStory: string;
  routeStops: string;
  openStop: string;
  sources: string;
  routeMap: string;
  continueTitle: string;
  continueText: string;
  startListening: string;
  closeMap: string;
  openMap: string;
  textLicense: string;
  cityTitle: (city: string) => string;
  cityDescription: (city: string) => string;
  cityHeading: (city: string) => string;
  walkingIn: (city: string) => string;
  routeTitle: (city: string) => string;
  routeDescription: (city: string, first: string, last: string, count: number) => string;
  readingParagraphs: readonly string[];
  howSteps: readonly string[];
  faq: readonly { question: string; answer: string }[];
}

export const seoCopies: Record<Language, SeoCopy> = {
  es: {
    languageNav: 'Idioma',
    cityEyebrow: "Audioguías gratuitas",
    cityPromise: "Sin horarios. Sin registro. Sin anuncios.",
    findWalk: "Encuentra tu paseo",
    walksHeading: "Tu próxima historia empieza a pie.",
    audioText: 'Audio y texto en español',
    atPace: 'A tu ritmo',
    stops: 'Paradas',
    estimate: 'Estimación',
    exploreRoute: "Ver recorrido y escuchar",
    readingHeading: "Elige una ruta. Deja espacio para descubrir.",
    faqTitle: "Antes de empezar",
    disclosure: 'El texto y la voz están creados con asistencia de IA. Las fuentes están disponibles.',
    about: "Sobre Nomuvia",
    allCities: "Explorar todas las ciudades",
    otherCities: 'Otras ciudades',
    cities: 'Ciudades',
    breadcrumbs: "Ruta de navegación",
    routeEyebrow: "Paseo autoguiado",
    routePromise: "Gratis. Sin aplicación. Sin registro.",
    planWalk: 'Planificar el paseo',
    startPoint: 'Punto de partida',
    duration: "Duración estimada",
    audioAndText: 'Audio y texto',
    audioLanguage: 'Español',
    walkingOnly: "solo de desplazamiento a pie",
    durationNote: "La duración total varía con la escucha y las pausas. Recorrido por el exterior, sin guía presencial ni entradas a monumentos.",
    startWalk: "Empezar el paseo",
    directions: "Cómo llegar al inicio",
    headphones: "Lleva auriculares y conexión a internet. El audio empieza cuando tú lo eliges; puedes pausar y seguir a tu ritmo.",
    walkStory: 'Historia del paseo',
    routeStops: 'Paradas de la ruta',
    openStop: "Abre cada parada para leer su historia completa.",
    sources: 'Fuentes',
    routeMap: 'Mapa de la ruta',
    continueTitle: 'Continuar',
    continueText: 'Continuar el paseo',
    startListening: 'Comenzar a escuchar',
    closeMap: 'Cerrar mapa',
    openMap: 'Abrir mapa',
    textLicense: "Narración de Nomuvia, basada en las fuentes atribuidas. Licencia del texto:",
    cityTitle: (city: string) => `Audioguía de ${city} gratis: rutas a pie`,
    cityDescription: (city: string) => `Descubre ${city} a tu ritmo con rutas a pie y audioguías gratuitas. Consulta las paradas y empieza sin instalar nada ni registrarte.`,
    cityHeading: (city: string) => `${city} tiene mucho que contarte.`,
    walkingIn: (city: string) => `Caminando por ${city}`,
    routeTitle: (city: string) => `${city} esencial: ruta a pie con audioguía gratis`,
    routeDescription: (city: string, first: string, last: string, count: number) =>
      `Ruta a pie por ${city} con audioguía gratuita. De ${first} a ${last}, ${count} paradas con audio y texto. A tu ritmo y sin registro.`,
    readingParagraphs: [
      'Los paseos se realizan en calles y plazas al aire libre. Puedes escuchar, leer o pausar cuando quieras.',
      'El mapa y las paradas te ayudan a elegir. La duración es orientativa: añade tiempo para llegar al inicio y hacer pausas. Usa auriculares y conexión a internet.',
    ],
    howSteps: [
      'Elige una ruta.',
      'Llega al punto de partida.',
      'Escucha, camina y pausa cuando quieras.',
    ],
    faq: [
      {
        question: '¿Es gratis?',
        answer: 'Sí, es gratuito. No necesitas cuenta ni hay anuncios.',
      },
      {
        question: '¿Necesito instalar algo?',
        answer: 'No. Funciona en el navegador. Solo necesitas internet.',
      },
      {
        question: '¿Incluye guía presencial o entradas?',
        answer: 'No. Es un paseo autoguiado por el exterior. No incluye guía presencial, entradas ni acceso a interiores.',
      },
    ],
  },
  en: {
    languageNav: 'Language',
    cityEyebrow: "Free audio walking tours",
    cityPromise: "No schedules. No account. No ads.",
    findWalk: "Find your walk",
    walksHeading: "Your next story starts on foot.",
    audioText: 'Audio and text in English',
    atPace: 'At your pace',
    stops: 'Stops',
    estimate: 'Estimate',
    exploreRoute: "Explore the route and listen",
    readingHeading: "Choose a route. Leave room to discover.",
    faqTitle: "Before you set off",
    disclosure: 'The text and voice are created with AI assistance. Sources are available.',
    about: "About Nomuvia",
    allCities: "Explore all cities",
    otherCities: 'Other cities',
    cities: 'Cities',
    breadcrumbs: 'Breadcrumbs',
    routeEyebrow: "Self-guided walk",
    routePromise: "Free. No app. No account.",
    planWalk: 'Plan the walk',
    startPoint: 'Start point',
    duration: "Estimated duration",
    audioAndText: 'Audio and text',
    audioLanguage: 'English',
    walkingOnly: "of walking time only",
    durationNote: "Total time varies with listening and breaks. An outdoor route, with no live guide or monument admission included.",
    startWalk: "Start your walk",
    directions: "Directions to the start",
    headphones: "Bring headphones and an internet connection. Audio starts when you choose; pause and continue at your own pace.",
    walkStory: 'Walk story',
    routeStops: 'Route stops',
    openStop: "Open each stop to read its full story.",
    sources: 'Sources',
    routeMap: 'Route map',
    continueTitle: 'Continue',
    continueText: 'Continue the walk',
    startListening: 'Start listening',
    closeMap: 'Close map',
    openMap: 'Open map',
    textLicense: "Narration by Nomuvia, based on the attributed sources. Text licence:",
    cityTitle: (city: string) => `Free audio walking tours in ${city}`,
    cityDescription: (city: string) => `Discover ${city} with free audio and text walking tours, at your own pace.`,
    cityHeading: (city: string) => `${city} has a lot to tell you.`,
    walkingIn: (city: string) => `Walking in ${city}`,
    routeTitle: (city: string) => `${city} highlights: free self-guided audio walk`,
    routeDescription: (city: string, first: string, last: string, count: number) =>
      `Free audio and text walk in ${city}. From ${first} to ${last}, ${count} stops.`,
    readingParagraphs: [
      'Walks take place on outdoor streets and squares. You can listen, read, or pause whenever you like.',
      'The map and stops help you choose. Times are estimates: allow extra time to reach the start and take breaks. Use headphones and an internet connection.',
    ],
    howSteps: [
      'Choose a route.',
      'Reach the start point.',
      'Listen, walk, and pause whenever you like.',
    ],
    faq: [
      {
        question: 'Is it free?',
        answer: 'Yes, it is free. No account is needed and there are no ads.',
      },
      {
        question: 'Do I need to install anything?',
        answer: 'No. It works in the browser. You only need internet.',
      },
      {
        question: 'Are admission tickets or a live guide included?',
        answer: 'No. It is a self-guided outdoor walk. It does not include a live guide, tickets, or interior access.',
      },
    ],
  },
  fr: {
    languageNav: 'Langue',
    cityEyebrow: "Audioguides gratuits",
    cityPromise: "Sans horaires. Sans compte. Sans publicité.",
    findWalk: "Trouvez votre balade",
    walksHeading: "Votre prochaine histoire commence à pied.",
    audioText: 'Audio et texte en français',
    atPace: 'À votre rythme',
    stops: "Étapes",
    estimate: 'Estimation',
    exploreRoute: "Découvrir le parcours et écouter",
    readingHeading: "Choisissez un parcours. Gardez le plaisir de découvrir.",
    faqTitle: "Avant de partir",
    disclosure: 'Le texte et la voix sont créés avec l\'aide de l\'IA. Les sources sont disponibles.',
    about: "À propos de Nomuvia",
    allCities: "Explorer toutes les villes",
    otherCities: 'Autres villes',
    cities: 'Villes',
    breadcrumbs: "Fil d’Ariane",
    routeEyebrow: "Balade en autonomie",
    routePromise: "Gratuit. Sans application. Sans compte.",
    planWalk: "Préparer votre balade",
    startPoint: 'Point de départ',
    duration: "Durée estimée",
    audioAndText: 'Audio et texte',
    audioLanguage: 'Français',
    walkingOnly: "de marche uniquement",
    durationNote: "La durée totale varie selon l’écoute et les pauses. Parcours en extérieur, sans guide accompagnateur ni billets d’entrée aux monuments.",
    startWalk: "Commencer la balade",
    directions: "Rejoindre le point de départ",
    headphones: "Prévoyez des écouteurs et une connexion internet. Lancez l’audio quand vous le souhaitez et faites des pauses à votre rythme.",
    walkStory: "L’histoire du parcours",
    routeStops: "Le parcours, étape par étape",
    openStop: "Ouvrez chaque étape pour lire son histoire complète.",
    sources: 'Sources',
    routeMap: 'Carte de l\'itinéraire',
    continueTitle: 'Continuer',
    continueText: 'Continuer la balade',
    startListening: 'Commencer à écouter',
    closeMap: 'Fermer la carte',
    openMap: 'Ouvrir la carte',
    textLicense: "Narration de Nomuvia, fondée sur les sources citées. Licence du texte:",
    cityTitle: (city: string) => `Visites audio gratuites à ${city}`,
    cityDescription: (city: string) => `Découvrez ${city} avec des visites audio et texte gratuites, à votre rythme.`,
    cityHeading: (city: string) => `${city} a beaucoup à vous raconter.`,
    walkingIn: (city: string) => `Marcher dans ${city}`,
    routeTitle: (city: string) => `Les incontournables de ${city} : balade autoguidée avec audioguide gratuit`,
    routeDescription: (city: string, first: string, last: string, count: number) =>
      `Balade gratuite avec audio et texte à ${city}. De ${first} à ${last}, ${count} étapes.`,
    readingParagraphs: [
      'Les balades se font dans les rues et places en extérieur. Vous pouvez écouter, lire ou faire une pause quand vous voulez.',
      'La carte et les arrêts vous aident à choisir. Les durées sont indicatives : prévoyez du temps pour rejoindre le départ et faire des pauses. Utilisez un casque et une connexion internet.',
    ],
    howSteps: [
      'Choisissez un itinéraire.',
      'Atteignez le point de départ.',
      'Écoutez, marchez et faites des pauses quand vous voulez.',
    ],
    faq: [
      {
        question: 'Est-ce gratuit ?',
        answer: 'Oui, c\'est gratuit. Aucun compte n\'est nécessaire et il n\'y a pas de publicités.',
      },
      {
        question: 'Dois-je installer quelque chose ?',
        answer: 'Non. Ça fonctionne dans le navigateur. Vous avez seulement besoin d\'internet.',
      },
      {
        question: 'Un guide accompagnateur ou des billets sont-ils inclus ?',
        answer: 'Non. C\'est une balade en autonomie en extérieur. Elle n\'inclut pas de guide accompagnateur, de billets ni d\'accès aux intérieurs.',
      },
    ],
  },
  de: {
    languageNav: 'Sprache',
    cityEyebrow: "Kostenlose Audioguides",
    cityPromise: "Ohne feste Zeiten. Ohne Konto. Ohne Werbung.",
    findWalk: "Finde deinen Rundgang",
    walksHeading: "Deine nächste Geschichte beginnt zu Fuß.",
    audioText: 'Audio und Text auf Deutsch',
    atPace: 'In deinem Tempo',
    stops: "Stationen",
    estimate: 'Schätzung',
    exploreRoute: "Route entdecken und anhören",
    readingHeading: "Wähle eine Route. Lass Raum für Entdeckungen.",
    faqTitle: "Bevor du losgehst",
    disclosure: 'Der Text und die Stimme werden mit KI-Unterstützung erstellt. Die Quellen sind verfügbar.',
    about: "Über Nomuvia",
    allCities: "Alle Städte entdecken",
    otherCities: 'Andere Städte',
    cities: 'Städte',
    breadcrumbs: "Seitennavigation",
    routeEyebrow: "Rundgang auf eigene Faust",
    routePromise: "Kostenlos. Ohne App. Ohne Konto.",
    planWalk: "Plane deinen Rundgang",
    startPoint: 'Startpunkt',
    duration: "Geschätzte Dauer",
    audioAndText: 'Audio und Text',
    audioLanguage: 'Deutsch',
    walkingOnly: "reine Gehzeit",
    durationNote: "Die Gesamtdauer hängt von Hörzeit und Pausen ab. Der Rundgang findet im Freien statt; eine persönliche Führung und Eintrittskarten sind nicht enthalten.",
    startWalk: "Rundgang starten",
    directions: "Anfahrt zum Startpunkt",
    headphones: "Nimm Kopfhörer mit und sorge für eine Internetverbindung. Starte die Erzählung, wann du möchtest, und mache jederzeit Pause.",
    walkStory: "Die Geschichte des Rundgangs",
    routeStops: "Dein Rundgang, Station für Station",
    openStop: "Öffne jede Station, um ihre vollständige Geschichte zu lesen.",
    sources: 'Quellen',
    routeMap: 'Routenkarte',
    continueTitle: 'Fortsetzen',
    continueText: 'Rundgang fortsetzen',
    startListening: 'Hören starten',
    closeMap: 'Karte schließen',
    openMap: 'Karte öffnen',
    textLicense: "Erzählung von Nomuvia auf Grundlage der angegebenen Quellen. Textlizenz:",
    cityTitle: (city: string) => `Kostenlose Audioguides und Rundgänge in ${city}`,
    cityDescription: (city: string) => `Entdecke ${city} mit kostenlosen Rundgängen mit Audio und Text, in deinem Tempo.`,
    cityHeading: (city: string) => `${city} hat viel zu erzählen.`,
    walkingIn: (city: string) => `Zu Fuß durch ${city}`,
    routeTitle: (city: string) => `Highlights von ${city}: kostenloser Audio-Rundgang auf eigene Faust`,
    routeDescription: (city: string, first: string, last: string, count: number) =>
      `Kostenloser Rundgang mit Audio und Text in ${city}. Von ${first} bis ${last}, ${count} Stationen.`,
    readingParagraphs: [
      'Die Rundgänge finden auf Straßen und Plätzen im Freien statt. Du kannst hören, lesen oder pausieren, wann du möchtest.',
      'Die Karte und die Stationen helfen bei der Auswahl. Die Zeiten sind Richtwerte: Plane zusätzliche Zeit für den Weg zum Start und für Pausen ein. Verwende Kopfhörer und eine Internetverbindung.',
    ],
    howSteps: [
      'Wähle eine Route.',
      'Erreiche den Startpunkt.',
      'Höre zu, geh los und mache Pausen, wann du möchtest.',
    ],
    faq: [
      {
        question: 'Ist es kostenlos?',
        answer: 'Ja, es ist kostenlos. Es wird kein Konto benötigt und es gibt keine Werbung.',
      },
      {
        question: 'Muss ich etwas installieren?',
        answer: 'Nein. Es funktioniert im Browser. Du brauchst nur Internet.',
      },
      {
        question: 'Gibt es einen Live-Guide oder Tickets?',
        answer: 'Nein. Es ist ein Rundgang im Freien auf eigene Faust. Eine persönliche Führung, Eintrittskarten und Innenbesichtigungen sind nicht enthalten.',
      },
    ],
  },
  it: {
    languageNav: 'Lingua',
    cityEyebrow: "Audioguide gratuite",
    cityPromise: "Senza orari. Senza account. Senza pubblicità.",
    findWalk: 'Trova una passeggiata',
    walksHeading: "La tua prossima storia comincia a piedi.",
    audioText: 'Audio e testo in italiano',
    atPace: 'Al tuo ritmo',
    stops: 'Tappe',
    estimate: 'Stima',
    exploreRoute: "Scopri il percorso e ascolta",
    readingHeading: "Scegli un percorso. Lascia spazio alla scoperta.",
    faqTitle: "Prima di partire",
    disclosure: 'Il testo e la voce sono creati con l\'assistenza dell\'IA. Le fonti sono disponibili.',
    about: "Informazioni su Nomuvia",
    allCities: "Esplora tutte le città",
    otherCities: 'Altre città',
    cities: 'Città',
    breadcrumbs: "Percorso di navigazione",
    routeEyebrow: "Passeggiata autoguidata",
    routePromise: "Gratis. Senza app. Senza account.",
    planWalk: 'Pianifica la passeggiata',
    startPoint: 'Punto di partenza',
    duration: "Durata stimata",
    audioAndText: 'Audio e testo',
    audioLanguage: 'Italiano',
    walkingOnly: "di cammino, escluse le soste",
    durationNote: "La durata totale varia in base all’ascolto e alle pause. Il percorso è all’aperto e non comprende una guida in presenza né i biglietti d’ingresso ai monumenti.",
    startWalk: 'Inizia la passeggiata',
    directions: "Come raggiungere il punto di partenza",
    headphones: "Porta le cuffie e assicurati di avere una connessione internet. Avvia l’audio quando vuoi e fai una pausa in qualsiasi momento.",
    walkStory: 'Storia della passeggiata',
    routeStops: 'Tappe del percorso',
    openStop: "Apri ogni tappa per leggerne la storia completa.",
    sources: 'Fonti',
    routeMap: 'Mappa del percorso',
    continueTitle: 'Continua',
    continueText: 'Continua la passeggiata',
    startListening: 'Inizia ad ascoltare',
    closeMap: 'Chiudi mappa',
    openMap: 'Apri mappa',
    textLicense: "Narrazione di Nomuvia basata sulle fonti citate. Licenza del testo:",
    cityTitle: (city: string) => `Tour audio gratuiti a ${city}`,
    cityDescription: (city: string) => `Scopri ${city} con tour audio e testo gratuiti, al tuo ritmo.`,
    cityHeading: (city: string) => `${city} ha molto da raccontarti.`,
    walkingIn: (city: string) => `Passeggiando a ${city}`,
    routeTitle: (city: string) => `Le attrazioni di ${city}: passeggiata autoguidata con audioguida gratuita`,
    routeDescription: (city: string, first: string, last: string, count: number) =>
      `Passeggiata audio e testo gratuita a ${city}. Da ${first} a ${last}, ${count} tappe.`,
    readingParagraphs: [
      'Le passeggiate si svolgono in strade e piazze all\'aperto. Puoi ascoltare, leggere o fare una pausa quando vuoi.',
      'La mappa e le tappe ti aiutano a scegliere. I tempi sono indicativi: aggiungi il tempo per raggiungere la partenza e fare delle pause. Usa le cuffie e una connessione internet.',
    ],
    howSteps: [
      'Scegli un percorso.',
      'Raggiungi il punto di partenza.',
      'Ascolta, cammina e fai pause quando vuoi.',
    ],
    faq: [
      {
        question: 'È gratuito?',
        answer: 'Sì, è gratuito. Non serve un account e non ci sono pubblicità.',
      },
      {
        question: 'Devo installare qualcosa?',
        answer: 'No. Funziona nel browser. Hai solo bisogno di internet.',
      },
      {
        question: 'Sono inclusi una guida in presenza o i biglietti?',
        answer: 'No. È una passeggiata autoguidata all\'aperto. Non include una guida in presenza, biglietti o accesso agli interni.',
      },
    ],
  },
};

export function seoCopy(locale: Language): SeoCopy {
  return seoCopies[locale];
}
