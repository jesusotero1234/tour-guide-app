import Link from 'next/link';
import { InfoLinks } from '@/components/legal/InfoLinks';
import { readPilotNotice } from '@/lib/pilotServer';
export default async function About({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const fr = (await searchParams).lang === 'fr';
  const notice = await readPilotNotice();
  return <main lang={fr ? 'fr' : 'es'} className="legal-page">
    <Link href="/tours">{fr ? 'Retour aux visites' : 'Volver a los tours'}</Link>
    <h1>{fr ? 'À propos de Nomuvia' : 'Sobre Nomuvia'}</h1>
    <p>{fr ? 'Audioguides expérimentaux gratuits et en accès ouvert. Les textes et les voix sont produits avec une IA et peuvent contenir des erreurs.' : 'Audioguías experimentales gratuitas y de acceso abierto. Los textos y las voces se producen con IA y pueden contener errores.'}</p>
    <h2 id="voice">{fr ? 'Voix générée par IA' : 'Voz generada por IA'}</h2>
    <p>{fr ? 'La narration est une voix artificielle produite localement avec VoxCPM2, et non l’enregistrement d’un guide sur place. Le lecteur propose le texte de la narration. Chaque version associe le texte, le modèle et le fichier audio pour permettre leur vérification.' : 'La narración es una voz artificial producida localmente con VoxCPM2. No es una grabación de un guía en el lugar. El reproductor ofrece el texto de la narración. Cada versión vincula texto, modelo y archivo de audio para permitir su comprobación.'}</p>
    <h2>{fr ? 'Pendant la promenade' : 'Durante el paseo'}</h2>
    <p>{fr ? 'Arrêtez-vous dans un lieu sûr pour consulter l’écran. Respectez les passages piétons, la signalisation et les restrictions d’accès. Le parcours ne garantit ni accessibilité, ni horaires, ni sécurité en temps réel. Vous pouvez continuer sans partager votre position.' : 'Detente en un lugar seguro para consultar la pantalla. Respeta los pasos de peatones, la señalización y las restricciones de acceso. La ruta no garantiza accesibilidad, horarios ni seguridad en tiempo real. Puedes continuar sin compartir tu ubicación.'}</p>
    <h2 id="contact">{fr ? 'Responsable et contact' : 'Responsable y contacto'}</h2>
    {notice ? <><p>{notice.operatorName}</p><a href={'mailto:' + notice.contactEmail}>{notice.contactEmail}</a><p>{fr ? 'Pour signaler une erreur, indiquez la visite et l’arrêt concernés. Évitez les données personnelles inutiles.' : 'Para comunicar un error, indica el tour y la parada afectados. Evita datos personales innecesarios.'}</p></> : <p>{fr ? 'L’essai n’est pas ouvert : les informations du responsable doivent encore être configurées.' : 'La prueba aún no está abierta: falta configurar los datos del responsable.'}</p>}
    <InfoLinks language={fr ? 'fr' : 'es'} />
  </main>;
}
