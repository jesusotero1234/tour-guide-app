import { readFileSync } from 'fs';
import { join } from 'path';
import { Tour } from '../../src/domain/entities/Tour';
import { TourQualityManualReview, evaluateTourQuality } from '../../src/services/tourQuality/TourQualityEvaluator';

type OracleEntry = Array<{ qid: string; name: string }> | {
  positive?: Array<{ qid: string; name: string }>;
  negative?: Array<{ qid: string; name: string }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const tourPath = process.argv[2];
if (!tourPath) {
  throw new Error('Usage: npm run quality:audit -- <tour.json> [manual-review.json]');
}

const raw = readJson<Tour | { tour: Tour }>(tourPath);
const tour = 'tour' in raw ? raw.tour : raw;
const manualReview = process.argv[3]
  ? readJson<TourQualityManualReview>(process.argv[3])
  : undefined;

const oracle = readJson<Record<string, OracleEntry>>(
  join(__dirname, '..', '..', 'fixtures', 'oracle', 'anchors.json')
);
const entry = oracle[`${tour.city}/${tour.theme}`];
const positive = Array.isArray(entry) ? entry : entry?.positive ?? [];
const negative = Array.isArray(entry) ? [] : entry?.negative ?? [];
const routeDiagnostics = (tour.metadata as { routeDiagnostics?: { estimatedTourMinutes?: unknown } } | undefined)
  ?.routeDiagnostics;

const result = evaluateTourQuality({
  tour,
  expectedAnchorQids: positive.map((anchor) => anchor.qid),
  offThemeQids: negative.map((anchor) => anchor.qid),
  estimatedDurationMinutes: typeof routeDiagnostics?.estimatedTourMinutes === 'number'
    ? routeDiagnostics.estimatedTourMinutes
    : undefined,
  manualReview,
});

console.log(JSON.stringify(result, null, 2));
