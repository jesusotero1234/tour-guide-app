import Link from 'next/link';
import { InfoLinks } from '@/components/legal/InfoLinks';
import { ClearProgressButton } from '@/components/legal/ClearProgressButton';
import { readPilotNotice } from '@/lib/pilotServer';
export default async function Privacy({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const fr = (await searchParams).lang === 'fr';
  const notice = await readPilotNotice();
  const fields = [
    ['hosting', fr ? 'Hébergement' : 'Alojamiento'],
    ['processors', fr ? 'Prestataires' : 'Proveedores'],
    ['transfers', fr ? 'Transferts internationaux' : 'Transferencias internacionales'],
    ['retention', fr ? 'Conservation' : 'Conservación'],
    ['legalBases', fr ? 'Finalités et bases juridiques' : 'Finalidades y bases jurídicas'],
    ['rights', fr ? 'Exercice des droits' : 'Ejercicio de derechos'],
  ] as const;
  return <main lang={fr ? 'fr' : 'es'} className="legal-page">
    <Link href="/tours">{fr ? 'Retour aux visites' : 'Volver a los tours'}</Link>
    <h1>{fr ? 'Confidentialité' : 'Privacidad'}</h1>
    <p>{fr ? 'Le navigateur conserve votre progression de lecture sur cet appareil jusqu’à son effacement. Aucun compte de participant ni mesure publicitaire n’est nécessaire au pilote.' : 'El navegador conserva tu progreso de lectura y escucha en este dispositivo hasta que lo borres. El piloto no necesita cuentas de participantes ni medición publicitaria.'}</p>
    <p>{fr ? 'Ce navigateur mémorise aussi que vous avez vu les informations de départ, pour ne pas les répéter. Cette préférence reste sur cet appareil jusqu’à son effacement ; elle n’active ni la localisation ni la mesure d’usage.' : 'Este navegador también recuerda que has visto el aviso de inicio para no repetirlo. La preferencia se queda en este dispositivo hasta que la borres; no activa la ubicación ni la medición de uso.'}</p>
    <ClearProgressButton french={fr} />
    <h2>{fr ? 'Position, cartes et photos' : 'Ubicación, mapas y fotos'}</h2>
    <p>{fr ? 'Les photos sont chargées depuis Wikimedia. Ce service reçoit votre adresse IP et la demande de l’image lors de la connexion.' : 'Las fotos se cargan desde Wikimedia. Al establecer esa conexión, el servicio recibe tu dirección IP y la petición de la imagen.'}</p>
    <p>{fr ? 'La position est facultative et demandée seulement après votre action. Elle sert à vous situer sur la carte dans le navigateur ; le pilote ne l’envoie pas à son serveur et ne conserve pas votre trajet. Vous pouvez arrêter ce suivi et révoquer l’autorisation dans le navigateur.' : 'La ubicación es opcional y solo se solicita tras tu acción. Sirve para situarte en el mapa del navegador; el piloto no la envía a su servidor ni guarda tu recorrido. Puedes detener el seguimiento y revocar el permiso en el navegador.'}</p>
    <p>{fr ? 'Afficher la carte transmet votre adresse IP et les zones de carte demandées au fournisseur OpenStreetMap. Ouvrir Google Maps quitte cette application et relève des conditions de Google. Le serveur reçoit les données techniques nécessaires aux connexions et à la protection de l’accès privé.' : 'Mostrar el mapa transmite tu dirección IP y las zonas de mapa solicitadas al proveedor OpenStreetMap. Abrir Google Maps sale de esta aplicación y queda sujeto a las condiciones de Google. El servidor recibe los datos técnicos necesarios para las conexiones y la protección del acceso privado.'}</p>
    {notice ? <><h2>{fr ? 'Responsable' : 'Responsable'}</h2><p>{notice.operatorName} · <a href={'mailto:' + notice.contactEmail}>{notice.contactEmail}</a></p>{fields.map(([key,label]) => <section key={key}><h2>{label}</h2><p>{notice[key]}</p></section>)}</> : <p>{fr ? 'L’essai reste fermé jusqu’à la configuration des informations du responsable, des prestataires et de la conservation.' : 'La prueba permanece cerrada hasta configurar los datos del responsable, los proveedores y la conservación.'}</p>}
    <h2>{fr ? 'Mesure optionnelle (Umami)' : 'Medición opcional (Umami)'}</h2>
    <p>{fr ? 'Si le pilote est configuré avec un serveur Umami auto-hébergé, il peut enregistrer : les visites, le pays approximatif de connexion (pas de position GPS), les interactions avec le tour, le temps de lecture estimé, le temps d’écoute audio et les évaluations ou commentaires volontaires. Aucune publicité ni compte de participant n’est utilisé. Cette mesure n’est activée que si elle est configurée et respecte le signal « Ne pas suivre ».' : 'Si el piloto está configurado con un servidor Umami autoalojado, puede registrar: las visitas, el país aproximado de conexión (no la posición GPS), las interacciones con el tour, el tiempo de lectura estimado, el tiempo de escucha de audio y las valoraciones o comentarios voluntarios. No se usa publicidad ni cuentas de participantes. Esta medición solo se activa si está configurada y respeta la señal «No rastrear».'}</p>
    <InfoLinks language={fr ? 'fr' : 'es'} />
  </main>;
}
