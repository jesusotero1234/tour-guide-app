import { readFileSync } from 'fs';
import { join } from 'path';
import {
  canonicalizeNarrativeClaimPlanV1,
  narrativeClaimPlanDraftSchemaV1,
  narrativeClaimPlanFingerprintV1,
  validateNarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import { NarrativeBlockKindV1, NarrativeScriptRequestV1 } from './NarrativePilotV1';

const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];

function request(): NarrativeScriptRequestV1 {
  const path = join(
    __dirname, '..', '..', '..', 'fixtures', 'editorial-v7', 'paris-history-en-120.json'
  );
  return buildParisNarrativeScriptRequestV1(
    JSON.parse(readFileSync(path, 'utf8')) as EditorialWorkbenchV7
  );
}

function draft(input = request()): unknown {
  const openings = ['rescue_decision', 'architectural_reversal', 'dated_public_action'];
  return {
    schemaVersion: 'narrative-claim-plan-draft-v1',
    scenes: input.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      openingType: openings[sceneIndex],
      blocks: BLOCKS.map((kind, blockIndex) => ({
        kind,
        claims: [{
          text: `Afirmación ${blockIndex + 1} sustentada de ${scene.name}`,
          relation: blockIndex === 3 ? 'interpretation' : 'direct',
          evidenceFactIds: [scene.evidenceFacts[blockIndex % scene.evidenceFacts.length].factId],
        }],
      })),
    })),
  };
}

