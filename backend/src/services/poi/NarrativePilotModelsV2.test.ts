import { readFileSync } from 'fs';
import { join } from 'path';
import {
  NarrativeClaimPlanV1,
  canonicalizeNarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import {
  NARRATIVE_GENERATOR_PARAMETERS_V2,
  generateNarrativeClaimPlanV2,
  generateNarrativeProseV2,
  narrativePlanGeneratorPromptFingerprintV2,
  narrativeProseGeneratorPromptFingerprintV2,
} from './NarrativePilotDeepSeekV2';
import {
  NarrativeCriticReportV2,
  NarrativeGroundingCriticReportV1,
  buildNarrativeCriticRequestV2,
  buildNarrativeGroundingCriticRequestV1,
} from './NarrativePilotCriticV2';
import {
  NARRATIVE_CRITIC_PARAMETERS_V2,
  inspectNarrativeCriticModelV2,
  narrativeFinalCriticPromptFingerprintV2,
  narrativeGroundingCriticPromptFingerprintV2,
  requestNarrativeFinalCritiqueV2,
  requestNarrativeGroundingCritiqueV2,
} from './NarrativePilotGemmaV2';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import {
  NarrativeBlockKindV1,
  NarrativeScriptRequestV1,
  NarrativeScriptResponseV1,
  SceneNarrativeScriptV1,
} from './NarrativePilotV1';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];

function fixture(): {
  request: NarrativeScriptRequestV1;
  plan: NarrativeClaimPlanV1;
  scripts: SceneNarrativeScriptV1[];
} {
  const route = JSON.parse(readFileSync(
    join(FIXTURES, 'editorial-v7', 'paris-history-en-120.json'), 'utf8'
  )) as EditorialWorkbenchV7;
  const response = JSON.parse(readFileSync(
    join(FIXTURES, 'narrative-pilot-v1', 'paris-premium-es.response.json'), 'utf8'
  )) as NarrativeScriptResponseV1;
  const request = buildParisNarrativeScriptRequestV1(route);
  const plan = canonicalizeNarrativeClaimPlanV1({
    schemaVersion: 'narrative-claim-plan-draft-v1',
    scenes: response.scripts.map((script) => ({
      sceneId: script.sceneId,
      openingType: script.openingType,
      blocks: script.blocks.map((block) => ({
        kind: block.kind,
        claims: [{
          text: `Claim aprobado ${block.kind}`,
          relation: block.kind === 'interpretation' ? 'interpretation' : 'direct',
          evidenceFactIds: block.evidenceFactIds,
        }],
      })),
    })),
  }, request);
  const scripts = response.scripts.map((script, sceneIndex) => ({
    ...script,
    blocks: script.blocks.map((block, blockIndex) => ({
      ...block,
      blockId: plan.scenes[sceneIndex].blocks[blockIndex].blockId,
      evidenceFactIds: [...plan.scenes[sceneIndex].blocks[blockIndex].evidenceFactIds],
    })),
  }));
  return { request, plan, scripts };
}

function rawPlan(input: NarrativeScriptRequestV1): unknown {
  const openings = ['rescue_decision', 'architectural_reversal', 'dated_public_action'];
  return {
    schemaVersion: 'narrative-claim-plan-draft-v1',
    scenes: input.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      openingType: openings[sceneIndex],
      blocks: BLOCKS.map((kind, blockIndex) => ({
        kind,
        claims: [{
          text: `Claim ${blockIndex + 1}`,
          relation: blockIndex === 3 ? 'interpretation' : 'direct',
          evidenceFactIds: [scene.evidenceFacts[blockIndex % 4].factId],
        }],
      })),
    })),
  };
}

const WORDS = [
  ['catedral', 'isla', 'piedra', 'torre', 'fachada', 'templo', 'orilla', 'campana'],
  ['palacio', 'foso', 'museo', 'patio', 'galería', 'fortaleza', 'colección', 'público'],
  ['jardín', 'cafés', 'arcadas', 'comercio', 'paseo', 'foro', 'columnas', 'plaza'],
];
const LINKS = ['la', 'de', 'y', 'en', 'con', 'que', 'su', 'para'];

function sentence(scene: number, block: number): string {
  const words = Array.from({ length: 42 }, (_, index) => {
    if (block === 1 && index === 0) return 'Mira';
    return index % 2 === 0 ? WORDS[scene][(index + block) % 8] : LINKS[(index + block) % 8];
  });
  words[41] += '.';
  return words.join(' ');
}

function transition(scene: number, target: string | null): string {
  const words = target ? ['Continúa', 'ahora', 'hacia', target] : ['Aquí', 'termina', 'nuestro', 'recorrido'];
  while (words.length < 22) {
    const index = words.length;
    words.push(index % 2 === 0 ? LINKS[index % 8] : WORDS[scene][index % 8]);
  }
  words[21] += '.';
  return words.join(' ');
}

function rawProse(input: NarrativeScriptRequestV1): unknown {
  return {
    schemaVersion: 'narrative-prose-draft-v2',
    scripts: input.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      blocks: BLOCKS.map((kind, blockIndex) => ({
        kind, text: sentence(sceneIndex, blockIndex),
      })),
      transitionText: transition(sceneIndex, scene.nextSceneId),
    })),
  };
}

function deepseekResponse(toolName: string, value: unknown): { data: unknown } {
  return { data: { choices: [{ message: { tool_calls: [{ function: {
    name: toolName, arguments: JSON.stringify(value),
  } }] } }] } };
}

