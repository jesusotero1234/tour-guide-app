import { createHash } from 'crypto';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';

export const WIKIMEDIA_PROMINENCE_SCHEMA_VERSION_V6 = 'wikimedia-prominence-v1' as const;

export type WikimediaProminenceSupportTypeV6 =
  | 'city_wikipedia_link'
  | 'wikivoyage_see_mention'
  | 'wikidata_sitelinks'
  | 'wikipedia_pageviews'
  | 'heritage_designation'
  | 'historical_evidence';

export interface WikimediaProminenceSupportV6 {
  supportId: string;
  type: WikimediaProminenceSupportTypeV6;
  value: string;
  sourceRef: string;
}

export interface WikimediaProminenceCandidateV6 {
  canonicalId: string;
  localName: string;
  wikipediaTitle: string | null;
  cityWikipediaLinked: boolean;
  wikivoyageSeeMentioned: boolean;
  wikivoyageSectionTitle: string | null;
  sitelinks: number;
  pageviews365: number | null;
  pageviewPercentile: number | null;
  heritageDesignation: boolean;
  support: WikimediaProminenceSupportV6[];
}

export interface WikimediaSourceRevisionV6 {
  sourceId: string;
  project: string;
  title: string;
  revisionId: number;
  revisionTimestamp: string;
}

export interface WikimediaProminenceSnapshotV6 {
  schemaVersion: typeof WIKIMEDIA_PROMINENCE_SCHEMA_VERSION_V6;
  cityKey: string;
  language: string;
  capturedAt: string;
  pageviewWindow: { start: string; end: string };
  sourceRevisions: WikimediaSourceRevisionV6[];
  candidates: WikimediaProminenceCandidateV6[];
  fingerprint: string;
}

export function wikimediaProminenceFingerprintV6(
  snapshot: Omit<WikimediaProminenceSnapshotV6, 'fingerprint'>
): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

