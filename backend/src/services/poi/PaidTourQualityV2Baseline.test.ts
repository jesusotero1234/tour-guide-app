import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

interface OracleAnchor {
  qid: string;
  name: string;
}

interface RejectedRouteBaseline {
  statusAtCapture: string;
  qualityStatusAtCapture: string;
  textAuditScoreAtCapture: number;
  v2Decision: string;
  rejectionReasons: string[];
  stops: Array<{
    position: number;
    name: string;
    wikidataId: string;
  }>;
  evaluation: {
    legacyCoverage: number;
    v2Coverage: number;
    legacyCovered: OracleAnchor[];
    legacyMissing: OracleAnchor[];
    v2Covered: string[];
    v2Missing: string[];
  };
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, relativePath), 'utf8')) as T;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

describe('paid-tour quality v2 rejected baseline', () => {
  const baseline = readJson<RejectedRouteBaseline>('tours/madrid-history-es-120-rejected-baseline.json');
  const legacyOracle = readJson<Record<string, OracleAnchor[]>>('oracle/anchors.json')['Madrid/history'];
  const v2Oracle = readJson<{ stops: Array<{ name: string }> }>('oracle/madrid-history-es-120.json').stops;

  it('freezes the published route that the v2 gate must reject', () => {
    expect(baseline.statusAtCapture).toBe('published');
    expect(baseline.qualityStatusAtCapture).toBe('verified');
    expect(baseline.textAuditScoreAtCapture).toBe(100);
    expect(baseline.v2Decision).toBe('rejected');
    expect(baseline.rejectionReasons).toContain('essential_coverage_incomplete');
    expect(baseline.stops.map((stop) => stop.name)).toEqual([
      'Palace of Linares',
      'Puerta de Alcalá',
      'Fuente de Apolo',
      'Fuente de Neptuno',
      'Palacio de Santa Cruz',
      'Puerta de Toledo',
    ]);
  });

  it('recomputes the recorded 1/4 legacy and 1/7 v2 anchor coverage', () => {
    const routeQids = new Set(baseline.stops.map((stop) => stop.wikidataId));
    const routeNames = baseline.stops.map((stop) => normalizeName(stop.name));
    const legacyCovered = legacyOracle.filter((anchor) => routeQids.has(anchor.qid));
    const v2Covered = v2Oracle.filter((anchor) => (
      routeNames.some((name) => name === normalizeName(anchor.name))
    ));

    expect(legacyCovered).toEqual(baseline.evaluation.legacyCovered);
    expect(legacyOracle.filter((anchor) => !routeQids.has(anchor.qid))).toEqual(baseline.evaluation.legacyMissing);
    expect(legacyCovered.length / legacyOracle.length).toBe(baseline.evaluation.legacyCoverage);
    expect(v2Covered.map((anchor) => anchor.name)).toEqual(baseline.evaluation.v2Covered);
    expect(v2Oracle.filter((anchor) => !v2Covered.includes(anchor)).map((anchor) => anchor.name)).toEqual(
      baseline.evaluation.v2Missing
    );
    expect(v2Covered.length / v2Oracle.length).toBe(baseline.evaluation.v2Coverage);
  });

  it('keeps only structural route data and unique canonical identities', () => {
    const serialized = JSON.stringify(baseline);
    const wikidataIds = baseline.stops.map((stop) => stop.wikidataId);

    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('narration');
    expect(new Set(wikidataIds).size).toBe(wikidataIds.length);
    expect(baseline.stops.map((stop) => stop.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