function ollamaResponse(value: unknown): { data: unknown } {
  return { data: { message: { content: JSON.stringify(value) } } };
}

function modelResponses() {
  const digest = '4'.repeat(64);
  return {
    digest,
    tags: { data: { models: [{
      name: 'gemma4:12b', digest, size: 8_000,
      details: { parameter_size: '12B', quantization_level: 'Q4_K_M' },
    }] } },
    ps: { data: { models: [{
      name: 'gemma4:12b', digest, size: 8_500, size_vram: 8_500,
    }] } },
  };
}

function groundingReport(): NarrativeGroundingCriticReportV1 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v1',
    unsupportedClaims: [], improperCausality: [], misleadingOmissions: [],
    repairInstructions: [],
  };
}

function finalReport(input: NarrativeScriptRequestV1): NarrativeCriticReportV2 {
  return {
    schemaVersion: 'narrative-critic-report-v2',
    newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: input.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Cumple.',
      })),
    },
    premiumReadiness: 4,
    repairInstructions: [],
  };
}

describe('Narrative pilot model adapters v2', () => {
  it('requests a strict-compatible factual plan from DeepSeek and canonicalizes it', async () => {
    const { request } = fixture();
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const tool = (body.tools as any[])[0].function;
      expect(tool.strict).toBe(true);
      expect(JSON.stringify(tool.parameters)).not.toMatch(/minItems|maxItems|uniqueItems/);
      return deepseekResponse(tool.name, rawPlan(request));
    });
    const result = await generateNarrativeClaimPlanV2(request, { apiKey: 'test', post });

    expect(result.status).toBe('valid');
    expect(result.value?.scenes[0].blocks[0].claims[0].claimId)
      .toBe('notre-dame:claim:01');
  });

  it('requests prose without model-controlled metadata and derives final scripts', async () => {
    const { request, plan } = fixture();
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const tool = (body.tools as any[])[0].function;
      const schema = JSON.stringify(tool.parameters);
      expect(schema).not.toMatch(/blockId|evidenceFactIds|targetSceneId|wordCount|openingType/);
      return deepseekResponse(tool.name, rawProse(request));
    });
    const result = await generateNarrativeProseV2(request, plan, { apiKey: 'test', post });

    expect(result.status).toBe('valid');
    expect(result.value?.[0].blocks[0].blockId).toBe('notre-dame:opening');
    expect(result.value?.[0].wordCount).toBeGreaterThanOrEqual(220);
  });

  it('fingerprints two separate generator prompts and freezes no-thinking parameters', () => {
    expect(narrativePlanGeneratorPromptFingerprintV2())
      .not.toBe(narrativeProseGeneratorPromptFingerprintV2());
    expect(NARRATIVE_GENERATOR_PARAMETERS_V2).toEqual({
      temperature: 0, maxTokens: 8_000, thinking: false, strictSchema: true,
    });
  });

  it('requires the exact Q4 Gemma digest to be fully loaded in GPU memory', async () => {
    const responses = modelResponses();
    const get = jest.fn(async (url: string) => url.endsWith('/api/ps') ? responses.ps : responses.tags);
    const model = await inspectNarrativeCriticModelV2({ get });

    expect(model).toMatchObject({
      name: 'gemma4:12b', digest: responses.digest,
      quantizationLevel: 'Q4_K_M', fullyGpu: true, sizeBytes: 8_500, sizeVramBytes: 8_500,
    });
  });

  it('rejects Gemma when only part of the model is in VRAM', async () => {
    const responses = modelResponses();
    (responses.ps.data.models[0] as any).size_vram = 4_000;
    const get = jest.fn(async (url: string) => url.endsWith('/api/ps') ? responses.ps : responses.tags);

    await expect(inspectNarrativeCriticModelV2({ get })).rejects.toThrow('fully loaded on GPU');
  });

  it('validates grounding and final finding-only reports through Ollama schemas', async () => {
    const { request, plan, scripts } = fixture();
    const responses = modelResponses();
    const get = jest.fn(async (url: string) => url.endsWith('/api/ps') ? responses.ps : responses.tags);
    const model = await inspectNarrativeCriticModelV2({ get });

    const grounding = await requestNarrativeGroundingCritiqueV2(
      buildNarrativeGroundingCriticRequestV1(request, plan), model,
      { post: jest.fn(async () => ollamaResponse(groundingReport())) }
    );
    const final = await requestNarrativeFinalCritiqueV2(
      buildNarrativeCriticRequestV2(request, plan, scripts), model,
      { post: jest.fn(async () => ollamaResponse(finalReport(request))) }
    );

    expect(grounding.value).toEqual(groundingReport());
    expect(final.value).toEqual(finalReport(request));
    expect(NARRATIVE_CRITIC_PARAMETERS_V2).toMatchObject({
      temperature: 0, seed: 42, numCtx: 16_384, maxTokens: 4_000, think: false,
    });
  });

  it('uses four independent prompt fingerprints and asks neither critic for a verdict', () => {
    const fingerprints = [
      narrativePlanGeneratorPromptFingerprintV2(),
      narrativeProseGeneratorPromptFingerprintV2(),
      narrativeGroundingCriticPromptFingerprintV2(),
      narrativeFinalCriticPromptFingerprintV2(),
    ];
    expect(new Set(fingerprints).size).toBe(4);
  });
});
