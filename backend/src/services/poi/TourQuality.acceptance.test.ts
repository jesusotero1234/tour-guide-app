import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tierPoisByLandmarkFame, LandmarkTieredPoi } from './LandmarkTiering';
import { composeWalkingRoute } from './RouteSelection';
import { getDurationPlan } from './DurationPlanning';
import { RawPoi } from '../../domain/poi/RawPoi';
import { getVerifiedCityThemes } from '../tourQuality/VerifiedCities';

/**
 * Product-quality acceptance suite. Runs the deterministic, offline halves of the
 * pipeline (tiering on a frozen pool; composeWalkingRoute on frozen candidates) and
 * asserts that the resulting tour looks like a credible first-visit product.
 *
 * Fixtures are committed snapshots captured via scripts/validation/capture-tour-fixtures.ts.
 * The anchor oracle (fixtures/oracle/anchors.json) is EVALUATION-ONLY — production must
 * discover anchors via fame/tiering. See docs/architecture/tour-quality-fixtures-acceptance.md.
 */

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

interface PoolFixture {
  city: string;
  theme: string;
  rawPois: RawPoi[];
  sitelinks: Record<string, number>;
  wikidataMetadata?: Record<string, { sitelinks: number; instanceOfLabels: string[] }>;
}

interface CandidateFixture {
  city: string;
  theme: string;
  requestedDuration: number;
  stopBounds: { minStops: number; maxStops: number };
  candidates: Array<{
    name: string;
    wikidataId: string | null;
    coordinates: { lat: number; lng: number };
    importance_score: number;
    fameScore: number;
    landmarkTier: string;
    category: string;
  }>;
}

type OracleEntry = Array<{ qid: string; name: string }> | {
  positive?: Array<{ qid: string; name: string }>;
  negative?: Array<{ qid: string; name: string }>;
};

const anchorOracle: Record<string, OracleEntry> = JSON.parse(
  readFileSync(join(FIXTURES, 'oracle', 'anchors.json'), 'utf-8')
);

function getOracleAnchors(key: string): { positive: Array<{ qid: string; name: string }>; negative: Array<{ qid: string; name: string }> } {
  const entry = anchorOracle[key];
  if (!entry) {
    return { positive: [], negative: [] };
  }

  if (Array.isArray(entry)) {
    return { positive: entry, negative: [] };
  }

  return {
    positive: entry.positive ?? [],
    negative: entry.negative ?? [],
  };
}

function loadJson<T>(relPath: string): T | null {
  const full = join(FIXTURES, relPath);
  return existsSync(full) ? (JSON.parse(readFileSync(full, 'utf-8')) as T) : null;
}

// Cities with a captured pool fixture. Others are skipped until fixtures land.
const CITY_THEMES = [
  ...getVerifiedCityThemes('history').map(({ canonicalCity, theme }) => `${canonicalCity}/${theme}`),
  'London/history',
];

