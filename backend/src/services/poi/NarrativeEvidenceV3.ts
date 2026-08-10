import { PoiEnrichmentSnapshot } from './PoiEnrichmentSnapshot';
import {
  WikimediaProminenceSnapshotV6,
  WikimediaSourceRevisionV6,
  wikimediaProminenceFingerprintV6,
} from './EditorialProminenceV6';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import { EditorialWorkbenchV7, validateEditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import {
  NarrativeBenchmarkCaseV2,
  NarrativeSourceFactV2,
  validateNarrativeBenchmarkCaseV2,
} from './NarrativeBenchmarkCaseV2';

export const NARRATIVE_EVIDENCE_SCHEMA_VERSION_V3 = 'narrative-evidence-v3' as const;

export type NarrativeEvidenceRoleV3 = 'observable' | 'historical' | 'human';
export type NarrativeEvidenceSourceKindV3 = 'wikipedia' | 'wikidata' | 'osm' | 'official';
export type NarrativeClaimRelationSupportV3 = 'direct' | 'chronology' | 'causality';

export interface NarrativeEvidenceSourceV3 {
  sourceId: string;
  kind: NarrativeEvidenceSourceKindV3;
  url: string;
  title: string;
  revisionId: string;
  capturedAt: string;
  language: string;
  excerpt: string;
  fingerprint: string;
}

export interface NarrativeEvidenceFactV3 {
  factId: string;
  ownerCanonicalId: string;
  role: NarrativeEvidenceRoleV3;
  originalExcerpt: string;
  originalLanguage: string;
  normalizedEs: string;
  relationSupport: NarrativeClaimRelationSupportV3[];
  sensitive: boolean;
  allowsCausality: boolean;
  sources: NarrativeEvidenceSourceV3[];
  fingerprint: string;
}

export interface NarrativeEvidenceReadinessV3 {
  ready: boolean;
  missingRoles: NarrativeEvidenceRoleV3[];
  roleCounts: Record<NarrativeEvidenceRoleV3, number>;
}

export interface NarrativeEvidenceRouteSceneV3 {
  sceneId: string;
  name: string;
  ownerCanonicalId: string;
  contribution: string;
  evidenceFacts: NarrativeEvidenceFactV3[];
  readiness: NarrativeEvidenceReadinessV3;
}

export interface NarrativeEvidenceSceneInputV3 {
  sceneId: string;
  name: string;
  ownerCanonicalId: string;
  contribution: string;
}

export interface NarrativeEvidenceCompilationInputV3 {
  scene: NarrativeEvidenceSceneInputV3;
  snapshot: PoiEnrichmentSnapshot;
  sourceRevisions?: WikimediaSourceRevisionV6[];
}

export interface NarrativeEvidenceCaseSceneV3 extends NarrativeEvidenceRouteSceneV3 {
  routePosition: number;
  previousSceneId: string | null;
  nextSceneId: string | null;
}

export interface NarrativeEvidenceCaseV3 {
  schemaVersion: typeof NARRATIVE_EVIDENCE_SCHEMA_VERSION_V3;
  caseId: string;
  city: string;
  theme: 'history';
  language: 'es-ES';
  promise: string;
  centralQuestion: string;
  routeFingerprint: string;
  sourceSnapshotFingerprint: string;
  rejectedSceneIds: string[];
  scenes: NarrativeEvidenceCaseSceneV3[];
}

const ROLES: NarrativeEvidenceRoleV3[] = ['observable', 'historical', 'human'];
const OBSERVABLE = /\b(arco|arcos|arcada|arcadas|columna|columnas|edificio|fachada|fuente|granito|habitaciones|piedra|plaza|puerta|salas|torre|ventana|ventanas)\b/iu;
const HISTORICAL = /\b(antigu|constru|histori|inaugur|medieval|reconstru|reform|siglo|transform)\w*/iu;
const HUMAN = /\b(arquitect[oa]|ayuntamiento|ceremonia|comercio|consejo|consagr|corte|dirigi|diseñ|encarg|familia|mandato|mercado|obra|orden[óo]|papa|proyecto|rey|reina|residentes|trabajador)\w*/iu;
const SENSITIVE_CLAIMS = new Set(['architect', 'inception', 'namedAfter']);

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function sourceFingerprint(source: Omit<NarrativeEvidenceSourceV3, 'fingerprint'>): string {
  return editorialFingerprintV7(source);
}

export function narrativeEvidenceFactFingerprintV3(
  fact: Omit<NarrativeEvidenceFactV3, 'fingerprint'>
): string {
  return editorialFingerprintV7(fact);
}

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function titleFromWikipediaKey(key: string): string {
  const index = key.indexOf(':');
  return index >= 0 ? key.slice(index + 1) : key;
}

function wikipediaEntry(input: NarrativeEvidenceCompilationInputV3): {
  key: string;
  title: string;
  description: string;
  body: string;
  language: string;
  wikipediaUrl: string;
} | null {
  const wikidata = input.snapshot.wikidata[input.scene.ownerCanonicalId];
  const preferred = wikidata?.nameTranslations[input.snapshot.language] ?? input.scene.name;
  const targetNames = new Set([normalize(preferred), normalize(input.scene.name)]);
  const entries = Object.entries(input.snapshot.wikipedia);
  const exact = entries.find(([key]) => targetNames.has(normalize(titleFromWikipediaKey(key))));
  const fallback = entries.find(([key]) => {
    const titleTokens = new Set(normalize(titleFromWikipediaKey(key)).split(' '));
    return normalize(input.scene.name).split(' ')
      .filter((token) => token.length >= 4)
      .every((token) => titleTokens.has(token));
  });
  const entry = exact ?? fallback;
  if (!entry) return null;
  return { key: entry[0], title: titleFromWikipediaKey(entry[0]), ...entry[1] };
}

function findRevision(
  revisions: WikimediaSourceRevisionV6[],
  project: string,
  title: string
): WikimediaSourceRevisionV6 | undefined {
  return revisions.find((revision) => (
    revision.project === project && normalize(revision.title) === normalize(title)
  ));
}

function wikipediaSource(
  input: NarrativeEvidenceCompilationInputV3,
  entry: NonNullable<ReturnType<typeof wikipediaEntry>>,
  excerpt: string
): NarrativeEvidenceSourceV3 {
  const revision = findRevision(
    input.sourceRevisions ?? [], `${entry.language}.wikipedia.org`, entry.title
  );
  const content = {
    sourceId: revision?.sourceId ?? `${entry.language}wiki:${entry.title}`,
    kind: 'wikipedia' as const,
    url: required(entry.wikipediaUrl, 'Wikipedia URL'),
    title: entry.title,
    revisionId: String(revision?.revisionId ?? `snapshot:${input.snapshot.capturedAt}`),
    capturedAt: revision?.revisionTimestamp ?? input.snapshot.capturedAt,
    language: entry.language,
    excerpt,
  };
  return { ...content, fingerprint: sourceFingerprint(content) };
}

function wikidataSource(
  input: NarrativeEvidenceCompilationInputV3,
  claimKey: string,
  claimValue: string
): NarrativeEvidenceSourceV3 {
  const entity = input.snapshot.wikidata[input.scene.ownerCanonicalId];
  const title = input.scene.ownerCanonicalId;
  const revision = findRevision(input.sourceRevisions ?? [], 'www.wikidata.org', title);
  const content = {
    sourceId: `${revision?.sourceId ?? `wikidata:${title}`}#${claimKey}`,
    kind: 'wikidata' as const,
    url: required(entity.wikidataUrl, 'Wikidata URL'),
    title,
    revisionId: String(revision?.revisionId ?? `snapshot:${input.snapshot.capturedAt}`),
    capturedAt: revision?.revisionTimestamp ?? input.snapshot.capturedAt,
    language: input.snapshot.language,
    excerpt: `${claimKey}: ${claimValue}`,
  };
  return { ...content, fingerprint: sourceFingerprint(content) };
}

function sentences(entry: NonNullable<ReturnType<typeof wikipediaEntry>>): string[] {
  const values = `${entry.description}\n${entry.body}`
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.replace(/\s+/gu, ' ').trim())
    .filter((sentence) => sentence.length >= 20 && sentence.length <= 500);
  return [...new Set(values)];
}

