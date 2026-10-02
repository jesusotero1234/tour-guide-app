import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { readPilotNotice } from '@/lib/pilotServer';
import { preferredLanguage, supportedLanguage } from '@/lib/browseCopy';
import type { Language } from '@/types/api';

const copy: Record<Language, {
  back: string; title: string; intro: string; voiceTitle: string; voice: string;
  walkTitle: string; walk: string; contactTitle: string; report: string; closed: string;
}> = {
  es: {
    back: 'Volver a los tours', title: 'Sobre Nomuvia',
    intro: 'Audioguías experimentales gratuitas y de acceso abierto. Los textos y las voces se producen con IA y pueden contener errores.',
    voiceTitle: 'Voz generada por IA',
    voice: 'La narración es una voz artificial producida localmente con VoxCPM2. No es una grabación de un guía en el lugar. El reproductor ofrece el texto de la narración. Cada versión vincula texto, modelo y archivo de audio para permitir su comprobación.',
    walkTitle: 'Durante el paseo',
    walk: 'Detente en un lugar seguro para consultar la pantalla. Respeta los pasos de peatones, la señalización y las restricciones de acceso. La ruta no garantiza accesibilidad, horarios ni seguridad en tiempo real. Puedes continuar sin compartir tu ubicación.',
    contactTitle: 'Responsable y contacto',
    report: 'Para comunicar un error, indica el tour y la parada afectados. Evita datos personales innecesarios.',
    closed: 'La prueba aún no está abierta: falta configurar los datos del responsable.',
  },
  en: {
    back: 'Back to tours', title: 'About Nomuvia',
    intro: 'Free, open-access experimental audio guides. Texts and voices are produced with AI and may contain errors.',
    voiceTitle: 'AI-generated voice',
    voice: 'The narration is an artificial voice produced locally with VoxCPM2. It is not a recording of a guide on site. The player offers the narration text. Each version links text, model and audio file so they can be checked.',
    walkTitle: 'During the walk',
    walk: 'Stop in a safe place to look at the screen. Respect pedestrian crossings, signs and access restrictions. The route does not guarantee accessibility, opening hours or real-time safety. You can continue without sharing your location.',
    contactTitle: 'Operator and contact',
    report: 'To report an error, mention the tour and the stop concerned. Avoid unnecessary personal data.',
    closed: 'The trial is not open yet: the operator details still need to be configured.',
  },
  fr: {
    back: 'Retour aux visites', title: 'À propos de Nomuvia',
    intro: 'Audioguides expérimentaux gratuits et en accès ouvert. Les textes et les voix sont produits avec une IA et peuvent contenir des erreurs.',
    voiceTitle: 'Voix générée par IA',
    voice: 'La narration est une voix artificielle produite localement avec VoxCPM2, et non l’enregistrement d’un guide sur place. Le lecteur propose le texte de la narration. Chaque version associe le texte, le modèle et le fichier audio pour permettre leur vérification.',
    walkTitle: 'Pendant la promenade',
    walk: 'Arrêtez-vous dans un lieu sûr pour consulter l’écran. Respectez les passages piétons, la signalisation et les restrictions d’accès. Le parcours ne garantit ni accessibilité, ni horaires, ni sécurité en temps réel. Vous pouvez continuer sans partager votre position.',
    contactTitle: 'Responsable et contact',
    report: 'Pour signaler une erreur, indiquez la visite et l’arrêt concernés. Évitez les données personnelles inutiles.',
    closed: 'L’essai n’est pas ouvert : les informations du responsable doivent encore être configurées.',
  },
  de: {
    back: 'Zurück zu den Touren', title: 'Über Nomuvia',
    intro: 'Kostenlose, frei zugängliche experimentelle Audioguides. Texte und Stimmen werden mit KI erstellt und können Fehler enthalten.',
    voiceTitle: 'KI-generierte Stimme',
    voice: 'Die Erzählung ist eine künstliche Stimme, die lokal mit VoxCPM2 erzeugt wird. Sie ist keine Aufnahme eines Guides vor Ort. Der Player bietet den Text der Erzählung an. Jede Version verknüpft Text, Modell und Audiodatei, damit sie überprüft werden können.',
    walkTitle: 'Während des Spaziergangs',
    walk: 'Bleib an einem sicheren Ort stehen, um auf den Bildschirm zu schauen. Beachte Fußgängerüberwege, Beschilderung und Zugangsbeschränkungen. Die Route garantiert weder Barrierefreiheit noch Öffnungszeiten oder Sicherheit in Echtzeit. Du kannst weitermachen, ohne deinen Standort zu teilen.',
    contactTitle: 'Verantwortlicher und Kontakt',
    report: 'Um einen Fehler zu melden, nenne die betroffene Tour und Station. Vermeide unnötige personenbezogene Daten.',
    closed: 'Der Test ist noch nicht geöffnet: Die Angaben zum Verantwortlichen müssen noch eingerichtet werden.',
  },
  it: {
    back: 'Torna ai tour', title: 'Informazioni su Nomuvia',
    intro: 'Audioguide sperimentali gratuite e ad accesso libero. Testi e voci sono prodotti con l’IA e possono contenere errori.',
    voiceTitle: 'Voce generata dall’IA',
    voice: 'La narrazione è una voce artificiale prodotta localmente con VoxCPM2. Non è la registrazione di una guida sul posto. Il lettore offre il testo della narrazione. Ogni versione collega testo, modello e file audio per consentirne la verifica.',
    walkTitle: 'Durante la passeggiata',
    walk: 'Fermati in un luogo sicuro per guardare lo schermo. Rispetta gli attraversamenti pedonali, la segnaletica e le limitazioni di accesso. Il percorso non garantisce accessibilità, orari né sicurezza in tempo reale. Puoi continuare senza condividere la tua posizione.',
    contactTitle: 'Responsabile e contatto',
    report: 'Per segnalare un errore, indica il tour e la tappa interessati. Evita dati personali non necessari.',
    closed: 'La prova non è ancora aperta: i dati del responsabile devono ancora essere configurati.',
  },
};

export default async function About({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const [params, cookieStore, requestHeaders] = await Promise.all([searchParams, cookies(), headers()]);
  const language = supportedLanguage(params.lang)
    ?? preferredLanguage(cookieStore.get('tour-page-language')?.value, requestHeaders.get('accept-language') ?? '');
  const t = copy[language];
  const notice = await readPilotNotice();
  return <main lang={language} className="legal-page">
    <Link href="/tours">{t.back}</Link>
    <h1>{t.title}</h1>
    <p>{t.intro}</p>
    <h2 id="voice">{t.voiceTitle}</h2>
    <p>{t.voice}</p>
    <h2>{t.walkTitle}</h2>
    <p>{t.walk}</p>
    <h2 id="contact">{t.contactTitle}</h2>
    {notice ? <><p>{notice.operatorName}</p><a href={'mailto:' + notice.contactEmail}>{notice.contactEmail}</a><p>{t.report}</p></> : <p>{t.closed}</p>}
  </main>;
}