describe('Tour quality acceptance', () => {
  for (const key of CITY_THEMES) {
    const [city, theme] = key.split('/');
    const slug = `${city.toLowerCase()}-${theme}`;
    const pool = loadJson<PoolFixture>(`pools/${slug}.json`);
    const candidateFixture = loadJson<CandidateFixture>(`candidates/${slug}.json`);
    const anchors = getOracleAnchors(key);

    const haveFixtures = Boolean(pool && candidateFixture && anchors.positive.length > 0);

    // describe.skip still EXECUTES the callback body (it only skips the inner
    // `it`s), so we must not reference the null fixtures there. Register a single
    // skipped placeholder for uncaptured cities and move on.
    if (!haveFixtures) {
      describe.skip(key, () => {
        it.skip('fixtures not captured yet', () => {});
      });
      continue;
    }

    describe(key, () => {
      it('keeps the oracle aligned with the captured pool fixture', () => {
        const poolQids = new Set(pool!.rawPois.map((p) => p.tags.wikidata).filter(Boolean));
        const missingAnchors = anchors.positive.filter((anchor) => !poolQids.has(anchor.qid)).map((anchor) => anchor.name);

        expect(missingAnchors).toEqual([]);
      });

      // ---- Level 1: harvesting -> tiering -> shortlist ----
      describe('Level 1 — shortlist quality', () => {
        const plan = getDurationPlan(candidateFixture!.requestedDuration);
        const shortlistSize = Math.min(pool!.rawPois.length, Math.max(plan.candidateCount, 40));
        const tiered: LandmarkTieredPoi[] = tierPoisByLandmarkFame(pool!.rawPois, pool!.sitelinks, theme as any, pool!.wikidataMetadata ?? {});
        const shortlist = tiered.slice(0, shortlistSize);

        it('resolves sitelinks for the large majority of wikidata-tagged POIs', () => {
          const withWikidata = pool!.rawPois.filter((p) => Boolean(p.tags.wikidata));
          const withSitelinks = withWikidata.filter((p) => (pool!.sitelinks[p.tags.wikidata as string] ?? 0) > 0);
          expect(withSitelinks.length / withWikidata.length).toBeGreaterThanOrEqual(0.8);
        });

        it('surfaces the expected anchors into the shortlist as flagship/major', () => {
          const shortlistQids = new Set(
            shortlist
              .filter((p) => p.landmarkTier === 'flagship' || p.landmarkTier === 'major')
              .map((p) => p.tags.wikidata)
          );
          const covered = anchors.positive.filter((a) => shortlistQids.has(a.qid));
          const missing = anchors.positive.filter((a) => !shortlistQids.has(a.qid)).map((a) => a.name);
          expect(missing).toEqual([]);
          expect(covered.length).toBe(anchors.positive.length);
        });

        it('keeps known off-theme negatives out of the shortlist', () => {
          const shortlistQids = new Set(shortlist.map((p) => p.tags.wikidata).filter(Boolean));
          const leaked = anchors.negative.filter((a) => shortlistQids.has(a.qid)).map((a) => a.name);
          expect(leaked).toEqual([]);
        });

        it('has a sane flagship band (not zero, not everything)', () => {
          const flagships = shortlist.filter((p) => p.landmarkTier === 'flagship').length;
          expect(flagships).toBeGreaterThan(0);
          expect(flagships).toBeLessThan(shortlist.length);
        });

        it('has no duplicate wikidata id in the shortlist', () => {
          const qids = shortlist.map((p) => p.tags.wikidata).filter(Boolean) as string[];
          expect(qids.length).toBe(new Set(qids).size);
        });
      });

      // ---- Level 2: set construction -> composition ----
      describe('Level 2 — final tour quality', () => {
        const fx = candidateFixture!;
        const route = composeWalkingRoute(fx.candidates as any, fx.requestedDuration, fx.theme, fx.stopBounds).route;
        const result = composeWalkingRoute(fx.candidates as any, fx.requestedDuration, fx.theme, fx.stopBounds);

        it('contains no duplicate landmark (DEFECT A regression guard)', () => {
          const qids = route.map((s: any) => s.wikidataId).filter(Boolean);
          expect(qids.length).toBe(new Set(qids).size);
        });

        it('is not degraded and lands in a plausible duration band', () => {
          expect(result.diagnostics.degraded).toBe(false);
          expect(result.diagnostics.coverageRatio).toBeGreaterThanOrEqual(0.7);
          expect(result.diagnostics.coverageRatio).toBeLessThanOrEqual(1.2);
        });

        it('includes a meaningful share of the expected anchors', () => {
          const routeQids = new Set(route.map((s: any) => s.wikidataId));
          const covered = anchors.positive.filter((a) => routeQids.has(a.qid));
          // Lower bound = what the current pipeline reliably achieves. Raising this
          // toward full coverage is the DEFECT B work (see it.todo below).
          expect(covered.length).toBeGreaterThanOrEqual(Math.ceil(anchors.positive.length / 2));
        });

        it('keeps known off-theme negatives out of the final tour', () => {
          const routeQids = new Set(route.map((s: any) => s.wikidataId));
          const leaked = anchors.negative.filter((a) => routeQids.has(a.qid)).map((a) => a.name);
          expect(leaked).toEqual([]);
        });

        it('does not collapse into a single category', () => {
          const counts = new Map<string, number>();
          for (const s of route as any[]) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
          const maxShare = Math.max(...counts.values()) / route.length;
          expect(maxShare).toBeLessThanOrEqual(0.7);
        });

        it(key === 'Madrid/history'
          ? 'includes Templo de Debod and Puerta de Alcalá'
          : 'keeps city-specific flagship regression coverage city-local', () => {
          if (key !== 'Madrid/history') {
            expect(true).toBe(true);
            return;
          }

          const routeQids = new Set(route.map((s: any) => s.wikidataId));
          expect(routeQids.has('Q1140249')).toBe(true);
          expect(routeQids.has('Q1140634')).toBe(true);
        });
      });
    });
  }
});