export function validateWikimediaProminenceSnapshotV6(
  value: unknown,
  entities: EditorialEntityCandidateV5[],
  context: { cityKey: string; language: string }
): WikimediaProminenceSnapshotV6 {
  const root = objectValue(value, 'Wikimedia prominence snapshot');
  exactKeys(root, [
    'schemaVersion', 'cityKey', 'language', 'capturedAt', 'pageviewWindow',
    'sourceRevisions', 'candidates', 'fingerprint',
  ], 'Wikimedia prominence snapshot');
  if (root.schemaVersion !== WIKIMEDIA_PROMINENCE_SCHEMA_VERSION_V6
    || root.cityKey !== context.cityKey || root.language !== context.language) {
    throw new Error('Wikimedia prominence snapshot context changed');
  }
  if (typeof root.capturedAt !== 'string' || !Number.isFinite(Date.parse(root.capturedAt))) {
    throw new Error('Wikimedia prominence snapshot capturedAt is invalid');
  }
  const window = objectValue(root.pageviewWindow, 'pageviewWindow');
  exactKeys(window, ['start', 'end'], 'pageviewWindow');
  if (typeof window.start !== 'string' || typeof window.end !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(window.start) || !/^\d{4}-\d{2}-\d{2}$/.test(window.end)) {
    throw new Error('Wikimedia prominence pageview window is invalid');
  }
  if (!Array.isArray(root.sourceRevisions)) throw new Error('sourceRevisions must be an array');
  const sourceRevisions = root.sourceRevisions.map((item, index): WikimediaSourceRevisionV6 => {
    const revision = objectValue(item, `sourceRevisions[${index}]`);
    exactKeys(revision, [
      'sourceId', 'project', 'title', 'revisionId', 'revisionTimestamp',
    ], `sourceRevisions[${index}]`);
    if (typeof revision.sourceId !== 'string' || !revision.sourceId.trim()
      || typeof revision.project !== 'string' || !revision.project.trim()
      || typeof revision.title !== 'string' || !revision.title.trim()
      || !Number.isInteger(revision.revisionId) || (revision.revisionId as number) < 1
      || typeof revision.revisionTimestamp !== 'string'
      || !Number.isFinite(Date.parse(revision.revisionTimestamp))) {
      throw new Error(`sourceRevisions[${index}] is invalid`);
    }
    return revision as unknown as WikimediaSourceRevisionV6;
  });
  if (new Set(sourceRevisions.map((revision) => revision.sourceId)).size !== sourceRevisions.length) {
    throw new Error('Wikimedia prominence source revision IDs must be unique');
  }
  if (!Array.isArray(root.candidates)) throw new Error('prominence candidates must be an array');
  const expectedIds = entities.map((entity) => entity.canonicalId).sort();
  const expectedById = new Map(entities.map((entity) => [entity.canonicalId, entity]));
  const candidateRows = root.candidates.map((item, index) => (
    objectValue(item, `candidates[${index}]`)
  ));
  const candidateIds = candidateRows.map((candidate) => candidate.canonicalId);
  if (candidateIds.some((id) => typeof id !== 'string')
    || new Set(candidateIds as string[]).size !== expectedIds.length
    || [...candidateIds as string[]].sort().join(',') !== expectedIds.join(',')) {
    throw new Error('Wikimedia prominence must contain every canonical candidate exactly once');
  }
  const allowedSupportTypes = new Set<WikimediaProminenceSupportTypeV6>([
    'city_wikipedia_link', 'wikivoyage_see_mention', 'wikidata_sitelinks',
    'wikipedia_pageviews', 'heritage_designation', 'historical_evidence',
  ]);
  const allSupportIds = new Set<string>();
  const candidates = candidateRows.map((candidate, index): WikimediaProminenceCandidateV6 => {
    exactKeys(candidate, [
      'canonicalId', 'localName', 'wikipediaTitle', 'cityWikipediaLinked',
      'wikivoyageSeeMentioned', 'wikivoyageSectionTitle', 'sitelinks', 'pageviews365',
      'pageviewPercentile', 'heritageDesignation', 'support',
    ], `candidates[${index}]`);
    const canonicalId = candidate.canonicalId as string;
    if (candidate.localName !== expectedById.get(canonicalId)?.localName) {
      throw new Error(`candidates[${index}] identity name does not match ${canonicalId}`);
    }
    if (typeof candidate.localName !== 'string' || !candidate.localName.trim()
      || (candidate.wikipediaTitle !== null && typeof candidate.wikipediaTitle !== 'string')
      || typeof candidate.cityWikipediaLinked !== 'boolean'
      || typeof candidate.wikivoyageSeeMentioned !== 'boolean'
      || (candidate.wikivoyageSectionTitle !== null && typeof candidate.wikivoyageSectionTitle !== 'string')
      || !Number.isInteger(candidate.sitelinks) || (candidate.sitelinks as number) < 0
      || (candidate.pageviews365 !== null && (!Number.isFinite(candidate.pageviews365)
        || (candidate.pageviews365 as number) < 0))
      || (candidate.pageviewPercentile !== null && (!Number.isFinite(candidate.pageviewPercentile)
        || (candidate.pageviewPercentile as number) < 0 || (candidate.pageviewPercentile as number) > 1))
      || typeof candidate.heritageDesignation !== 'boolean'
      || !Array.isArray(candidate.support) || candidate.support.length < 1) {
      throw new Error(`candidates[${index}] is invalid`);
    }
    if (candidate.wikivoyageSeeMentioned !== (candidate.wikivoyageSectionTitle !== null)) {
      throw new Error(`candidates[${index}] Wikivoyage signal is inconsistent`);
    }
    const support = candidate.support.map((item, supportIndex): WikimediaProminenceSupportV6 => {
      const fact = objectValue(item, `candidates[${index}].support[${supportIndex}]`);
      exactKeys(fact, ['supportId', 'type', 'value', 'sourceRef'], `candidates[${index}].support[${supportIndex}]`);
      if (typeof fact.supportId !== 'string' || !fact.supportId.startsWith(`${canonicalId}:`)
        || !allowedSupportTypes.has(fact.type as WikimediaProminenceSupportTypeV6)
        || typeof fact.value !== 'string' || !fact.value.trim()
        || typeof fact.sourceRef !== 'string' || !fact.sourceRef.trim()) {
        throw new Error(`candidates[${index}] support must be candidate-owned and valid`);
      }
      if (allSupportIds.has(fact.supportId)) throw new Error('Prominence support IDs must be unique');
      allSupportIds.add(fact.supportId);
      return fact as unknown as WikimediaProminenceSupportV6;
    });
    return { ...candidate, support } as unknown as WikimediaProminenceCandidateV6;
  });
  if (typeof root.fingerprint !== 'string') throw new Error('Wikimedia prominence fingerprint is invalid');
  const withoutFingerprint: Omit<WikimediaProminenceSnapshotV6, 'fingerprint'> = {
    schemaVersion: WIKIMEDIA_PROMINENCE_SCHEMA_VERSION_V6,
    cityKey: root.cityKey as string,
    language: root.language as string,
    capturedAt: root.capturedAt as string,
    pageviewWindow: { start: window.start as string, end: window.end as string },
    sourceRevisions,
    candidates,
  };
  if (wikimediaProminenceFingerprintV6(withoutFingerprint) !== root.fingerprint) {
    throw new Error('Wikimedia prominence fingerprint changed');
  }
  return { ...withoutFingerprint, fingerprint: root.fingerprint };
}
