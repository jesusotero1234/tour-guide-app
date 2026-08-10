import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import {
  NARRATIVE_PROSE_SYSTEM_PROMPT_V5,
  NARRATIVE_WRITER_MODEL_V5,
  NARRATIVE_WRITER_PARAMETERS_V5,
  buildNarrativeWriterPacketV5,
  generateNarrativeProseV5,
} from './NarrativePilotWriterV5';

function response(argumentsValue: unknown) {
  return {
    data: { choices: [{ message: { tool_calls: [{ function: {
      name: 'submit_narrative_prose_v5',
      arguments: JSON.stringify(argumentsValue),
    } }] } }] },
  };
}

describe('NarrativePilotWriterV5', () => {
  it('sends a compact five-claim packet for every scene', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const packet = buildNarrativeWriterPacketV5(evidence, buildNarrativeClaimPlanV4(evidence));
    const serialized = JSON.stringify(packet);

    expect(packet.scenes).toHaveLength(7);
    expect(packet.scenes.every((scene) => (
      scene.claims.length === 5
      && scene.claims.map((claim) => claim.kind).join(',')
        === 'opening,look,human_conflict,interpretation,closing'
      && scene.visualCue.length > 0
      && scene.allowedProperNouns.length > 0
    ))).toBe(true);
    expect(serialized).not.toMatch(/originalExcerpt|capturedAt|revisionId|sourceFingerprint/);
  });

  it('locks the writer while targeting 175 words per whole scene without block quotas', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const bodies: Record<string, unknown>[] = [];
    const post = jest.fn(async (_url, body: Record<string, unknown>) => {
      bodies.push(body);
      return response({
        schemaVersion: 'narrative-prose-draft-v5',
        introduction: 'demasiado breve',
        scripts: [],
      });
    });

    await generateNarrativeProseV5(
      evidence,
      buildNarrativeClaimPlanV4(evidence),
      'on_site',
      { apiKey: 'test-key', post }
    );

    expect(NARRATIVE_WRITER_MODEL_V5).toBe('deepseek-v4-flash');
    expect(NARRATIVE_WRITER_PARAMETERS_V5).toEqual({
      temperature: 0, maxTokens: 8000, thinking: false, strictTool: true,
    });
    expect(NARRATIVE_PROSE_SYSTEM_PROMPT_V5).toContain('175 palabras por escena');
    expect(NARRATIVE_PROSE_SYSTEM_PROMPT_V5).toContain('cuenta las palabras del conjunto');
    expect(NARRATIVE_PROSE_SYSTEM_PROMPT_V5).not.toMatch(/palabras por bloque|32 palabras/);
    const userMessage = JSON.stringify(bodies[0]);
    expect(userMessage).toContain('narrative-writer-packet-v5');
    expect(userMessage).not.toContain('approvedPlan');
    expect(userMessage).not.toContain('originalExcerpt');
  });

  it('preserves every deterministic validation issue in a semantic failure', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const result = await generateNarrativeProseV5(
      evidence,
      buildNarrativeClaimPlanV4(evidence),
      'documentary',
      {
        apiKey: 'test-key',
        post: jest.fn(async () => response({
          schemaVersion: 'narrative-prose-draft-v5',
          introduction: 'Madrid 9999.',
          scripts: [],
        })),
      }
    );

    expect(result.status).toBe('semantic_error');
    expect(result.attempts[0].error).toContain('narrative_prose_validation_v5:');
    expect(result.attempts[0].error).toContain('word_count');
    expect(result.attempts[0].error).toContain('unknown_number');
    expect(result.attempts[0].error).toContain('scripts must contain 7 scenes');
  });
});
