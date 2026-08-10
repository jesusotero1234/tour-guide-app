import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeEvidenceCaseInputV4,
  hydrateNarrativeEvidenceCaseV4,
  validateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';

const SCENE_IDS = ['palace', 'almudena', 'villa', 'mayor', 'sol', 'cibeles', 'alcala'];
const NAMES = [
  'Palacio Real',
  'Catedral de la Almudena',
  'Plaza de la Villa',
  'Plaza Mayor',
  'Puerta del Sol',
  'Cibeles',
  'Puerta de Alcalá',
];
const COORDINATES = [
  [40.417828, -3.714361],
  [40.4157109, -3.714495],
  [40.4152086, -3.710424],
  [40.4154007, -3.7073747],
  [40.4168622, -3.7034948],
  [40.41917, -3.69306],
  [40.4199868, -3.6887244],
];
const CONTRIBUTIONS = [
  'The stop opens the route with the shift from fortified settlement to the seat of monarchical power.',
  'Its unusually recent completion complicates the expectation that a European capital must have an ancient cathedral.',
  'This compact civil ensemble carries both the medieval-town chapter and the emergence of urban government.',
  'It shows how a commercial edge of the medieval town became the ceremonial plaza of a royal capital.',
  'Its everyday crowds and national symbols turn the route from courtly Madrid toward the modern public capital.',
  'The scene links Charles III’s urban programme, civic infrastructure and the modern municipal capital without duplicating its members as stops.',
  'The final stop resolves the arc by showing a former urban boundary absorbed into the expanded modern capital.',
];

function withoutFingerprints(): NarrativeEvidenceCaseInputV4 {
  const { fingerprint: _caseFingerprint, ...caseContent } = loadMadridNarrativeEvidenceCaseV4();
  return {
    ...caseContent,
    scenes: caseContent.scenes.map((scene) => ({
      ...scene,
      evidenceFacts: scene.evidenceFacts.map((fact) => {
        const { fingerprint: _factFingerprint, source, ...factContent } = fact;
        const { fingerprint: _sourceFingerprint, ...sourceContent } = source;
        return { ...factContent, source: sourceContent };
      }),
    })),
  };
}

describe('NarrativeEvidenceV4 Madrid fixture', () => {
  it('preserves the exact seven-scene V7 route', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();

    expect(evidence.scenes.map((scene) => scene.sceneId)).toEqual(SCENE_IDS);
    expect(evidence.scenes.map((scene) => scene.name)).toEqual(NAMES);
    expect(evidence.scenes.map((scene) => [
      scene.observationPoint.lat,
      scene.observationPoint.lng,
    ])).toEqual(COORDINATES);
    expect(evidence.scenes.map((scene) => scene.contribution)).toEqual(CONTRIBUTIONS);
    expect(evidence.route).toMatchObject({
      sourceFingerprint: 'e0ac27a7911304b462c2b03c74a63a374a6cec8832bd3b701aa27c4d189c3021',
      walkingMeters: 3067.6,
      walkingSeconds: 2473.9,
      recommendedDurationMinutes: 60,
    });
  });

  it('contains exactly four explicit roles with visual cues only on observable facts', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();

    for (const scene of evidence.scenes) {
      expect(scene.evidenceFacts.map((fact) => fact.role).sort()).toEqual([
        'historical_change', 'human_agency', 'observable', 'tension_or_contrast',
      ]);
      for (const fact of scene.evidenceFacts) {
        const words = fact.atomicTextEs.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? [];
        expect(words.length).toBeGreaterThanOrEqual(8);
        expect(words.length).toBeLessThanOrEqual(45);
        expect(fact.visibility.kind).toBe(fact.role === 'observable' ? 'on_site' : 'contextual');
        if (fact.visibility.kind === 'on_site') expect(fact.visibility.cueEs.trim()).not.toBe('');
      }
    }
  });

  it('validates every source, fact, and case fingerprint offline', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    expect(validateNarrativeEvidenceCaseV4(evidence)).toBe(evidence);

    const changed = structuredClone(evidence);
    changed.scenes[0].evidenceFacts[0].source.revisionId = 'changed';
    expect(() => validateNarrativeEvidenceCaseV4(changed)).toThrow('source fingerprint changed');

    const changedFact = structuredClone(evidence);
    changedFact.scenes[0].evidenceFacts[0].atomicTextEs =
      changedFact.scenes[0].evidenceFacts[0].atomicTextEs.replace('ocho', 'nueve');
    expect(() => validateNarrativeEvidenceCaseV4(changedFact)).toThrow('fact fingerprint changed');

    const changedCase = structuredClone(evidence);
    changedCase.promise += ' Cambio.';
    expect(() => validateNarrativeEvidenceCaseV4(changedCase)).toThrow('case fingerprint changed');
  });

  it('hydrates a synthetic unknown city through the same generic validator', () => {
    const input = withoutFingerprints();
    input.caseId = 'xanthe-civic-es-v4';
    input.city = 'Xanthe';
    input.route.sourceFingerprint = editorialFingerprintV7({ route: 'xanthe' });
    input.scenes = input.scenes.map((scene, index) => ({
      ...scene,
      sceneId: `xanthe-${index + 1}`,
      name: `Lugar Xanthe ${index + 1}`,
      routePosition: index,
      previousSceneId: index === 0 ? null : `xanthe-${index}`,
      nextSceneId: index === input.scenes.length - 1 ? null : `xanthe-${index + 2}`,
      ownerCanonicalId: `xanthe-owner-${index + 1}`,
      closingInterpretation: {
        ...scene.closingInterpretation,
        basisFactIds: scene.evidenceFacts.map((fact) => `xanthe-${index + 1}-${fact.role}`),
      },
      evidenceFacts: scene.evidenceFacts.map((fact) => ({
        ...fact,
        factId: `xanthe-${index + 1}-${fact.role}`,
        ownerCanonicalId: `xanthe-owner-${index + 1}`,
      })),
    }));
    input.route.sceneIds = input.scenes.map((scene) => scene.sceneId);

    const hydrated = hydrateNarrativeEvidenceCaseV4(input);

    expect(validateNarrativeEvidenceCaseV4(hydrated).city).toBe('Xanthe');
    expect(hydrated.scenes).toHaveLength(7);
  });
});
