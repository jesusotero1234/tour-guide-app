import { readFileSync } from 'fs';
import { join } from 'path';
import {
  EditorialWorkbenchV7,
  replayEditorialWorkbenchV7,
  validateEditorialWorkbenchV7,
} from './EditorialWorkbenchV7';

const FIXTURE = join(
  __dirname, '..', '..', '..', 'fixtures', 'editorial-v7', 'madrid-history-es-120.json'
);

function loadFixture(): EditorialWorkbenchV7 {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as EditorialWorkbenchV7;
}

describe('Madrid editorial workbench v7', () => {
  it('freezes three blind cards with identical review fields and honest time bases', () => {
    const fixture = validateEditorialWorkbenchV7(loadFixture());

    expect(fixture.blindReviewCards).toHaveLength(3);
    expect(fixture.blindReviewCards.map((card) => Object.keys(card).sort()))
      .toEqual(Array(3).fill(Object.keys(fixture.blindReviewCards[0]).sort()));
    expect(fixture.blindReviewCards.map((card) => card.walkingMeters)).toEqual([
      4967, 3067.6, 1606.7,
    ]);
    expect(fixture.blindReviewCards.every((card) => (
      card.durationBasis === 'walking_osrm+planned_words+explicit_observations'
      && card.map.length === card.stops.length
      && card.moduleOptions.length === card.stops.length
    ))).toBe(true);
  });

  it('keeps benchmark requirements separate from its diagnostic reference route', () => {
    const fixture = validateEditorialWorkbenchV7(loadFixture());
    const referenceSceneIds = fixture.benchmark.diagnosticReferenceRoutes[0].sceneIds;

    expect(fixture.benchmark.mustVisitCanonicalIds).toEqual(['Q171517', 'Q1123493', 'Q427163']);
    expect(referenceSceneIds).toHaveLength(7);
    expect(fixture.benchmark.mustVisitCanonicalIds).not.toContain(referenceSceneIds[1]);
  });

  it('preserves Villa municipal evidence and explicit Cibeles member ownership', () => {
    const fixture = validateEditorialWorkbenchV7(loadFixture());
    const villa = fixture.snapshot.scenes.find((scene) => scene.sceneId === 'villa')!;
    const cibeles = fixture.snapshot.scenes.find((scene) => scene.sceneId === 'cibeles')!;

    expect(villa.facts.map((fact) => fact.role).sort()).toEqual([
      'distinctive', 'historical_context', 'local_function', 'observable',
    ]);
    expect(villa.facts.find((fact) => fact.role === 'local_function')?.value)
      .toMatch(/City Council|municipal/i);
    expect(cibeles.memberCanonicalIds).toEqual(['Q1537446', 'Q2736564', 'Q1849031']);
    expect(new Set(cibeles.facts.map((fact) => fact.ownerCanonicalId))).toEqual(
      new Set(cibeles.memberCanonicalIds)
    );
  });

  it('replays the exact route, modules, draft decision, and layered fingerprints', async () => {
    const fixture = validateEditorialWorkbenchV7(loadFixture());
    const replayed = await replayEditorialWorkbenchV7(fixture);

    expect(replayed.snapshot).toEqual(fixture.snapshot);
    expect(replayed.snapshot.optimization).toMatchObject({
      status: 'selected',
      route: {
        sceneIds: ['palace', 'almudena', 'villa', 'mayor', 'sol', 'cibeles', 'alcala'],
        metrics: { walkingMeters: 3067.6, walkingMinutes: 41.23, maxSegmentMeters: 976.1 },
      },
    });
    expect(replayed.snapshot.status).toBe('draft_only');
    expect(replayed.externalGates).toEqual({
      blindReview: 'pending', realAudio: 'pending', calibration: 'pending',
      sealedHoldouts: 'pending', streetAudit: 'pending',
    });
  });

  it('rejects expected-route metadata that disagrees with the frozen optimization', () => {
    const fixture = loadFixture();
    fixture.expectedRoute.walkingMeters += 1;

    expect(() => validateEditorialWorkbenchV7(fixture))
      .toThrow('v7 workbench optimization changed the expected route');
  });
});

describe.each([
  {
    fixtureName: 'berlin-history-de-120.json',
    route: ['checkpoint', 'potsdamer', 'holocaust', 'brandenburg', 'reichstag', 'neue-wache', 'palace', 'museum-island'],
    walkingMeters: 5164.7,
    walkingMinutes: 68.87,
    maxSegmentMeters: 1494,
    recommendedDurationMinutes: 90,
  },
  {
    fixtureName: 'paris-history-en-120.json',
    route: ['notre-dame', 'sainte-chapelle', 'conciergerie', 'saint-jacques', 'samaritaine', 'louvre', 'carrousel', 'palais-royal'],
    walkingMeters: 3230.8,
    walkingMinutes: 43.56,
    maxSegmentMeters: 840.1,
    recommendedDurationMinutes: 60,
  },
])('v7 calibration workbench $fixtureName', ({
  fixtureName, route, walkingMeters, walkingMinutes, maxSegmentMeters,
  recommendedDurationMinutes,
}) => {
  it('replays its city-specific draft without inventing Madrid blind-review cards', async () => {
    const fixture = JSON.parse(readFileSync(
      join(__dirname, '..', '..', '..', 'fixtures', 'editorial-v7', fixtureName),
      'utf8'
    )) as EditorialWorkbenchV7;
    const validated = validateEditorialWorkbenchV7(fixture);
    const replayed = await replayEditorialWorkbenchV7(validated);

    expect(validated.blindReviewCards).toEqual([]);
    expect(replayed.snapshot).toEqual(validated.snapshot);
    expect(replayed.externalGates.streetAudit).toBe('not_applicable');
    expect(replayed).toMatchObject({
      status: 'draft_only',
      route: {
        sceneIds: route,
        metrics: { walkingMeters, walkingMinutes, maxSegmentMeters },
      },
      duration: { recommendedDurationMinutes, narrationSource: 'word_estimate' },
    });
  });
});
