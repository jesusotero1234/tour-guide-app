import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NARRATIVE_SCORECARD_DIMENSIONS_V6,
  NarrativeScorecardDimensionV6,
  NarrativeScorecardGradeV6,
  reviewNarrativeTourScorecardV6,
} from './NarrativeEditorialAgentsV6';
import { assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';

const script = assignNarrativeSentenceIdsV6('palace', 'Mira la fachada del palacio.');
const dossier = {
  stopId: 'palace', language: 'es',
  sources: [{
    sourceId: 'source-1', finalUrl: 'https://example.com/palace', title: 'Palacio',
    capturedAt: '2026-08-13T00:00:00.000Z', fingerprint: 'a'.repeat(64),
    authority: { tier: 'primary_authority', publisherKey: 'example.com', rule: 'test' },
  }],
  passages: [{ passageId: 'passage-1', sourceId: 'source-1', quote: 'La fachada es visible.' }],
  propositions: [{
    propositionId: 'proposition-1', text: 'La fachada es visible.', role: 'visible_observation',
    certainty: 'high', interpretation: 'direct', sourceIds: ['source-1'],
    passageIds: ['passage-1'],
  }],
  authorizedNames: ['Palacio'], authorizedNumbers: [], discrepancies: [], limits: [],
  sufficiency: {
    isSufficient: true, missingRoles: [], authoritySourceCount: 2, independentPublisherCount: 2,
  },
  fingerprint: 'd'.repeat(64),
} as NarrativeDossierV6;

function scorecardPayload(
  score: number,
  overrides: Partial<Record<NarrativeScorecardDimensionV6, number>> = {},
  objections: unknown[] = [],
  polishNotes: unknown[] = []
) {
  return {
    dimensions: Object.fromEntries(NARRATIVE_SCORECARD_DIMENSIONS_V6.map((dimension) => [
      dimension,
      {
        score: overrides[dimension] ?? score,
        rationale: 'Valoración ligada a una frase concreta.',
        sentenceIds: ['palace-S001'],
      },
    ])),
    polishNotes,
    objections,
  };
}

function postPayload(payload: unknown) {
  return jest.fn(async (_url: string, body: Record<string, unknown>) => {
    const toolName = ((body.tool_choice as { function: { name: string } }).function.name);
    return { data: { choices: [{ message: { tool_calls: [{ function: {
      name: toolName, arguments: JSON.stringify(payload),
    } }] } }] } };
  });
}

async function review(payload: unknown) {
  return reviewNarrativeTourScorecardV6(
    { apiKey: 'test-key', post: postPayload(payload) },
    { promise: 'Comprender Madrid', scripts: [script], dossiers: [dossier] }
  );
}

function objection(dimension: NarrativeScorecardDimensionV6, evidenceIds = true) {
  return {
    dimension,
    sentenceId: 'palace-S001',
    exactSentence: 'Mira la fachada del palacio.',
    evidence: 'El defecto requiere una edición localizada.',
    propositionIds: evidenceIds ? ['proposition-1'] : [],
    passageIds: evidenceIds ? ['passage-1'] : [],
    minimalReplacement: 'Observa la fachada del palacio.',
  };
}

describe('narrative v6 discrete scorecard', () => {
  it('rejects arbitrary decimal grades', async () => {
    await expect(review(scorecardPayload(7.7))).rejects.toThrow('protocol validation');
  });

  it('rejects a blocking grade without a matching objection', async () => {
    await expect(review(scorecardPayload(8.5, { oralClarityRhythm: 7 })))
      .rejects.toThrow('protocol validation');
  });

  it('rejects a publishable grade with a blocking objection', async () => {
    await expect(review(scorecardPayload(
      8.5, {}, [objection('oralClarityRhythm', false)]
    ))).rejects.toThrow('protocol validation');
  });

  it('requires exact dossier proposition and passage IDs for grounding blockers', async () => {
    await expect(review(scorecardPayload(
      8.5, { accuracyGrounding: 5 }, [objection('accuracyGrounding', false)]
    ))).rejects.toThrow('protocol validation');
  });

  it('derives Flawed and Request changes from a localized material defect', async () => {
    const result = await review(scorecardPayload(
      8.5,
      { oralClarityRhythm: 7 },
      [objection('oralClarityRhythm', false)]
    ));

    expect(result.value.decision).toBe('Request changes');
    expect(result.value.overallBand).toBe('Flawed');
    expect(result.value.dimensions.oralClarityRhythm.score).toBe(
      7 satisfies NarrativeScorecardGradeV6
    );
  });

  it('derives Excellent only when every dimension is a clean 10', async () => {
    const result = await review(scorecardPayload(10));

    expect(result.value).toMatchObject({ decision: 'Approve', overallBand: 'Excellent' });
  });
});