function supportingClaims(
  sentence: string,
  claims: Record<string, string>
): Array<[string, string]> {
  const normalizedSentence = normalize(sentence);
  return Object.entries(claims).filter(([key, value]) => {
    const normalizedValue = normalize(value.replace(/-00/g, ''));
    const year = value.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/u)?.[0];
    if (year && normalizedSentence.includes(year)) return true;
    if (!SENSITIVE_CLAIMS.has(key)) return false;
    const tokens = normalizedValue.split(' ').filter((token) => token.length >= 3);
    return tokens.length > 0 && tokens.every((token) => normalizedSentence.includes(token));
  });
}

function supportsRole(sentence: string, role: NarrativeEvidenceRoleV3): boolean {
  if (role === 'historical') {
    return /\b(?:1[0-9]{3}|20[0-9]{2})\b/u.test(sentence) || HISTORICAL.test(sentence);
  }
  return role === 'human' ? HUMAN.test(sentence) : OBSERVABLE.test(sentence);
}

function evidenceFact(
  input: NarrativeEvidenceCompilationInputV3,
  entry: NonNullable<ReturnType<typeof wikipediaEntry>>,
  sentence: string,
  role: NarrativeEvidenceRoleV3,
  claims: Array<[string, string]>,
  index: number
): NarrativeEvidenceFactV3 {
  const sensitive = /\b(?:1[0-9]{3}|20[0-9]{2})\b/u.test(sentence)
    || claims.some(([key]) => SENSITIVE_CLAIMS.has(key));
  const sources = [
    wikipediaSource(input, entry, sentence),
    ...claims.map(([key, value]) => wikidataSource(input, key, value)),
  ];
  const content = {
    factId: `${input.scene.sceneId}:evidence:${role}:${index + 1}`,
    ownerCanonicalId: input.scene.ownerCanonicalId,
    role,
    originalExcerpt: sentence,
    originalLanguage: entry.language,
    normalizedEs: sentence,
    relationSupport: role === 'historical' && /\b(?:1[0-9]{3}|20[0-9]{2})\b/u.test(sentence)
      ? ['direct', 'chronology'] as NarrativeClaimRelationSupportV3[]
      : ['direct'] as NarrativeClaimRelationSupportV3[],
    sensitive,
    allowsCausality: false,
    sources,
  };
  return { ...content, fingerprint: narrativeEvidenceFactFingerprintV3(content) };
}

