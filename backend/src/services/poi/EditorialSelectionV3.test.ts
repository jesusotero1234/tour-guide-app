import {
  buildCandidateSignalsRequestV3,
  candidateSignalsResponseSchemaV3,
  CANDIDATE_SIGNALS_SCHEMA_VERSION,
  routeJuryResponseSchemaV3,
  ROUTE_JURY_SCHEMA_VERSION,
  validateCandidateSignalsV3,
  validateRouteJuryV3,
  requestCandidateSignalsV3,
} from './EditorialSelectionV3';
import { EditorialSiteCandidateV3 } from './EditorialSiteV3';

const site = {
  canonicalId: 'Q1', localName: 'One', category: 'monument', fameScore: 10,
  readiness: { ready: true },
  evidenceFacts: [{ id: 'secret-id', kind: 'context', value: 'Built in 1780 as a civic monument.' }],
} as unknown as EditorialSiteCandidateV3;

describe('editorial selection contracts v3', () => {
  it('projects candidates to fixed slots without canonical IDs or deterministic tiers', () => {
    const request = buildCandidateSignalsRequestV3([site], {
      city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
    });
    expect(request.candidates[0]).toEqual({
      slot: 'c00', localName: 'One', category: 'monument', fameScore: 10,
      facts: [{ slot: 'e00', kind: 'context', value: 'Built in 1780 as a civic monument.' }],
    });
    expect(JSON.stringify(request)).not.toContain('secret-id');
    expect(JSON.stringify(request)).not.toContain('firstVisitScore');
  });

  it('rejects missing slots, invented fields and invalid evidence slots', () => {
    const request = buildCandidateSignalsRequestV3([site], {
      city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
    });
    expect(() => validateCandidateSignalsV3({
      schemaVersion: CANDIDATE_SIGNALS_SCHEMA_VERSION,
      signals: { c00: { visitValueScore: 80, omissionCost: 75, primaryEvidence: 'e99' } },
    }, request)).toThrow('primaryEvidence is invalid');
    expect(() => validateCandidateSignalsV3({
      schemaVersion: CANDIDATE_SIGNALS_SCHEMA_VERSION, signals: {},
    }, request)).toThrow('unexpected or missing');
    expect(() => validateCandidateSignalsV3({
      schemaVersion: CANDIDATE_SIGNALS_SCHEMA_VERSION,
      signals: { c00: { visitValueScore: 101, omissionCost: 75, primaryEvidence: 'e00' } },
    }, request)).toThrow('0 to 100');
  });

  it('uses fixed required properties in both strict schemas', () => {
    const signalRequest = buildCandidateSignalsRequestV3([site], {
      city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
    });
    const signalSchema = candidateSignalsResponseSchemaV3(signalRequest) as any;
    expect(signalSchema.properties.signals.required).toEqual(['c00']);
    const juryRequest = {
      city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
      routes: Array.from({ length: 5 }, (_, index) => ({
        slot: `r0${index}`, candidateSlots: [], stopNames: [], estimatedTourMinutes: 60,
        walkingMeters: 1000, priorityCovered: 4, averageVisitValue: 80,
      })),
    };
    const jurySchema = routeJuryResponseSchemaV3(juryRequest) as any;
    expect(jurySchema.properties.scores.required).toEqual(['r00', 'r01', 'r02', 'r03', 'r04']);
    const value = validateRouteJuryV3({
      schemaVersion: ROUTE_JURY_SCHEMA_VERSION,
      scores: Object.fromEntries(juryRequest.routes.map((route) => [route.slot, {
        paidTourScore: 80, historicalArcScore: 80, omissionSafetyScore: 80, distinctivenessScore: 80,
      }])),
    }, juryRequest);
    expect(value.scores.r04.paidTourScore).toBe(80);
  });

  it('retries malformed transport JSON once and then fails explicitly', async () => {
    const request = buildCandidateSignalsRequestV3([site], {
      city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
    });
    const post = jest.fn(async () => ({
      data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'submit_candidate_signals_v3', arguments: '{not-json',
      } }] } }] },
    }));
    const result = await requestCandidateSignalsV3(request, {
      kind: 'deepseek', model: 'deepseek-v4-flash',
    }, { apiKey: 'test-key', post });

    expect(result.status).toBe('malformed_response');
    expect(result.value).toBeNull();
    expect(result.attempts).toHaveLength(2);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('does not silently retry a semantically invalid score', async () => {
    const request = buildCandidateSignalsRequestV3([site], {
      city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
    });
    const post = jest.fn(async () => ({
      data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'submit_candidate_signals_v3',
        arguments: JSON.stringify({
          schemaVersion: CANDIDATE_SIGNALS_SCHEMA_VERSION,
          signals: { c00: { visitValueScore: 101, omissionCost: 75, primaryEvidence: 'e00' } },
        }),
      } }] } }] },
    }));
    const result = await requestCandidateSignalsV3(request, {
      kind: 'deepseek', model: 'deepseek-v4-flash',
    }, { apiKey: 'test-key', post });

    expect(result.status).toBe('semantic_error');
    expect(result.attempts).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
