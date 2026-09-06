import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import {
  NARRATIVE_WRITER_MODEL_V4,
  NARRATIVE_WRITER_PARAMETERS_V4,
  generateNarrativeProseV4,
} from './NarrativePilotWriterV4';

describe('NarrativePilotWriterV4', () => {
  it('locks DeepSeek beta strict tools, model, no-thinking, temperature, and token cap', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const post = jest.fn(async (_url, _body) => ({
      data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'submit_narrative_prose_v4',
        arguments: '{}',
      } }] } }] },
    }));

    await generateNarrativeProseV4(evidence, buildNarrativeClaimPlanV4(evidence), 'on_site', {
      apiKey: 'test-key',
      post,
    });

    expect(NARRATIVE_WRITER_MODEL_V4).toBe('deepseek-v4-flash');
    expect(NARRATIVE_WRITER_PARAMETERS_V4).toEqual({
      temperature: 0,
      maxTokens: 8000,
      thinking: false,
      strictTool: true,
    });
    expect(post.mock.calls[0][0]).toBe('https://api.deepseek.com/beta/chat/completions');
    expect(post.mock.calls[0][1]).toMatchObject({
      model: 'deepseek-v4-flash',
      max_tokens: 8000,
      temperature: 0,
      thinking: { type: 'disabled' },
      tools: [{ function: { strict: true } }],
    });
  });

});
