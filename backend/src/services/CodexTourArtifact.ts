import { Tour } from '../domain/entities/Tour';
import { TourRequest } from '../types/api';
import { TourLegV8 } from './poi/TourGeometryV8';
import { draftIntroduction, transferInstruction, NARRATION_RATES, NARRATION_POLICY_VERSION, tourLocale } from './tourReadiness/TourLanguage';

export const CODEX_TOUR_PIPELINE = 'codex-author-v8-app-1';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Codex artifact object');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid Codex artifact array');
  return value;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid Codex artifact text');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid Codex artifact number');
  return value;
}
function check(condition: boolean, reason: string): void {
  if (!condition) throw new Error('Invalid Codex artifact: ' + reason);
}

export function mapCodexTourArtifact(request: TourRequest, runId: string, rawReview: unknown, rawAuthor: unknown): Tour {
  const review = object(rawReview), author = object(rawAuthor), recorded = object(review.request);
  check(review.runId === runId && review.writerTransport === 'codex' && review.boundaryMigrationPassed === true, 'run or evidence mismatch');
  if (review.blueprintFingerprint !== undefined) {
    check(typeof review.blueprintFingerprint === 'string' && review.blueprintFingerprint.trim().length > 0, 'blueprint fingerprint must be nonblank string');
  }
  for (const key of ['city', 'country', 'countryCode', 'theme', 'language', 'durationMinutes'] as const) {
    check(recorded[key] === request[key], 'request mismatch: ' + key);
  }
  check(author.status === 'complete_needs_review' && author.publicationPassed === false, 'incomplete author result');
  check(array(author.missingStopIds).length === 0, 'missing stops');
  const route = array(object(review.route).stops).map(object);
  const scripts = array(author.stops).map(object);
  check(route.length >= 2 && route.length === scripts.length, 'stop count mismatch');
  const ids = route.map(stop => string(stop.stopId));
  check(new Set(ids).size === ids.length, 'duplicate stops');
  const geometry = object(review.geometry);
  check(geometry.status === 'walkable', 'route requires review before delivery');
  const guidedDurationMinutes = number(geometry.guidedDurationMinutes);
  check(guidedDurationMinutes > 0, 'invalid duration');
  const legs: TourLegV8[] = array(geometry.legs).map((raw, index) => {
    const leg = object(raw);
    check(leg.fromStopId === ids[index] && leg.toStopId === ids[index + 1], 'leg order mismatch');
    const fromStopId = string(leg.fromStopId), toStopId = string(leg.toStopId);
    if (leg.type === 'self_transfer') {
      check(leg.durationSeconds === null, 'invented transfer time');
      return { type: 'self_transfer', fromStopId, toStopId, durationSeconds: null };
    }
    check(leg.type === 'walking', 'invalid leg type');
    const durationSeconds = number(leg.durationSeconds);
    check(durationSeconds >= 0, 'negative walking duration');
    return { type: 'walking', fromStopId, toStopId, durationSeconds };
  });
  check(legs.length === route.length - 1, 'missing legs');
  const transferCount = legs.filter(leg => leg.type === 'self_transfer').length;
  check(transferCount === geometry.transferCount && transferCount <= 1, 'transfer count mismatch');
  check(geometry.externalTransferTimeIncluded === false, 'transfer time included');
  let findingCount = 0;
  let languageFindingCount = 0;
  const stopReviews: Array<{ stopId: string; findings: Array<{ sentenceId: string; classification: string; reason?: string }>; languageReview?: { matchesRequestedLanguage: boolean; naturalForListening: boolean; issues: string[] } }> = [];
  const places = route.map((stop, index) => {
    const written = scripts[index], script = object(written.script), audit = object(written.audit);
    check(written.stopId === ids[index] && script.stopId === ids[index] && written.status === 'audited', 'script order mismatch');
    check(audit.status === 'valid', 'incomplete audit');
    const auditValue = object(audit.value);
    const findings = array(auditValue.findings).map(object);
    const sentences = array(script.sentences).map(object);
    check(sentences.length > 0 && findings.length === sentences.length, 'incomplete sentence audit');
    const sentenceIds = sentences.map(sentence => string(sentence.sentenceId));
    check(new Set(sentenceIds).size === sentenceIds.length, 'duplicate sentences');
    const findingIds = findings.map(finding => string(finding.sentenceId));
    check(new Set(findingIds).size === sentenceIds.length && findingIds.every(id => sentenceIds.includes(id)), 'audit sentence mismatch');
    const stopFindings: Array<{ sentenceId: string; classification: string; reason?: string }> = [];
    findings.forEach(finding => {
      const classification = string(finding.classification);
      check(['supported', 'authorized_inference', 'unsupported', 'distorted', 'unclear'].includes(classification), 'invalid audit classification');
      if (!['supported', 'authorized_inference'].includes(classification)) findingCount++;
      const entry: { sentenceId: string; classification: string; reason?: string } = { sentenceId: string(finding.sentenceId), classification };
      if (finding.reason !== undefined) entry.reason = string(finding.reason);
      stopFindings.push(entry);
    });
    const languageReview = auditValue.languageReview;
    let validatedLanguageReview: { matchesRequestedLanguage: boolean; naturalForListening: boolean; issues: string[] } | undefined;
    if (review.blueprintFingerprint !== undefined) {
      check(languageReview !== undefined, 'missing languageReview');
    }
    if (languageReview !== undefined) {
      const lr = object(languageReview);
      check(typeof lr.matchesRequestedLanguage === 'boolean' && lr.matchesRequestedLanguage === true, 'languageReview matchesRequestedLanguage must be true');
      check(typeof lr.naturalForListening === 'boolean', 'languageReview naturalForListening must be boolean');
      const issues = array(lr.issues);
      check(issues.every(i => typeof i === 'string'), 'languageReview issues must be strings');
      languageFindingCount += issues.length;
      if (!lr.naturalForListening && issues.length === 0) languageFindingCount++;
      validatedLanguageReview = { matchesRequestedLanguage: true, naturalForListening: lr.naturalForListening as boolean, issues: issues as string[] };
    }
    const stopReview: { stopId: string; findings: Array<{ sentenceId: string; classification: string; reason?: string }>; languageReview?: { matchesRequestedLanguage: boolean; naturalForListening: boolean; issues: string[] } } = {
      stopId: ids[index],
      findings: stopFindings,
      ...(validatedLanguageReview ? { languageReview: validatedLanguageReview } : {}),
    };
    stopReviews.push(stopReview);
    const coordinates = object(stop.coordinates);
    const latitude = number(coordinates.lat), longitude = number(coordinates.lng);
    check(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180, 'invalid coordinates');
    const wikidata = string(stop.wikidataId);
    check(/^Q\d+$/.test(wikidata), 'invalid identity');
    let description = string(script.text);
    if (legs[index]?.type === 'self_transfer') description += '\n\n' + transferInstruction(string(route[index + 1].name), request.language);
    return { id: '', tourId: '', name: string(stop.name), description, latitude, longitude, position: index, metadata: { sourcePoi: { wikidata } } };
  });
  const allScriptText = places.map(place => place.description).join(' ');
  const wordCount = allScriptText.trim().split(/\s+/).filter(w => w.length > 0).length;
  const locale = tourLocale(request.language);
  const rate = NARRATION_RATES[locale];
  const narrationMinutes = Math.ceil(wordCount / rate.wordsPerMinute);
  const now = new Date().toISOString();
  return {
    id: '', city: request.city, country: request.country, countryCode: request.countryCode,
    theme: request.theme, language: request.language || 'es', durationMinutes: request.durationMinutes,
    status: 'review', introduction: draftIntroduction(request.city, request.language),
    places, createdAt: now, updatedAt: now,
    metadata: { generationPipeline: CODEX_TOUR_PIPELINE, codexAuthor: {
      runId, publicationPassed: false, findingCount, durationFit: string(geometry.durationFit),
      guidedDurationMinutes, transferCount, legs,
      languageFindingCount,
      narrationPolicyVersion: NARRATION_POLICY_VERSION,
      narrationMinutes,
      durationMeasured: false,
      narrationWithinTarget: author.delivery && typeof object(author.delivery).passed === 'boolean' ? object(author.delivery).passed as boolean : undefined,
      blueprintFingerprint: review.blueprintFingerprint !== undefined ? string(review.blueprintFingerprint) : undefined,
      stopReviews,
    } },
  };
}
