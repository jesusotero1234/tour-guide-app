import { readFileSync } from 'fs';
import { join } from 'path';
import { Tour } from '../../domain/entities/Tour';
import { evaluateTourQuality, TourQualityManualReview } from '../tourQuality/TourQualityEvaluator';

const fixtures = join(__dirname, '..', '..', '..', 'fixtures');
const candidate = JSON.parse(
  readFileSync(join(fixtures, 'tours', 'barcelona-history-fr-candidate.json'), 'utf8')
) as Tour;
const manualReview = JSON.parse(
  readFileSync(join(fixtures, 'reviews', 'barcelona-history-fr-candidate.manual.json'), 'utf8')
) as TourQualityManualReview;
const oracle = JSON.parse(
  readFileSync(join(fixtures, 'oracle', 'anchors.json'), 'utf8')
)['Barcelona/history'] as Array<{ qid: string; name: string }>;

describe('Barcelona frozen narrative quality candidate', () => {
  it('contains no multilingual template leakage or fallback sections', () => {
    for (const place of candidate.places) {
      expect(place.description).not.toMatch(/You've arrived|From here|\bes un (?:attraction|museum|heritage) en\b|basílica gòtica|paleocristiana|\bbishop\b/i);
      expect(place.metadata?.narrationMeta?.sectionsFallbacked).toBe(0);
    }
  });

  it('persists complete source and factual evidence with no critical contradiction', () => {
    for (const place of candidate.places) {
      expect(place.metadata?.sourcePoi?.wikidata).toMatch(/^Q\d+$/);
      expect(place.metadata?.sourcePoi?.wikipedia).toBeTruthy();
      expect(place.metadata?.narrationMeta?.claimCheck).toMatchObject({ criticalFailCount: 0 });
    }
  });

  it('removes the known cross-section contradictions from the real baseline', () => {
    const palau = candidate.places.find((place) => /musique catalane/i.test(place.name));
    const santaMaria = candidate.places.find((place) => /Marie-de-la-Mer/i.test(place.name));
    const macba = candidate.places.find((place) => /contemporain/i.test(place.name));

    expect(palau?.description).not.toMatch(/Rudy Ricciotti|construit en 1997/i);
    expect(santaMaria?.description).not.toMatch(/début du 20e siècle|Josep Maria Jujol/i);
    expect(macba?.description).not.toMatch(/quartier (?:animé )?de l'Eixample/i);
    expect(macba?.description).not.toMatch(/Rafael Moneo|Rudy Ricciotti/i);
  });

  it('passes every publication gate and exceeds the commercial score threshold', () => {
    const result = evaluateTourQuality({
      tour: candidate,
      expectedAnchorQids: oracle.map((anchor) => anchor.qid),
      offThemeQids: [],
      estimatedDurationMinutes: (candidate.metadata as { routeDiagnostics?: { estimatedTourMinutes?: number } } | undefined)
        ?.routeDiagnostics?.estimatedTourMinutes,
      manualReview,
    });

    expect(result.score).toBe(85.1);
    expect(result.gates.factualSafety.status).toBe('pass');
    expect(result.gates.narration.status).toBe('pass');
    expect(result.gates.duration.status).toBe('pass');
    expect(result.publishable).toBe(true);
  });
});