export function compileNarrativeEvidenceSceneV3(
  input: NarrativeEvidenceCompilationInputV3
): NarrativeEvidenceRouteSceneV3 {
  required(input.scene.sceneId, 'sceneId');
  required(input.scene.name, 'scene name');
  required(input.scene.ownerCanonicalId, 'scene ownerCanonicalId');
  if (input.snapshot.schemaVersion !== 1 || input.snapshot.theme !== 'history'
    || !Number.isFinite(Date.parse(input.snapshot.capturedAt))) {
    throw new Error('narrative evidence source snapshot is invalid');
  }
  const entry = wikipediaEntry(input);
  const entity = input.snapshot.wikidata[input.scene.ownerCanonicalId];
  if (!entry || !entity?.wikidataClaims) {
    return {
      ...input.scene,
      evidenceFacts: [],
      readiness: {
        ready: false,
        missingRoles: [...ROLES],
        roleCounts: { observable: 0, historical: 0, human: 0 },
      },
    };
  }
  const entityClaims = entity.wikidataClaims;

  const allSentences = sentences(entry);
  const selected = new Map<NarrativeEvidenceRoleV3, NarrativeEvidenceFactV3>();
  const usedSentences = new Set<string>();
  for (const role of ROLES) {
    const candidates = allSentences.flatMap((sentence) => {
      if (!supportsRole(sentence, role)) return [];
      const claims = supportingClaims(sentence, entityClaims);
      const sensitive = /\b(?:1[0-9]{3}|20[0-9]{2})\b/u.test(sentence);
      return sensitive && claims.length === 0 ? [] : [{ sentence, claims }];
    });
    const candidate = candidates.find(({ sentence }) => !usedSentences.has(sentence))
      ?? candidates[0];
    if (!candidate) continue;
    usedSentences.add(candidate.sentence);
    selected.set(role, evidenceFact(
      input, entry, candidate.sentence, role, candidate.claims, selected.size
    ));
  }
  const evidenceFacts = ROLES.flatMap((role) => selected.get(role) ?? []);
  const roleCounts = Object.fromEntries(ROLES.map((role) => [
    role, evidenceFacts.filter((fact) => fact.role === role).length,
  ])) as Record<NarrativeEvidenceRoleV3, number>;
  const missingRoles = ROLES.filter((role) => roleCounts[role] === 0);
  return {
    ...input.scene,
    evidenceFacts,
    readiness: { ready: missingRoles.length === 0, missingRoles, roleCounts },
  };
}

