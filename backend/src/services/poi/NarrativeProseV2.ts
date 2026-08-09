import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeClaimPlanV1,
  validateNarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import {
  NarrativeBlockKindV1,
  NarrativeScriptRequestV1,
  SceneNarrativeScriptV1,
  narrativeWordCountV1,
  validateNarrativeScriptRequestV1,
  validateNarrativeScriptsV1,
} from './NarrativePilotV1';

export const NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V2 = 'narrative-prose-draft-v2' as const;

export interface NarrativeProseDraftBlockV2 {
  kind: NarrativeBlockKindV1;
  text: string;
}

export interface NarrativeProseDraftSceneV2 {
  sceneId: string;
  blocks: NarrativeProseDraftBlockV2[];
  transitionText: string;
}

export interface NarrativeProseDraftV2 {
  schemaVersion: typeof NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V2;
  scripts: NarrativeProseDraftSceneV2[];
}

const BLOCK_KINDS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const NAVIGATION = /\b(avanza|camina|continua|dirigete|gira|sigue|cruza|sal|ve|sube|baja|acercate)\b/u;
const TOUR_END = /\b(termina|finaliza|concluye|cierra|fin)\b/u;
const FACTUAL_EVENT = /\b(asedio|batalla|coronacion|guerra|incendio|revolucion|rebelion|motin)\b/u;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function spaceTokenCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function strictObject(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

export function narrativeProseDraftSchemaV2(): Record<string, unknown> {
  const block = strictObject({
    kind: { type: 'string', enum: BLOCK_KINDS },
    text: { type: 'string' },
  });
  const scene = strictObject({
    sceneId: { type: 'string' },
    blocks: { type: 'array', items: block },
    transitionText: { type: 'string' },
  });
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V2] },
    scripts: { type: 'array', items: scene },
  });
}

function assertTransition(text: string, request: NarrativeScriptRequestV1, sceneIndex: number): void {
  const expected = request.scenes[sceneIndex];
  const value = normalized(text);
  if (/\d/u.test(value) || FACTUAL_EVENT.test(value)) {
    throw new Error(`narrative prose ${expected.sceneId} transition must be exclusively navigational`);
  }
  if (expected.nextSceneId) {
    const target = normalized(expected.nextSceneId);
    const targetWords = target.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (!NAVIGATION.test(value) || !targetWords.every((word) => value.includes(word))) {
      throw new Error(`narrative prose ${expected.sceneId} transition must navigate to next scene ${expected.nextSceneId}`);
    }
  } else if (!TOUR_END.test(value)) {
    throw new Error(`narrative prose ${expected.sceneId} transition must state the tour end`);
  }
}

export function validateNarrativeProseDraftV2(
  raw: unknown,
  request: NarrativeScriptRequestV1
): NarrativeProseDraftV2 {
  validateNarrativeScriptRequestV1(request);
  const root = objectValue(raw, 'narrative prose draft');
  exactKeys(root, ['schemaVersion', 'scripts'], 'narrative prose draft');
  if (root.schemaVersion !== NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V2) {
    throw new Error('invalid narrative prose draft schemaVersion');
  }
  if (!Array.isArray(root.scripts) || root.scripts.length !== request.scenes.length) {
    throw new Error('narrative prose draft must preserve exact scene count');
  }
  const scripts = root.scripts.map((rawScript, sceneIndex) => {
    const expected = request.scenes[sceneIndex];
    const script = objectValue(rawScript, `narrative prose scripts[${sceneIndex}]`);
    exactKeys(
      script,
      ['sceneId', 'blocks', 'transitionText'],
      `narrative prose scripts[${sceneIndex}]`
    );
    if (script.sceneId !== expected.sceneId) throw new Error('narrative prose scene order changed');
    if (!Array.isArray(script.blocks) || script.blocks.length !== BLOCK_KINDS.length) {
      throw new Error(`narrative prose ${expected.sceneId} requires five blocks`);
    }
    const blocks = script.blocks.map((rawBlock, blockIndex) => {
      const block = objectValue(rawBlock, `${expected.sceneId} prose blocks[${blockIndex}]`);
      exactKeys(block, ['kind', 'text'], `${expected.sceneId} prose blocks[${blockIndex}]`);
      const kind = BLOCK_KINDS[blockIndex];
      if (block.kind !== kind) throw new Error(`narrative prose ${expected.sceneId} block order changed`);
      const text = requiredString(block.text, `${expected.sceneId} ${kind} text`);
      const count = spaceTokenCount(text);
      if (count < 42 || count > 45) {
        throw new Error(`narrative prose ${expected.sceneId} ${kind} requires 42 to 45 space tokens`);
      }
      return { kind, text };
    });
    const transitionText = requiredString(
      script.transitionText, `${expected.sceneId} transition text`
    );
    const transitionTokens = spaceTokenCount(transitionText);
    if (transitionTokens < 22 || transitionTokens > 25) {
      throw new Error(`narrative prose ${expected.sceneId} transition requires 22 to 25 space tokens`);
    }
    assertTransition(transitionText, request, sceneIndex);
    return { sceneId: expected.sceneId, blocks, transitionText };
  });
  return { schemaVersion: NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V2, scripts };
}

export function materializeNarrativeScriptsV2(
  raw: unknown,
  request: NarrativeScriptRequestV1,
  plan: NarrativeClaimPlanV1
): SceneNarrativeScriptV1[] {
  const canonicalPlan = validateNarrativeClaimPlanV1(plan, request);
  const prose = validateNarrativeProseDraftV2(raw, request);
  const scripts: SceneNarrativeScriptV1[] = prose.scripts.map((script, sceneIndex) => {
    const expected = request.scenes[sceneIndex];
    const planned = canonicalPlan.scenes[sceneIndex];
    const result: SceneNarrativeScriptV1 = {
      sceneId: expected.sceneId,
      openingType: planned.openingType,
      blocks: script.blocks.map((block, blockIndex) => ({
        blockId: planned.blocks[blockIndex].blockId,
        kind: block.kind,
        text: block.text,
        evidenceFactIds: [...planned.blocks[blockIndex].evidenceFactIds],
      })),
      transition: {
        kind: expected.nextSceneId ? 'walk_to_next' : 'tour_end',
        targetSceneId: expected.nextSceneId,
        text: script.transitionText,
      },
      wordCount: 0,
    };
    result.wordCount = narrativeWordCountV1(result);
    return result;
  });
  return validateNarrativeScriptsV1(scripts, request);
}

export function narrativeProseFingerprintV2(scripts: SceneNarrativeScriptV1[]): string {
  return editorialFingerprintV7(scripts);
}
