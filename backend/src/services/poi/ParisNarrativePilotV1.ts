import {
  NarrativeEvidenceFactV1,
  narrativeEvidenceFactFingerprintV1,
  NarrativeScriptRequestV1,
  NarrativeScriptSceneRequestV1,
  NARRATIVE_SCRIPT_REQUEST_SCHEMA_VERSION_V1,
  validateNarrativeScriptRequestV1,
} from './NarrativePilotV1';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import { EditorialWorkbenchV7, validateEditorialWorkbenchV7 } from './EditorialWorkbenchV7';

const PROMISE = 'Desde la isla medieval hasta el Palais-Royal, descubrir cómo espacios sagrados y reales acabaron formando parte de la ciudad pública.';
const CENTRAL_QUESTION = '¿Cómo consiguió París convertir símbolos del poder en lugares que hoy siente como propios?';
const CAPTURED_AT = '2026-08-08T00:00:00.000Z';

function fact(
  value: Omit<NarrativeEvidenceFactV1, 'fingerprint' | 'capturedAt'>
): NarrativeEvidenceFactV1 {
  const content = { ...value, capturedAt: CAPTURED_AT };
  return { ...content, fingerprint: narrativeEvidenceFactFingerprintV1(content) };
}

const NOTRE_DAME_FACTS: NarrativeEvidenceFactV1[] = [
  fact({
    factId: 'notre-dame-growth', ownerCanonicalId: 'Q2981',
    excerpt: 'El crecimiento de París y la llegada de fieles impulsaron al obispo Maurice de Sully a iniciar en el siglo XII una catedral mucho mayor.',
    sourceUrl: 'https://www.notredamedeparis.fr/en/understand/history/',
    sourceTitle: 'The History of Notre-Dame — Notre-Dame de Paris',
  }),
  fact({
    factId: 'notre-dame-demolition-risk', ownerCanonicalId: 'Q2981',
    excerpt: 'Tras los daños del tiempo y de la Revolución, Notre-Dame amenazaba ruina y las autoridades parisinas llegaron a considerar su demolición completa.',
    sourceUrl: 'https://www.notredamedeparis.fr/en/understand/history/',
    sourceTitle: 'The History of Notre-Dame — Notre-Dame de Paris',
  }),
  fact({
    factId: 'notre-dame-hugo', ownerCanonicalId: 'Q2981',
    excerpt: 'El éxito de la novela de Victor Hugo en 1831 provocó una movilización nacional por la conservación y precedió a la restauración estatal del siglo XIX.',
    sourceUrl: 'https://www.notredamedeparis.fr/en/understand/history/',
    sourceTitle: 'The History of Notre-Dame — Notre-Dame de Paris',
  }),
  fact({
    factId: 'notre-dame-fire-reopening', ownerCanonicalId: 'Q2981',
    excerpt: 'El incendio del 15 de abril de 2019 destruyó la armadura medieval y la aguja; tras la restauración, la reapertura de Notre-Dame llegó el 8 de diciembre de 2024.',
    sourceUrl: 'https://www.notredamedeparis.fr/en/understand/history/',
    sourceTitle: 'The History of Notre-Dame — Notre-Dame de Paris',
  }),
];

const LOUVRE_FACTS: NarrativeEvidenceFactV1[] = [
  fact({
    factId: 'louvre-fortress', ownerCanonicalId: 'Q1075988',
    excerpt: 'Philippe Auguste inició en 1190 una fortaleza rodeada de foso para proteger el límite occidental de París frente a la amenaza anglonormanda.',
    sourceUrl: 'https://presse.louvre.fr/wp-content/uploads/2016/12/832675.pdf',
    sourceTitle: 'The Palace and its Collections — Musée du Louvre press kit',
  }),
  fact({
    factId: 'louvre-royal-residence', ownerCanonicalId: 'Q1075988',
    excerpt: 'Al quedar dentro de la ciudad, el Louvre perdió su función defensiva y desde 1364 fue convertido en una residencia real suntuosa.',
    sourceUrl: 'https://presse.louvre.fr/wp-content/uploads/2016/12/832675.pdf',
    sourceTitle: 'The Palace and its Collections — Musée du Louvre press kit',
  }),
  fact({
    factId: 'louvre-renaissance', ownerCanonicalId: 'Q1075988',
    excerpt: 'François I hizo demoler el gran torreón y decidió en 1546 levantar un palacio renacentista, concebido bajo su reinado y ejecutado principalmente por Henri II.',
    sourceUrl: 'https://presse.louvre.fr/wp-content/uploads/2016/12/832675.pdf',
    sourceTitle: 'The Palace and its Collections — Musée du Louvre press kit',
  }),
  fact({
    factId: 'louvre-public-museum', ownerCanonicalId: 'Q1075988',
    excerpt: 'Un decreto de 1791 dedicó el Louvre a las artes y en 1793, durante la Revolución, abrió allí el Muséum central des Arts para el público.',
    sourceUrl: 'https://presse.louvre.fr/wp-content/uploads/2016/12/832675.pdf',
    sourceTitle: 'The Palace and its Collections — Musée du Louvre press kit',
  }),
];