export function selectNarrativeRouteEvidenceV3(
  routeScenes: NarrativeEvidenceRouteSceneV3[]
): { scenes: NarrativeEvidenceRouteSceneV3[]; rejectedSceneIds: string[] } {
  const ready = routeScenes.filter((scene) => scene.readiness.ready);
  if (ready.length < 3) {
    throw new Error('narrative route requires at least three evidence-ready scenes');
  }
  const middle = Math.ceil((ready.length - 1) / 2);
  const selected = ready.length === 3
    ? ready
    : [ready[0], ready[middle], ready[ready.length - 1]];
  return {
    scenes: selected,
    rejectedSceneIds: routeScenes.filter((scene) => !scene.readiness.ready)
      .map((scene) => scene.sceneId),
  };
}

export function buildNarrativeEvidenceCaseFromWorkbenchV3(
  rawWorkbench: EditorialWorkbenchV7,
  snapshot: PoiEnrichmentSnapshot,
  prominence: WikimediaProminenceSnapshotV6
): NarrativeEvidenceCaseV3 {
  const workbench = validateEditorialWorkbenchV7(rawWorkbench);
  const { fingerprint: _fingerprint, ...prominenceContent } = prominence;
  if (wikimediaProminenceFingerprintV6(prominenceContent) !== prominence.fingerprint) {
    throw new Error('narrative evidence prominence fingerprint changed');
  }
  if (snapshot.schemaVersion !== 1 || snapshot.theme !== 'history'
    || snapshot.language !== 'es'
    || normalize(snapshot.city) !== normalize(workbench.benchmark.cityKey)
    || prominence.cityKey !== workbench.benchmark.cityKey
    || prominence.language !== snapshot.language) {
    throw new Error('narrative evidence sources do not match the workbench context');
  }
  const storyPlan = workbench.snapshot.storyPlanCall?.value;
  if (!storyPlan) throw new Error('narrative evidence requires a story plan');
  const visitScenes = new Map(workbench.snapshot.scenes.map((scene) => [scene.sceneId, scene]));
  const storyScenes = new Map(storyPlan.scenes.map((scene) => [scene.sceneId, scene]));
  const compiled = workbench.expectedRoute.sceneIds.map((sceneId) => {
    const scene = visitScenes.get(sceneId);
    const story = storyScenes.get(sceneId);
    if (!scene || !story) throw new Error(`narrative evidence route scene ${sceneId} is incomplete`);
    return compileNarrativeEvidenceSceneV3({
      scene: {
        sceneId,
        name: scene.name,
        ownerCanonicalId: scene.primaryCanonicalId,
        contribution: story.main.contribution,
      },
      snapshot,
      sourceRevisions: prominence.sourceRevisions,
    });
  });
  const selection = selectNarrativeRouteEvidenceV3(compiled);
  const routeSceneIds = selection.scenes.map((scene) => scene.sceneId);
  const scenes = selection.scenes.map((scene, index): NarrativeEvidenceCaseSceneV3 => ({
    ...scene,
    routePosition: index + 1,
    previousSceneId: routeSceneIds[index - 1] ?? null,
    nextSceneId: routeSceneIds[index + 1] ?? null,
  }));
  const caseId = `${workbench.benchmark.caseId}:narrative-v3`;
  const routeFingerprint = editorialFingerprintV7({
    caseId,
    routeSceneIds,
    scenes: scenes.map((scene) => ({
      sceneId: scene.sceneId,
      ownerCanonicalId: scene.ownerCanonicalId,
      routePosition: scene.routePosition,
      previousSceneId: scene.previousSceneId,
      nextSceneId: scene.nextSceneId,
    })),
  });
  return {
    schemaVersion: NARRATIVE_EVIDENCE_SCHEMA_VERSION_V3,
    caseId,
    city: snapshot.city,
    theme: 'history',
    language: 'es-ES',
    promise: storyPlan.promise,
    centralQuestion: storyPlan.centralQuestion,
    routeFingerprint,
    sourceSnapshotFingerprint: editorialFingerprintV7({ snapshot, prominence }),
    rejectedSceneIds: selection.rejectedSceneIds,
    scenes,
  };
}

