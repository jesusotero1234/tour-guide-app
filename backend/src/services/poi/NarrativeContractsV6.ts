import { createHash } from 'crypto';

export const NARRATIVE_ROUTE_BRIEF_SCHEMA_VERSION_V6 = 'narrative-route-brief-v6' as const;
export const NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6 = 'narrative-editorial-run-v6' as const;

export interface NarrativeRouteStopV6 {
  stopId: string;
  position: number;
  name: string;
  narrativeRole: string;
  wikidataId: string;
  wikidataUrl: string;
  wikipediaUrl: string | null;
  coordinates: { lat: number; lng: number };
  previousStopId: string | null;
  nextStopId: string | null;
}

export interface NarrativeRouteBriefV6 {
  schemaVersion: typeof NARRATIVE_ROUTE_BRIEF_SCHEMA_VERSION_V6;
  caseId: string;
  city: string;
  country: string;
  language: string;
  theme: string;
  durationMinutes: number;
  stops: NarrativeRouteStopV6[];
  fingerprint: string;
}

export type NarrativeCalibrationStageV6 = 'editorial_engine' | 'research';

interface NarrativeEditorialRunBaseV6 {
  schemaVersion: typeof NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6;
  runId: string;
  caseId: string;
  createdAt: string;
  diagnostics: { privateArtifactPath: string };
}

export interface NarrativeStopHumanReviewV6 {
  stopId: string;
  decision: 'pending' | 'accepted' | 'rejected';
  reason?: string;
}

export type NarrativeEditorialRunV6 = NarrativeEditorialRunBaseV6 & (
  | { status: 'source_capture_failed'; reason: string }
  | { status: 'evidence_review_required'; stopIds: string[]; reasons: string[] }
  | { status: 'protocol_failed'; stage: string; reason: string }
  | { status: 'model_calibration_failed'; stage: NarrativeCalibrationStageV6; reason: string }
  | { status: 'draft_review_required'; openIssueIds: string[]; tourFingerprint: string }
  | {
    status: 'ready_for_human_gate';
    tourFingerprint: string;
    stopReviews: NarrativeStopHumanReviewV6[];
  }
  | {
    status: 'human_changes_requested';
    tourFingerprint: string;
    requestedBy: string;
    requestedAt: string;
    reason: string;
  }
  | {
    status: 'approved';
    tourFingerprint: string;
    approval: {
      author: string;
      approvedAt: string;
      reason: string;
      tourFingerprint: string;
    };
  }
);

