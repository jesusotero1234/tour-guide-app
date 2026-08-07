import { EditorialEntityCandidateV4 } from './EditorialEntityV4';
import {
  buildStoryMapRequestV4,
  EDITORIAL_STORY_MAP_SCHEMA_VERSION,
  requestStoryMapV4,
  validateStoryMapV4,
} from './EditorialStoryMapV4';

function entity(index: number): EditorialEntityCandidateV4 {
  return {
    canonicalId: `Q${index}`, siteId: `site:Q${index}`, sourceIds: [`node:${index}`],
    localName: `Place ${index}`, category: 'other', coordinates: { lat: 40.4 + (index * 0.001), lng: -3.7 },
    fameScore: 50, visitConflictGroup: null,
    evidenceFacts: [
      { id: `Q${index}:osm:historic`, source: 'osm', sourceId: `node:${index}`, kind: 'observable', value: 'historic: monument', observable: true },
      { id: `Q${index}:wikipedia:0`, source: 'wikipedia', sourceId: `Q${index}`, kind: 'context', value: `Built in 17${index}0 for the history of the city.`, observable: false },
    ],
    readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 1, missing: [] },
  };
}

function validValue(candidateCount = 4) {
  return {
    schemaVersion: EDITORIAL_STORY_MAP_SCHEMA_VERSION,
    centralQuestion: 'How did this city repeatedly redefine its public identity?',
    beats: Array.from({ length: 4 }, (_, index) => ({
      beatId: `b0${index + 1}`,
      contributionCode: ['origins_urban_form', 'royal_state_power', 'public_life_ceremony', 'urban_expansion_reform'][index],
      era: ['medieval', 'early_modern', 'nineteenth_century', 'twentieth_century'][index],
      focus: `Historical chapter number ${index + 1}`,
      evidenceRefs: [`c0${Math.min(index + 1, candidateCount)}:e02`],
    })),
    priorityOrder: Array.from({ length: candidateCount }, (_, index) => `c0${index + 1}`),
    candidates: Object.fromEntries(Array.from({ length: candidateCount }, (_, index) => [`c0${index + 1}`, {
      salienceLevel: 4 - index, observableStrength: 2,
      openingFit: index === 0 ? 3 : 1, resolutionFit: index === candidateCount - 1 ? 3 : 1,
      contributions: index < 4 ? [{ beatId: `b0${index + 1}`, strength: 3, evidenceRefs: ['e02'] }] : [],
    }])),
  };
}

describe('editorial story map v4', () => {
  const built = buildStoryMapRequestV4(Array.from({ length: 4 }, (_, index) => entity(index + 1)), {
    city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
  });

  it('hides canonical and evidence IDs behind fixed slots', () => {
    expect(built.request.candidates[0].slot).toBe('c01');
    expect(built.request.candidates[0].facts[1].slot).toBe('e02');
    expect(JSON.stringify(built.request)).not.toContain('Q1:wikipedia:0');
    expect(built.mapping[0].evidenceBySlot.e02).toBe('Q1:wikipedia:0');
  });

  it('validates a complete ordinal, evidence-grounded map', () => {
    const value = validateStoryMapV4(validValue(), built.request);
    expect(value.beats).toHaveLength(4);
    expect(value.candidates.c01.relativePriorityRank).toBe(1);
  });

  it('accepts a specific beat focus up to 400 characters', () => {
    const response = validValue();
    response.beats[0].focus = 'x'.repeat(400);
    expect(validateStoryMapV4(response, built.request).beats[0].focus).toHaveLength(400);

    response.beats[0].focus += 'x';
    expect(() => validateStoryMapV4(response, built.request)).toThrow('focus is invalid');
  });

  it('accepts a detailed central question up to 600 characters', () => {
    const response = validValue();
    response.centralQuestion = 'x'.repeat(600);
    expect(validateStoryMapV4(response, built.request).centralQuestion).toHaveLength(600);

    response.centralQuestion += 'x';
    expect(() => validateStoryMapV4(response, built.request)).toThrow('Invalid centralQuestion');
  });

  it('keeps opening and resolution as soft signals and accepts explicit century eras', () => {
    const response = validValue();
    response.beats[0].era = 'eighteenth_century';
    Object.values(response.candidates).forEach((candidate) => {
      candidate.openingFit = 0;
      candidate.resolutionFit = 0;
    });

    expect(validateStoryMapV4(response, built.request).beats[0].era).toBe('eighteenth_century');
  });

  it('rejects invented evidence, duplicate ranks and unsupported beats', () => {
    const invented = validValue();
    invented.candidates.c01.contributions[0].evidenceRefs = ['e99'];
    expect(() => validateStoryMapV4(invented, built.request)).toThrow('invalid values');

    const duplicateRank = validValue();
    duplicateRank.priorityOrder[1] = 'c01';
    expect(() => validateStoryMapV4(duplicateRank, built.request)).toThrow('duplicates');

    const unsupported = validValue();
    unsupported.candidates.c04.contributions = [];
    expect(() => validateStoryMapV4(unsupported, built.request)).toThrow('b04 has no strong carrier');
  });

  it('retries malformed transport JSON once and fails explicitly', async () => {
    const post = jest.fn(async () => ({ data: { choices: [{ message: { tool_calls: [{ function: {
      name: 'submit_editorial_story_map_v4', arguments: '{bad-json',
    } }] } }] } }));
    const result = await requestStoryMapV4(built.request, { kind: 'deepseek', model: 'deepseek-v4-flash' }, {
      apiKey: 'test-key', post,
    });
    expect(result.status).toBe('malformed_response');
    expect(result.value).toBeNull();
    expect(result.attempts).toHaveLength(2);
    expect(post).toHaveBeenCalledTimes(2);
  });
});
