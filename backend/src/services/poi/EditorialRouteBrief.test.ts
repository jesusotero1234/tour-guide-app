import { EditorialCandidate } from './EditorialCandidate';
import {
  buildEditorialRouteBriefRequest,
  EditorialRouteBriefRequest,
  requestEditorialRouteBrief,
  ROUTE_EDITORIAL_SCHEMA_VERSION,
  TourEditorialBrief,
  validateTourEditorialBrief,
} from './EditorialRouteBrief';

function request(candidateCount = 5, requestedDuration = 120): EditorialRouteBriefRequest {
  return {
    city: 'Test City',
    theme: 'history',
    language: 'en',
    requestedDuration,
    candidates: Array.from({ length: candidateCount }, (_, index) => ({
      canonicalId: `Q${index + 1}`,
      localName: `Place ${index + 1}`,
      category: 'other',
      fameScore: 20 - index,
      facts: [
        { id: `Q${index + 1}:observable`, kind: 'observable' as const, value: 'Visible stone arch' },
        { id: `Q${index + 1}:claim`, kind: 'claim' as const, value: 'inception: 1800' },
      ],
    })),
  };
}

function validBrief(input: EditorialRouteBriefRequest): TourEditorialBrief {
  return {
    schemaVersion: ROUTE_EDITORIAL_SCHEMA_VERSION,
    promise: 'See how civic power reshaped the city.',
    centralQuestion: 'Who made the city visible?',
    arc: ['opening', 'power', 'resolution'],
    candidateAssessments: input.candidates.map((candidate, index) => ({
      canonicalId: candidate.canonicalId,
      paidValueScore: 90 - index,
      inclusion: index < 4 ? 'essential' : 'supporting',
      recommendedRole: index === 0 ? 'opening' : index === 1 ? 'power' : index === 3 ? 'resolution' : null,
      uniqueContribution: `Contribution ${index + 1}`,
      reason: `Reason ${index + 1}`,
      evidenceIds: [candidate.facts[0].id],
    })),
  };
}

describe('TourEditorialBrief validation', () => {
  it('rejects an incomplete response', () => {
    const input = request();
    const brief = validBrief(input);
    brief.candidateAssessments.pop();

    expect(() => validateTourEditorialBrief(brief, input)).toThrow('Every candidate must be assessed exactly once');
  });

  it('rejects invented candidate IDs', () => {
    const input = request();
    const brief = validBrief(input);
    brief.candidateAssessments[0].canonicalId = 'Q999999';

    expect(() => validateTourEditorialBrief(brief, input)).toThrow('Unknown candidate id');
  });

  it('rejects evidence IDs that were not sent for that candidate', () => {
    const input = request();
    const brief = validBrief(input);
    brief.candidateAssessments[0].evidenceIds = ['Q999:evidence'];

    expect(() => validateTourEditorialBrief(brief, input)).toThrow('Invalid evidence id');
  });

  it('rejects more essentials than the route can contain', () => {
    const input = request(9);
    const brief = validBrief(input);
    brief.candidateAssessments.forEach((assessment) => { assessment.inclusion = 'essential'; });

    expect(() => validateTourEditorialBrief(brief, input)).toThrow('at most 8 stops fit');
  });

  it('fails an insufficient long-tour core without promoting candidates', () => {
    const input = request();
    const brief = validBrief(input);
    brief.candidateAssessments[3].inclusion = 'supporting';

    expect(() => validateTourEditorialBrief(brief, input)).toThrow('at least four real essentials');
    expect(brief.candidateAssessments.filter((assessment) => assessment.inclusion === 'essential')).toHaveLength(3);
  });

  it('does not fall back when the curator service fails', async () => {
    const input = request();
    const post = jest.fn().mockRejectedValue(new Error('curator unavailable'));

    await expect(requestEditorialRouteBrief(input, { post })).rejects.toThrow('curator unavailable');
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('editorial request projection', () => {
  it('sends only localized identity, category, fame and a compact evidence pack', () => {
    const candidate = {
      canonicalId: 'Q1',
      clusterId: 'Q1',
      memberCanonicalIds: ['Q1'],
      localName: 'Old Gate',
      category: 'other',
      coordinates: { lat: 40, lng: -3 },
      fameScore: 22,
      themeScore: 80,
      firstVisitScore: 91,
      evidenceScore: 90,
      observableScore: 50,
      tier: 'essential',
      eligibleRoles: ['opening'],
      evidenceFacts: [
        { id: 'o1', source: 'osm', sourceId: 'node:1', kind: 'observable', value: 'material: stone', observable: true },
        { id: 'o2', source: 'osm', sourceId: 'node:1', kind: 'observable', value: 'building: gate', observable: true },
        { id: 'c1', source: 'wikidata', sourceId: 'Q1', kind: 'claim', value: 'inception: 1800', observable: false },
        { id: 'c2', source: 'wikidata', sourceId: 'Q1', kind: 'claim', value: 'architect: Example', observable: false },
        { id: 'c3', source: 'wikidata', sourceId: 'Q1', kind: 'claim', value: 'named after: Example', observable: false },
        { id: 'x1', source: 'wikipedia', sourceId: 'Old Gate', kind: 'context', value: 'Context one', observable: false },
        { id: 'x2', source: 'wikipedia', sourceId: 'Old Gate', kind: 'context', value: 'Context two', observable: false },
        { id: 'x3', source: 'wikipedia', sourceId: 'Old Gate', kind: 'context', value: 'Context three', observable: false },
      ],
    } as EditorialCandidate;

    const projected = buildEditorialRouteBriefRequest([candidate], {
      city: 'Test City',
      theme: 'history',
      language: 'en',
      requestedDuration: 60,
    });
    const serialized = JSON.stringify(projected);

    expect(projected.candidates[0].facts).toHaveLength(5);
    expect(projected.candidates[0].facts.filter((fact) => fact.kind === 'claim')).toHaveLength(2);
    expect(projected.candidates[0].facts.filter((fact) => fact.kind === 'context')).toHaveLength(2);
    expect(projected.candidates[0].facts.some((fact) => fact.kind === 'observable')).toBe(true);
    expect(serialized).not.toContain('firstVisitScore');
    expect(serialized).not.toContain('eligibleRoles');
    expect(serialized).not.toContain('tier');
    expect(serialized).not.toContain('coordinates');
    expect(serialized).not.toContain('oracle');
  });
});
