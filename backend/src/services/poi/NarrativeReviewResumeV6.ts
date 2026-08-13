import {
  NarrativeRouteBriefV6,
  narrativeTourFingerprintV6,
} from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NarrativeScriptV6,
  assignNarrativeSentenceIdsV6,
} from './NarrativeEditorialV6';

export const NARRATIVE_REVIEW_PATCH_SCHEMA_VERSION_V6 = 'narrative-review-patch-v6' as const;

export interface NarrativeReviewPatchV6 {
  schemaVersion: typeof NARRATIVE_REVIEW_PATCH_SCHEMA_VERSION_V6;
  runId: string;
  tourFingerprint: string;
  replacements: Array<{
    stopId: string;
    sentenceId: string;
    before: string;
    after: string;
  }>;
}

export interface NarrativeResumeReviewV6 {
  runId: string;
  tourFingerprint: string;
  scripts: Array<{ stopId: string; text: string }>;
}

export interface PreparedNarrativeResumeReviewV6 {
  sourceRunId: string;
  sourceTourFingerprint: string;
  patchedTourFingerprint: string;
  scripts: NarrativeScriptV6[];
  auditedStopIds: string[];
  patch: NarrativeReviewPatchV6;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

function exactStopSet(observed: string[], expected: string[], label: string): void {
  if (observed.length !== expected.length || new Set(observed).size !== expected.length
    || expected.some((stopId) => !observed.includes(stopId))) {
    throw new Error(`${label} must contain the exact route stop set`);
  }
}

export function validateNarrativeReviewPatchV6(raw: unknown): NarrativeReviewPatchV6 {
  const patch = objectValue(raw, 'review patch');
  if (patch.schemaVersion !== NARRATIVE_REVIEW_PATCH_SCHEMA_VERSION_V6) {
    throw new Error('invalid review patch schema version');
  }
  requiredString(patch.runId, 'review patch runId');
  requiredString(patch.tourFingerprint, 'review patch tourFingerprint');
  if (!Array.isArray(patch.replacements) || patch.replacements.length === 0) {
    throw new Error('review patch requires replacements');
  }
  const seen = new Set<string>();
  for (const [index, rawReplacement] of patch.replacements.entries()) {
    const replacement = objectValue(rawReplacement, `review patch replacement ${index}`);
    const stopId = requiredString(replacement.stopId, `replacement ${index} stopId`);
    const sentenceId = requiredString(replacement.sentenceId, `replacement ${index} sentenceId`);
    requiredString(replacement.before, `replacement ${index} before`);
    requiredString(replacement.after, `replacement ${index} after`);
    if (sentenceId.split('-S')[0] !== stopId) {
      throw new Error(`replacement ${sentenceId} does not belong to stop ${stopId}`);
    }
    if (seen.has(sentenceId)) throw new Error(`duplicate review patch sentence ${sentenceId}`);
    seen.add(sentenceId);
  }
  return raw as NarrativeReviewPatchV6;
}

export function prepareNarrativeResumeReviewV6(input: {
  review: NarrativeResumeReviewV6;
  patch: NarrativeReviewPatchV6;
  route: NarrativeRouteBriefV6;
  dossiers: NarrativeDossierV6[];
  reviewStopIds: string[];
}): PreparedNarrativeResumeReviewV6 {
  const expectedStopIds = input.route.stops.map((stop) => stop.stopId);
  const scriptStopIds = input.review.scripts.map((script) => script.stopId);
  exactStopSet(scriptStopIds, expectedStopIds, 'source review');
  exactStopSet(input.dossiers.map((dossier) => dossier.stopId), expectedStopIds, 'dossiers');
  if (input.patch.runId !== input.review.runId) {
    throw new Error('review patch runId does not match the source review');
  }
  if (input.patch.tourFingerprint !== input.review.tourFingerprint) {
    throw new Error('review patch tour fingerprint does not match the source review');
  }
  const sourceFingerprint = narrativeTourFingerprintV6({
    routeFingerprint: input.route.fingerprint,
    dossierFingerprints: input.route.stops.map((stop) => (
      input.dossiers.find((dossier) => dossier.stopId === stop.stopId) as NarrativeDossierV6
    ).fingerprint),
    scripts: input.review.scripts,
  });
  if (sourceFingerprint !== input.review.tourFingerprint) {
    throw new Error('source review tour fingerprint cannot be reproduced');
  }
  const patchStopIds = [...new Set(input.patch.replacements.map((replacement) => replacement.stopId))];
  exactStopSet(patchStopIds, input.reviewStopIds, 'review patch');

  const replacements = new Map(input.patch.replacements.map((replacement) => [
    replacement.sentenceId,
    replacement,
  ]));
  const scripts = input.review.scripts.map(({ stopId, text }) => {
    const source = assignNarrativeSentenceIdsV6(stopId, text);
    const texts = source.sentences.map((sentence) => {
      const replacement = replacements.get(sentence.sentenceId);
      if (!replacement) return sentence.text;
      if (sentence.text !== replacement.before) {
        throw new Error(`review patch before text does not match ${sentence.sentenceId}`);
      }
      replacements.delete(sentence.sentenceId);
      return replacement.after;
    });
    const patched = assignNarrativeSentenceIdsV6(stopId, texts.join(' '));
    if (patched.sentences.length !== source.sentences.length) {
      throw new Error(`review patch cannot add or remove sentences in ${stopId}`);
    }
    return patched;
  });
  if (replacements.size > 0) {
    throw new Error(`review patch references unknown sentence ${replacements.keys().next().value}`);
  }
  for (const source of input.review.scripts) {
    if (input.reviewStopIds.includes(source.stopId)) continue;
    const patched = scripts.find((script) => script.stopId === source.stopId) as NarrativeScriptV6;
    if (patched.text !== source.text) throw new Error(`unpatched stop ${source.stopId} changed`);
  }
  const patchedTourFingerprint = narrativeTourFingerprintV6({
    routeFingerprint: input.route.fingerprint,
    dossierFingerprints: input.route.stops.map((stop) => (
      input.dossiers.find((dossier) => dossier.stopId === stop.stopId) as NarrativeDossierV6
    ).fingerprint),
    scripts: scripts.map((script) => ({ stopId: script.stopId, text: script.text })),
  });
  return {
    sourceRunId: input.review.runId,
    sourceTourFingerprint: sourceFingerprint,
    patchedTourFingerprint,
    scripts,
    auditedStopIds: [...input.reviewStopIds],
    patch: input.patch,
  };
}