describe('NarrativeClaimPlanV1', () => {
  it('assigns canonical claim IDs and exact five-block IDs in route order', () => {
    const input = request();
    const plan = canonicalizeNarrativeClaimPlanV1(draft(input), input);

    expect(plan.scenes.map((scene) => scene.sceneId)).toEqual(
      input.scenes.map((scene) => scene.sceneId)
    );
    expect(plan.scenes[0].blocks.map((block) => block.blockId)).toEqual([
      'notre-dame:opening',
      'notre-dame:look',
      'notre-dame:human_conflict',
      'notre-dame:interpretation',
      'notre-dame:closing',
    ]);
    expect(plan.scenes[0].blocks.flatMap((block) => block.claims).map((claim) => claim.claimId))
      .toEqual([
        'notre-dame:claim:01', 'notre-dame:claim:02', 'notre-dame:claim:03',
        'notre-dame:claim:04', 'notre-dame:claim:05',
      ]);
  });

  it('uses every scene fact and permits at most ceil(5 / fact count) block uses', () => {
    const input = request();
    const plan = canonicalizeNarrativeClaimPlanV1(draft(input), input);

    for (const [index, scene] of plan.scenes.entries()) {
      const uses = scene.blocks.flatMap((block) => block.evidenceFactIds);
      expect(new Set(uses)).toEqual(new Set(input.scenes[index].evidenceFacts.map((fact) => fact.factId)));
      expect(Math.max(...input.scenes[index].evidenceFacts.map(
        (fact) => uses.filter((factId) => factId === fact.factId).length
      ))).toBeLessThanOrEqual(Math.ceil(5 / input.scenes[index].evidenceFacts.length));
    }
  });

  it('derives block evidence from claims rather than accepting model block metadata', () => {
    const input = request();
    const raw = draft(input) as any;
    raw.scenes[0].blocks[0].claims.push({
      text: 'Una cronología combina dos hechos permitidos',
      relation: 'chronology',
      evidenceFactIds: [
        input.scenes[0].evidenceFacts[0].factId,
        input.scenes[0].evidenceFacts[1].factId,
      ],
    });
    raw.scenes[0].blocks[1].claims[0].evidenceFactIds = [
      input.scenes[0].evidenceFacts[2].factId,
    ];

    const block = canonicalizeNarrativeClaimPlanV1(raw, input).scenes[0].blocks[0];
    expect(block.evidenceFactIds).toEqual([
      input.scenes[0].evidenceFacts[0].factId,
      input.scenes[0].evidenceFacts[1].factId,
    ]);
  });

  it('rejects an evidence reference owned by another scene', () => {
    const input = request();
    const raw = draft(input) as any;
    raw.scenes[0].blocks[0].claims[0].evidenceFactIds = [
      input.scenes[1].evidenceFacts[0].factId,
    ];

    expect(() => canonicalizeNarrativeClaimPlanV1(raw, input)).toThrow('same scene');
  });

  it('rejects plans that omit an available fact', () => {
    const input = request();
    const raw = draft(input) as any;
    raw.scenes[0].blocks[3].claims[0].evidenceFactIds = [input.scenes[0].evidenceFacts[0].factId];

    expect(() => canonicalizeNarrativeClaimPlanV1(raw, input)).toThrow('use every evidence fact');
  });

  it('rejects evidence reused in too many blocks', () => {
    const input = request();
    const raw = draft(input) as any;
    raw.scenes[0].blocks[0].claims[0].evidenceFactIds = [input.scenes[0].evidenceFacts[0].factId];
    raw.scenes[0].blocks[1].claims[0].evidenceFactIds = [input.scenes[0].evidenceFacts[0].factId];
    raw.scenes[0].blocks[2].claims[0].evidenceFactIds = [
      input.scenes[0].evidenceFacts[1].factId,
      input.scenes[0].evidenceFacts[2].factId,
    ];
    raw.scenes[0].blocks[4].claims[0].evidenceFactIds = [input.scenes[0].evidenceFacts[0].factId];

    expect(() => canonicalizeNarrativeClaimPlanV1(raw, input)).toThrow('reuse limit');
  });

  it('rejects scene, block, and opening permutations', () => {
    const input = request();
    const reorderedScenes = draft(input) as any;
    [reorderedScenes.scenes[0], reorderedScenes.scenes[1]] = [
      reorderedScenes.scenes[1], reorderedScenes.scenes[0],
    ];
    expect(() => canonicalizeNarrativeClaimPlanV1(reorderedScenes, input)).toThrow('scene order');

    const reorderedBlocks = draft(input) as any;
    [reorderedBlocks.scenes[0].blocks[0], reorderedBlocks.scenes[0].blocks[1]] = [
      reorderedBlocks.scenes[0].blocks[1], reorderedBlocks.scenes[0].blocks[0],
    ];
    expect(() => canonicalizeNarrativeClaimPlanV1(reorderedBlocks, input)).toThrow('block order');

    const repeatedOpening = draft(input) as any;
    repeatedOpening.scenes[1].openingType = repeatedOpening.scenes[0].openingType;
    expect(() => canonicalizeNarrativeClaimPlanV1(repeatedOpening, input)).toThrow('opening');
  });

  it('rejects non-atomic, empty, or unsupported claim relations', () => {
    const input = request();
    const empty = draft(input) as any;
    empty.scenes[0].blocks[0].claims = [];
    expect(() => canonicalizeNarrativeClaimPlanV1(empty, input)).toThrow('claim');

    const unsupported = draft(input) as any;
    unsupported.scenes[0].blocks[0].claims[0].relation = 'speculation';
    expect(() => canonicalizeNarrativeClaimPlanV1(unsupported, input)).toThrow('relation');
  });

  it('is independent of evidence array order', () => {
    const original = request();
    const permuted = structuredClone(original);
    permuted.scenes.forEach((scene) => scene.evidenceFacts.reverse());
    const raw = draft(original);

    expect(canonicalizeNarrativeClaimPlanV1(raw, permuted))
      .toEqual(canonicalizeNarrativeClaimPlanV1(raw, original));
  });

  it('validates canonical plans without accepting unknown fields or changed IDs', () => {
    const input = request();
    const plan = canonicalizeNarrativeClaimPlanV1(draft(input), input);
    expect(validateNarrativeClaimPlanV1(plan, input)).toEqual(plan);

    const changedId = structuredClone(plan) as any;
    changedId.scenes[0].blocks[0].claims[0].claimId = 'model-controlled';
    expect(() => validateNarrativeClaimPlanV1(changedId, input)).toThrow('canonical claim ID');

    const extra = structuredClone(plan) as any;
    extra.reviewState = 'human_review';
    expect(() => validateNarrativeClaimPlanV1(extra, input)).toThrow('unexpected');
  });

  it('uses a DeepSeek strict-compatible draft schema with runtime cardinalities', () => {
    const schema = narrativeClaimPlanDraftSchemaV1();
    const serialized = JSON.stringify(schema);

    expect(serialized).not.toMatch(/minItems|maxItems|uniqueItems|minLength|maxLength/);
    expect(serialized).toContain('"additionalProperties":false');
    expect(serialized).toContain('"relation":{"type":"string","enum"');

    function assertObjects(raw: unknown): void {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const node = raw as Record<string, unknown>;
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties as Record<string, unknown>));
      }
      Object.values(node).forEach((child) => {
        if (Array.isArray(child)) child.forEach(assertObjects);
        else assertObjects(child);
      });
    }
    assertObjects(schema);
  });

  it('fingerprints only canonical factual-plan content', () => {
    const input = request();
    const plan = canonicalizeNarrativeClaimPlanV1(draft(input), input);
    const saved = narrativeClaimPlanFingerprintV1(plan);
    const changed = structuredClone(plan);
    changed.scenes[0].blocks[0].claims[0].text += ' cambiado';

    expect(narrativeClaimPlanFingerprintV1(plan)).toBe(saved);
    expect(narrativeClaimPlanFingerprintV1(changed)).not.toBe(saved);
  });
});
