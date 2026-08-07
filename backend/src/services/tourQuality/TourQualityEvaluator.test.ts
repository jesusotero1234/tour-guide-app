import { Tour } from '../../domain/entities/Tour';
import { evaluateTourQuality } from './TourQualityEvaluator';

function narration(opening: string): string {
  return `${opening} ${Array(175).fill('historia').join(' ')}`;
}

function completeTour(): Tour {
  return {
    id: 'tour-1',
    city: 'Madrid',
    country: 'Spain',
    countryCode: 'ES',
    theme: 'history',
    language: 'es',
    durationMinutes: 120,
    metadata: {
      confidence: {
        passed: true,
        stage: 'output',
        score: 1,
        reasons: [],
        signals: { coverageRatio: 1 },
      },
    },
    places: [
      {
        id: 'place-1',
        tourId: 'tour-1',
        name: 'Museo del Prado',
        description: narration('Frente a esta fachada comienza nuestro recorrido.'),
        latitude: 40.4138,
        longitude: -3.6921,
        position: 0,
        metadata: {
          sourcePoi: { wikidata: 'Q160112', wikipedia: 'es:Museo_del_Prado', category: 'museum' },
          narrationMeta: { claimCheck: { verifiedRate: 0.9, criticalFailCount: 0 } },
        },
      },
      {
        id: 'place-2',
        tourId: 'tour-1',
        name: 'Puerta del Sol',
        description: narration('Bajo el reloj cambia ahora la escala de Madrid.'),
        latitude: 40.4169,
        longitude: -3.7035,
        position: 1,
        metadata: {
          sourcePoi: { wikidata: 'Q427163', wikipedia: 'es:Puerta_del_Sol', category: 'square_civic' },
          narrationMeta: { claimCheck: { verifiedRate: 0.9, criticalFailCount: 0 } },
        },
      },
    ],
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };
}

describe('TourQualityEvaluator', () => {
  it('publishes only when all gates, evidence, manual review, and score pass', () => {
    const result = evaluateTourQuality({
      tour: completeTour(),
      expectedAnchorQids: ['Q160112', 'Q427163'],
      offThemeQids: [],
      manualReview: {
        routeContinuity: 5,
        wholeTourStory: 23,
        stopExperience: 23,
        spokenNaturalness: 5,
        factualQualification: 3,
      },
    });

    expect(Object.values(result.gates).every((gate) => gate.status === 'pass')).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.publishable).toBe(true);
  });

  it('marks absent evidence as missing instead of silently passing it', () => {
    const tour = completeTour();
    tour.metadata = undefined;
    tour.places.forEach((place) => {
      place.metadata = undefined;
    });

    const result = evaluateTourQuality({ tour });

    expect(result.gates.factualSafety.status).toBe('missing');
    expect(result.gates.routeIdentity.status).toBe('missing');
    expect(result.gates.theme.status).toBe('missing');
    expect(result.gates.duration.status).toBe('missing');
    expect(result.gates.completeness.status).toBe('fail');
    expect(result.score).toBeNull();
    expect(result.publishable).toBe(false);
  });

  it('fails duplicate identities, critical contradictions, and duration underfill', () => {
    const tour = completeTour();
    tour.metadata!.confidence!.signals!.coverageRatio = 0.75;
    tour.places[1].metadata!.sourcePoi!.wikidata = 'Q160112';
    tour.places[1].metadata!.narrationMeta = {
      claimCheck: { verifiedRate: 0.8, criticalFailCount: 1 },
    };

    const result = evaluateTourQuality({ tour, offThemeQids: [] });

    expect(result.gates.routeIdentity.status).toBe('fail');
    expect(result.gates.factualSafety.status).toBe('fail');
    expect(result.gates.duration.status).toBe('fail');
    expect(result.publishable).toBe(false);
  });

  it('fails narration when a substantial stop still contains a generated fallback section', () => {
    const tour = completeTour();
    tour.places[0].metadata!.narrationMeta = {
      ...tour.places[0].metadata!.narrationMeta,
      sectionsFallbacked: 1,
    };

    const result = evaluateTourQuality({ tour, offThemeQids: [] });

    expect(result.gates.narration.status).toBe('fail');
    expect(result.metrics.fallbackStopCount).toBe(1);
  });
});