export interface NarrativeTourFingerprintInputV6 {
  routeFingerprint: string;
  dossierFingerprints: string[];
  scripts: Array<{ stopId: string; text: string }>;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requiredDate(value: unknown, label: string): string {
  const date = requiredString(value, label);
  if (Number.isNaN(Date.parse(date))) throw new Error(`${label} must be an ISO date`);
  return date;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

export function narrativeFingerprintV6(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex');
}

export function narrativeTourFingerprintV6(input: NarrativeTourFingerprintInputV6): string {
  return narrativeFingerprintV6(input);
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function stopId(value: string): string {
  return normalized(value).replace(/\s+/g, '-');
}

function significantTokens(value: string): Set<string> {
  const ignored = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'toledo']);
  return new Set(normalized(value).split(' ').filter((token) => token.length > 2 && !ignored.has(token)));
}

function wikipediaUrlFor(
  names: string[],
  wikipedia: Record<string, unknown>
): string | null {
  let best: { score: number; url: string } | null = null;
  for (const [key, raw] of Object.entries(wikipedia)) {
    if (!key.startsWith('es:')) continue;
    const entry = objectValue(raw, `wikipedia.${key}`);
    if (typeof entry.wikipediaUrl !== 'string') continue;
    const pageName = normalized(key.slice(3));
    const pageTokens = significantTokens(pageName);
    const score = Math.max(...names.map((name) => {
      const expected = normalized(name);
      if (pageName === expected) return 100;
      if (pageName.includes(expected) || expected.includes(pageName)) return 50;
      return [...significantTokens(expected)].filter((token) => pageTokens.has(token)).length;
    }));
    if (score > 0 && (!best || score > best.score)) best = { score, url: entry.wikipediaUrl };
  }
  return best?.url ?? null;
}

export function buildNarrativeRouteBriefV6(input: {
  candidates: unknown;
  oracle: unknown;
  sources: unknown;
  country: string;
}): NarrativeRouteBriefV6 {
  const candidates = objectValue(input.candidates, 'candidates');
  const oracle = objectValue(input.oracle, 'oracle');
  const sources = objectValue(input.sources, 'sources');
  const city = requiredString(oracle.city, 'oracle.city');
  const theme = requiredString(oracle.theme, 'oracle.theme');
  const language = requiredString(oracle.language, 'oracle.language');
  const durationMinutes = oracle.durationMinutes;
  if (!Number.isInteger(durationMinutes) || Number(durationMinutes) <= 0) {
    throw new Error('oracle.durationMinutes must be a positive integer');
  }
  if (candidates.city !== city || candidates.theme !== theme
    || sources.city !== city || sources.theme !== theme || sources.language !== language) {
    throw new Error('route fixtures describe different cases');
  }
  if (!Array.isArray(candidates.candidates) || !Array.isArray(oracle.stops)) {
    throw new Error('route fixtures must contain candidates and curated stops');
  }
  const candidateItems = candidates.candidates as unknown[];
  const oracleStops = oracle.stops as unknown[];
  const wikidata = objectValue(sources.wikidata, 'sources.wikidata');
  const wikipedia = objectValue(sources.wikipedia, 'sources.wikipedia');
  const ids = oracleStops.map((raw, position) => {
    const stop = objectValue(raw, `oracle.stops[${position}]`);
    return stopId(requiredString(stop.name, `oracle.stops[${position}].name`));
  });
  if (new Set(ids).size !== ids.length) throw new Error('route stop IDs must be unique');

  const stops = oracleStops.map((raw, position): NarrativeRouteStopV6 => {
    const stop = objectValue(raw, `oracle.stops[${position}]`);
    const wikidataId = requiredString(stop.qid, `oracle.stops[${position}].qid`);
    const candidateRaw = candidateItems.find((item) => (
      objectValue(item, 'candidate').wikidataId === wikidataId
    ));
    if (!candidateRaw) throw new Error(`curated stop ${wikidataId} is missing from candidates`);
    const candidate = objectValue(candidateRaw, `candidate ${wikidataId}`);
    const coordinates = objectValue(candidate.coordinates, `candidate ${wikidataId}.coordinates`);
    const lat = coordinates.lat;
    const lng = coordinates.lng;
    if (typeof lat !== 'number' || lat < -90 || lat > 90
      || typeof lng !== 'number' || lng < -180 || lng > 180) {
      throw new Error(`candidate ${wikidataId} has invalid coordinates`);
    }
    const identity = objectValue(wikidata[wikidataId], `sources.wikidata.${wikidataId}`);
    const translations = objectValue(identity.nameTranslations, `${wikidataId}.nameTranslations`);
    const name = requiredString(stop.name, `oracle.stops[${position}].name`);
    return {
      stopId: ids[position],
      position,
      name,
      narrativeRole: requiredString(stop.narrativeRole, `${wikidataId}.narrativeRole`),
      wikidataId,
      wikidataUrl: requiredString(identity.wikidataUrl, `${wikidataId}.wikidataUrl`),
      wikipediaUrl: wikipediaUrlFor([
        name,
        requiredString(candidate.name, `${wikidataId}.candidateName`),
        typeof translations.es === 'string' ? translations.es : name,
      ], wikipedia),
      coordinates: { lat, lng },
      previousStopId: ids[position - 1] ?? null,
      nextStopId: ids[position + 1] ?? null,
    };
  });
  const briefWithoutFingerprint = {
    schemaVersion: NARRATIVE_ROUTE_BRIEF_SCHEMA_VERSION_V6,
    caseId: `${normalized(city).replace(/\s+/g, '-')}-${theme}-${language}-${durationMinutes}`,
    city,
    country: requiredString(input.country, 'country'),
    language,
    theme,
    durationMinutes: Number(durationMinutes),
    stops,
  };
  return { ...briefWithoutFingerprint, fingerprint: narrativeFingerprintV6(briefWithoutFingerprint) };
}

export function validateNarrativeEditorialRunV6(raw: unknown): NarrativeEditorialRunV6 {
  const run = objectValue(raw, 'narrative editorial run');
  if (run.schemaVersion !== NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6) {
    throw new Error('invalid narrative editorial run schema version');
  }
  requiredString(run.runId, 'runId');
  requiredString(run.caseId, 'caseId');
  requiredDate(run.createdAt, 'createdAt');
  const diagnostics = objectValue(run.diagnostics, 'diagnostics');
  requiredString(diagnostics.privateArtifactPath, 'diagnostics.privateArtifactPath');
  const status = requiredString(run.status, 'status');
  if (status === 'model_calibration_failed') {
    if (run.stage !== 'editorial_engine' && run.stage !== 'research') {
      throw new Error('invalid calibration stage');
    }
    requiredString(run.reason, 'reason');
  } else if (status === 'ready_for_human_gate') {
    requiredString(run.tourFingerprint, 'tourFingerprint');
    if (!Array.isArray(run.stopReviews) || run.stopReviews.length === 0) {
      throw new Error('ready run requires stop reviews');
    }
    for (const review of run.stopReviews) {
      const item = objectValue(review, 'stop review');
      requiredString(item.stopId, 'stop review stopId');
      if (!['pending', 'accepted', 'rejected'].includes(String(item.decision))) {
        throw new Error('invalid stop review decision');
      }
    }
  } else if (![
    'source_capture_failed', 'evidence_review_required', 'protocol_failed',
    'draft_review_required', 'human_changes_requested', 'approved',
  ].includes(status)) {
    throw new Error(`unknown narrative editorial run status: ${status}`);
  }
  return raw as NarrativeEditorialRunV6;
}

export function approveNarrativeEditorialRunV6(
  run: NarrativeEditorialRunV6,
  approval: { author: string; approvedAt: string; reason: string; tourFingerprint: string }
): NarrativeEditorialRunV6 {
  if (run.status !== 'ready_for_human_gate') throw new Error('only a ready run can be approved');
  if (approval.tourFingerprint !== run.tourFingerprint) {
    throw new Error('approval fingerprint does not match the exact tour');
  }
  if (run.stopReviews.some((review) => review.decision !== 'accepted')) {
    throw new Error('all stop reviews must be accepted before tour approval');
  }
  requiredString(approval.author, 'approval.author');
  requiredDate(approval.approvedAt, 'approval.approvedAt');
  requiredString(approval.reason, 'approval.reason');
  return {
    schemaVersion: run.schemaVersion,
    runId: run.runId,
    caseId: run.caseId,
    createdAt: run.createdAt,
    diagnostics: run.diagnostics,
    status: 'approved',
    tourFingerprint: run.tourFingerprint,
    approval: { ...approval },
  };
}