const OFFICIAL_OBSERVABLE = /\b(aguja|arco|armadura|bóveda|castillo|cúpula|edificio|fachada|fortific|galería|granito|jardín|material|muro|museo|paso|piedra|planta|plaza|puerta|torre|vano|ventana)\w*/iu;
const OFFICIAL_HUMAN = /\b(aliad|arquitect|autoridad|ayuntamiento|carlos|concurso|consejo|corte|diplomát|emperador|felipe|funcionari|gobierno|habit|kaiser|militar|monarca|orden|parlamento|personal|representante|rey|reina|resident|trabajador)\w*/iu;
const OFFICIAL_ACTION = /\b(adapt|abri|constru|decid|dirigi|diseñ|encarg|elig|ganó|impuls|instal|proclam|promov|reform|remodel|restaur|traslad)\w*/iu;

function officialRoleScore(fact: NarrativeSourceFactV2, role: NarrativeEvidenceRoleV3): number {
  const text = fact.normalizedEs;
  if (role === 'observable') {
    return (text.match(OFFICIAL_OBSERVABLE) ?? []).length * 4
      + (/\b(visible|cinco|tres|dos|central|lateral)\w*/iu.test(text) ? 2 : 0);
  }
  if (role === 'human') {
    return (OFFICIAL_HUMAN.test(text) ? 4 : 0)
      + (OFFICIAL_ACTION.test(text) ? 3 : 0)
      + ((text.match(/\b\p{Lu}[\p{L}’-]+/gu) ?? []).length >= 2 ? 1 : 0);
  }
  return (/\b(?:1[0-9]{3}|20[0-9]{2})\b/u.test(text) ? 4 : 0)
    + (/\b(siglo|años|después|desde|hasta|tras|durante)\b/iu.test(text) ? 2 : 0);
}

function assignOfficialRoles(
  facts: NarrativeSourceFactV2[],
  sceneId: string
): Array<{ role: NarrativeEvidenceRoleV3; fact: NarrativeSourceFactV2 }> {
  const candidates = [...facts].sort((left, right) => left.factId.localeCompare(right.factId));
  let best: { score: number; indexes: number[] } | null = null;
  for (let observable = 0; observable < candidates.length; observable += 1) {
    for (let historical = 0; historical < candidates.length; historical += 1) {
      for (let human = 0; human < candidates.length; human += 1) {
        const indexes = [observable, historical, human];
        if (new Set(indexes).size !== indexes.length) continue;
        const scores = ROLES.map((role, index) => (
          officialRoleScore(candidates[indexes[index]], role)
        ));
        if (scores.some((value) => value === 0)) continue;
        const score = scores.reduce((total, value) => total + value, 0);
        if (!best || score > best.score) best = { score, indexes };
      }
    }
  }
  if (!best) throw new Error(`official facts for ${sceneId} do not cover all evidence roles`);
  return ROLES.map((role, index) => ({ role, fact: candidates[best!.indexes[index]] }));
}

