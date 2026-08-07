import { EditorialCandidate, NarrativeRole } from './EditorialCandidate';
import { TourEditorialBrief } from './EditorialRouteBrief';
import { optimizeEditorialRoute } from './EditorialRouteOptimizer';

function candidate(
  id: string,
  lat: number,
  lng: number,
  category = 'other',
  clusterId = id
): EditorialCandidate {
  return {
    canonicalId: id,
    clusterId,
    memberCanonicalIds: [id],
    localName: `Place ${id}`,
    category: category as EditorialCandidate['category'],
    coordinates: { lat, lng },
    fameScore: 10,
    themeScore: 50,
    firstVisitScore: 50,
    evidenceScore: 80,
    observableScore: 25,
    tier: 'supporting',
    eligibleRoles: [],
    evidenceFacts: [
      { id: `${id}:o`, source: 'osm', sourceId: id, kind: 'observable', value: 'material: stone', observable: true },
      { id: `${id}:c1`, source: 'wikidata', sourceId: id, kind: 'claim', value: 'inception: 1800', observable: false },
      { id: `${id}:c2`, source: 'wikidata', sourceId: id, kind: 'claim', value: 'architect: Example', observable: false },
      { id: `${id}:x`, source: 'wikipedia', sourceId: id, kind: 'context', value: 'Historical context.', observable: false },
    ],
  };
}

function brief(
  candidates: EditorialCandidate[],
  overrides: Partial<Record<string, { inclusion: 'essential' | 'supporting' | 'reject'; role: NarrativeRole | null; score: number }>> = {}
): TourEditorialBrief {
  const defaults: Record<string, { inclusion: 'essential' | 'supporting' | 'reject'; role: NarrativeRole | null; score: number }> = {
    Q1: { inclusion: 'essential', role: 'opening', score: 95 },
    Q2: { inclusion: 'essential', role: 'power', score: 94 },
    Q3: { inclusion: 'essential', role: 'power', score: 93 },
    Q4: { inclusion: 'essential', role: 'resolution', score: 92 },
    Q5: { inclusion: 'supporting', role: null, score: 80 },
    Q6: { inclusion: 'reject', role: null, score: 100 },
    Q7: { inclusion: 'supporting', role: null, score: 99 },
  };
  return {
    schemaVersion: 'route-editorial-v2',
    promise: 'Follow the city from opening to resolution.',
    centralQuestion: 'How did power shape this place?',
    arc: ['opening', 'power', 'resolution'],
    candidateAssessments: candidates.map((item) => {
      const assessment = overrides[item.canonicalId] ?? defaults[item.canonicalId];
      return {
        canonicalId: item.canonicalId,
        paidValueScore: assessment.score,
        inclusion: assessment.inclusion,
        recommendedRole: assessment.role,
        uniqueContribution: `${item.localName} contribution`,
        reason: `${item.localName} reason`,
        evidenceIds: [`${item.canonicalId}:o`],
      };
    }),
  };
}

describe('EditorialRouteOptimizer curated selection', () => {
  const centralCandidates = [
    candidate('Q1', 40.0000, -3.0000, 'square_civic'),
    candidate('Q2', 40.0010, -3.0000, 'civic_power'),
    candidate('Q3', 40.0020, -3.0000, 'palace_castle'),
    candidate('Q4', 40.0030, -3.0000, 'memorial'),
    candidate('Q5', 40.0040, -3.0000, 'religious'),
    candidate('Q6', 40.0050, -3.0000, 'market'),
    candidate('Q7', 40.0400, -3.0000, 'other'),
  ];

  it('accepts a short but complete route without filling 75% of the request', () => {
    const editorialBrief = brief(centralCandidates);
    const result = optimizeEditorialRoute(centralCandidates, editorialBrief, 120);
    const selectedIds = new Set(result.route.map((item) => item.canonicalId));
    const essentials = editorialBrief.candidateAssessments.filter((item) => item.inclusion === 'essential');

    expect(result.status).toBe('selected');
    expect(result.finalists[0].metrics.estimatedTourMinutes).toBeLessThan(90);
    expect(result.finalists[0].metrics.estimatedTourMinutes).toBeLessThanOrEqual(120);
    expect(result.finalists[0].scores.curatorEssentialCoverage).toBe(1);
    expect(result.finalists[0].scores.arcCoverage).toBe(1);
    expect(essentials.every((item) => selectedIds.has(item.canonicalId))).toBe(true);
  });

  it('never includes rejects or a remote stop merely to consume time', () => {
    const result = optimizeEditorialRoute(centralCandidates, brief(centralCandidates), 120);
    const selectedIds = result.route.map((item) => item.canonicalId);

    expect(selectedIds).not.toContain('Q6');
    expect(selectedIds).not.toContain('Q7');
    expect(result.route).toHaveLength(5);
    expect(result.discardSummary.curator_reject).toBe(1);
  });

  it('keeps clusters unique and covers the complete arc', () => {
    const duplicate = candidate('Q8', 40.0045, -3.0000, 'market', 'Q5');
    const candidates = [...centralCandidates, duplicate];
    const editorialBrief = brief(candidates, {
      Q8: { inclusion: 'supporting', role: null, score: 79 },
    });
    const result = optimizeEditorialRoute(candidates, editorialBrief, 120);

    expect(new Set(result.route.map((item) => item.clusterId)).size).toBe(result.route.length);
    expect(result.finalists[0].scores.arcCoverage).toBe(1);
    expect(result.finalists[0].scores.arcOrder).toBe(100);
  });

  it('recommends the first 15-minute extension when the core exceeds the ceiling', () => {
    const candidates = centralCandidates.slice(0, 5);
    const result = optimizeEditorialRoute(candidates, brief(candidates), 45);

    expect(result.status).toBe('duration_extension_required');
    expect(result.recommendedDuration).toBe(60);
    expect(result.finalists[0].metrics.estimatedTourMinutes).toBeGreaterThan(45);
    expect(result.finalists[0].metrics.estimatedTourMinutes).toBeLessThanOrEqual(60);
  });
});
