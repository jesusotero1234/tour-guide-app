import { createHash } from 'crypto';

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