function officialSourceKind(url: string): NarrativeEvidenceSourceKindV3 {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('wikipedia.org')) return 'wikipedia';
  if (host.includes('wikidata.org')) return 'wikidata';
  if (host.includes('openstreetmap.org')) return 'osm';
  return 'official';
}

function officialEvidenceFact(
  sceneId: string,
  role: NarrativeEvidenceRoleV3,
  sourceFact: NarrativeSourceFactV2
): NarrativeEvidenceFactV3 {
  const sourceContent = {
    sourceId: sourceFact.factId,
    kind: officialSourceKind(sourceFact.sourceUrl),
    url: sourceFact.sourceUrl,
    title: sourceFact.sourceTitle,
    revisionId: `source-fact:${sourceFact.fingerprint}`,
    capturedAt: sourceFact.capturedAt,
    language: sourceFact.originalLanguage,
    excerpt: sourceFact.originalExcerpt,
  };
  const source = { ...sourceContent, fingerprint: sourceFingerprint(sourceContent) };
  const chronological = /\b(?:1[0-9]{3}|20[0-9]{2})\b/u.test(sourceFact.normalizedEs);
  const content = {
    factId: `${sceneId}:evidence:${role}:1`,
    ownerCanonicalId: sourceFact.ownerCanonicalId,
    role,
    originalExcerpt: sourceFact.originalExcerpt,
    originalLanguage: sourceFact.originalLanguage,
    normalizedEs: sourceFact.normalizedEs,
    relationSupport: chronological
      ? ['direct', 'chronology'] as NarrativeClaimRelationSupportV3[]
      : ['direct'] as NarrativeClaimRelationSupportV3[],
    sensitive: chronological || role === 'human',
    allowsCausality: false,
    sources: [source],
  };
  return { ...content, fingerprint: narrativeEvidenceFactFingerprintV3(content) };
}

export function buildNarrativeEvidenceCaseFromOfficialFactsV3(
  raw: NarrativeBenchmarkCaseV2
): NarrativeEvidenceCaseV3 {
  const input = validateNarrativeBenchmarkCaseV2(raw);
  const scenes = input.scenes.map((scene): NarrativeEvidenceCaseSceneV3 => {
    const evidenceFacts = assignOfficialRoles(scene.evidenceFacts, scene.sceneId)
      .map(({ role, fact }) => officialEvidenceFact(scene.sceneId, role, fact));
    return {
      sceneId: scene.sceneId,
      name: scene.name,
      ownerCanonicalId: scene.evidenceFacts[0].ownerCanonicalId,
      contribution: scene.contribution,
      routePosition: scene.routePosition,
      previousSceneId: scene.previousSceneId,
      nextSceneId: scene.nextSceneId,
      evidenceFacts,
      readiness: {
        ready: true,
        missingRoles: [],
        roleCounts: { observable: 1, historical: 1, human: 1 },
      },
    };
  });
  return {
    schemaVersion: NARRATIVE_EVIDENCE_SCHEMA_VERSION_V3,
    caseId: `${input.caseId}:evidence-v3`,
    city: input.city,
    theme: 'history',
    language: 'es-ES',
    promise: input.promise,
    centralQuestion: input.centralQuestion,
    routeFingerprint: input.routeFingerprint,
    sourceSnapshotFingerprint: editorialFingerprintV7(input),
    rejectedSceneIds: [],
    scenes,
  };
}