const PALAIS_ROYAL_FACTS: NarrativeEvidenceFactV1[] = [
  fact({
    factId: 'palais-royal-richelieu', ownerCanonicalId: 'Q329948',
    excerpt: 'Richelieu adquirió el Hôtel de Rambouillet en 1624 y lo convirtió en una residencia suntuosa próxima al Louvre, símbolo de su poder junto a Luis XIII.',
    sourceUrl: 'https://www.domaine-palais-royal.fr/en/decouvrir/histoire-du-domaine-national-du-palais-royal',
    sourceTitle: 'Histoire du domaine national du Palais-Royal',
  }),
  fact({
    factId: 'palais-royal-arcades', ownerCanonicalId: 'Q329948',
    excerpt: 'Desde 1781 se levantaron edificios con locales alquilables y galerías alrededor del jardín; tiendas y cafés atrajeron la vida pública parisina.',
    sourceUrl: 'https://www.domaine-palais-royal.fr/en/decouvrir/histoire-du-domaine-national-du-palais-royal',
    sourceTitle: 'Histoire du domaine national du Palais-Royal',
  }),
  fact({
    factId: 'palais-royal-anti-versailles', ownerCanonicalId: 'Q329948',
    excerpt: 'La hostilidad de Louis-Philippe de Orléans hacia Luis XVI y la circulación de ideas hicieron del Palais-Royal un anti-Versalles y un foro político.',
    sourceUrl: 'https://www.domaine-palais-royal.fr/en/decouvrir/histoire-du-domaine-national-du-palais-royal',
    sourceTitle: 'Histoire du domaine national du Palais-Royal',
  }),
  fact({
    factId: 'palais-royal-desmoulins', ownerCanonicalId: 'Q329948',
    excerpt: 'El 12 de julio de 1789 Camille Desmoulins subió a una mesa y exhortó a la multitud a tomar las armas; dos días después cayó la Bastilla.',
    sourceUrl: 'https://www.domaine-palais-royal.fr/en/decouvrir/histoire-du-domaine-national-du-palais-royal',
    sourceTitle: 'Histoire du domaine national du Palais-Royal',
  }),
];

const SCENE_DETAILS: Record<string, Pick<
  NarrativeScriptSceneRequestV1,
  'contribution' | 'allowedProperNouns' | 'evidenceFacts'
>> = {
  'notre-dame': {
    contribution: 'Una ciudad que ha tenido que decidir repetidamente si salvaba su catedral.',
    allowedProperNouns: [
      'París', 'Notre-Dame', 'Île de la Cité', 'Maurice de Sully', 'Revolución',
      'Victor Hugo', 'Sainte-Chapelle', 'Estado',
    ],
    evidenceFacts: NOTRE_DAME_FACTS,
  },
  louvre: {
    contribution: 'Una arquitectura construida para separar al poder termina abriéndose al público.',
    allowedProperNouns: [
      'París', 'Louvre', 'Philippe Auguste', 'François I', 'Henri II', 'Revolución',
      'Muséum central des Arts', 'Cour Carrée', 'Arc du Carrousel', 'Asamblea',
    ],
    evidenceFacts: LOUVRE_FACTS,
  },
  'palais-royal': {
    contribution: 'Una conversación en un jardín privado ayuda a incendiar políticamente París.',
    allowedProperNouns: [
      'París', 'Palais-Royal', 'Richelieu', 'Hôtel de Rambouillet', 'Louvre',
      'Luis XIII', 'Louis-Philippe de Orléans', 'Luis XVI', 'Versalles',
      'Camille Desmoulins', 'Bastilla', 'Revolución', 'Montpensier',
    ],
    evidenceFacts: PALAIS_ROYAL_FACTS,
  },
};

export function buildParisNarrativeScriptRequestV1(
  workbench: EditorialWorkbenchV7
): NarrativeScriptRequestV1 {
  validateEditorialWorkbenchV7(workbench);
  const optimization = workbench.snapshot.optimization;
  if (optimization.status !== 'selected') throw new Error('Paris v7 route must be selected');
  if (editorialFingerprintV7(optimization.route) !== workbench.snapshot.fingerprints.route) {
    throw new Error('Paris v7 route fingerprint changed');
  }
  const routeSceneIds = optimization.route.sceneIds;
  const sceneById = new Map(workbench.snapshot.scenes.map((scene) => [scene.sceneId, scene]));
  const selectedIds = ['notre-dame', 'louvre', 'palais-royal'];
  const scenes = selectedIds.map((sceneId) => {
    const routeIndex = routeSceneIds.indexOf(sceneId);
    const routeScene = sceneById.get(sceneId);
    if (routeIndex < 0 || !routeScene) throw new Error(`Paris narrative scene ${sceneId} left the v7 route`);
    return {
      sceneId,
      name: routeScene.name,
      routePosition: routeIndex + 1,
      previousSceneId: routeSceneIds[routeIndex - 1] ?? null,
      nextSceneId: routeSceneIds[routeIndex + 1] ?? null,
      contribution: SCENE_DETAILS[sceneId].contribution,
      allowedProperNouns: [...SCENE_DETAILS[sceneId].allowedProperNouns],
      evidenceFacts: SCENE_DETAILS[sceneId].evidenceFacts.map((item) => ({ ...item })),
    };
  });
  return validateNarrativeScriptRequestV1({
    schemaVersion: NARRATIVE_SCRIPT_REQUEST_SCHEMA_VERSION_V1,
    language: 'es-ES',
    promise: PROMISE,
    centralQuestion: CENTRAL_QUESTION,
    routeFingerprint: workbench.snapshot.fingerprints.route,
    routeSceneIds: [...routeSceneIds],
    scenes,
  });
}
