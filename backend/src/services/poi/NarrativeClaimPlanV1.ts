import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeBlockKindV1,
  NarrativeOpeningTypeV1,
  NarrativeScriptRequestV1,
  validateNarrativeScriptRequestV1,
} from './NarrativePilotV1';

export const NARRATIVE_CLAIM_PLAN_DRAFT_SCHEMA_VERSION_V1 =
  'narrative-claim-plan-draft-v1' as const;
export const NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V1 = 'narrative-claim-plan-v1' as const;

export type NarrativeClaimRelationV1 =
  | 'direct'
  | 'chronology'
  | 'causality'
  | 'interpretation';

export interface NarrativeClaimPlanClaimV1 {
  claimId: string;
  text: string;
  relation: NarrativeClaimRelationV1;
  evidenceFactIds: string[];
}

export interface NarrativeClaimPlanBlockV1 {
  blockId: string;
  kind: NarrativeBlockKindV1;
  evidenceFactIds: string[];
  claims: NarrativeClaimPlanClaimV1[];
}

export interface NarrativeClaimPlanSceneV1 {
  sceneId: string;
  openingType: NarrativeOpeningTypeV1;
  blocks: NarrativeClaimPlanBlockV1[];
}

export interface NarrativeClaimPlanV1 {
  schemaVersion: typeof NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V1;
  scenes: NarrativeClaimPlanSceneV1[];
}

const BLOCK_KINDS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const OPENING_TYPES: NarrativeOpeningTypeV1[] = [
  'rescue_decision', 'architectural_reversal', 'dated_public_action',
];
const RELATIONS: NarrativeClaimRelationV1[] = [
  'direct', 'chronology', 'causality', 'interpretation',
];

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

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must contain strings`);
  }
  const result = value.map((item) => (item as string).trim());
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique`);
  return result;
}

function strictObject(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

export function narrativeClaimPlanDraftSchemaV1(): Record<string, unknown> {
  const claim = strictObject({
    text: { type: 'string' },
    relation: { type: 'string', enum: RELATIONS },
    evidenceFactIds: { type: 'array', items: { type: 'string' } },
  });
  const block = strictObject({
    kind: { type: 'string', enum: BLOCK_KINDS },
    claims: { type: 'array', items: claim },
  });
  const scene = strictObject({
    sceneId: { type: 'string' },
    openingType: { type: 'string', enum: OPENING_TYPES },
    blocks: { type: 'array', items: block },
  });
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_CLAIM_PLAN_DRAFT_SCHEMA_VERSION_V1] },
    scenes: { type: 'array', items: scene },
  });
}

export function canonicalizeNarrativeClaimPlanV1(
  raw: unknown,
  request: NarrativeScriptRequestV1
): NarrativeClaimPlanV1 {
  validateNarrativeScriptRequestV1(request);
  const root = objectValue(raw, 'narrative claim plan draft');
  exactKeys(root, ['schemaVersion', 'scenes'], 'narrative claim plan draft');
  if (root.schemaVersion !== NARRATIVE_CLAIM_PLAN_DRAFT_SCHEMA_VERSION_V1) {
    throw new Error('invalid narrative claim plan draft schemaVersion');
  }
  if (!Array.isArray(root.scenes) || root.scenes.length !== request.scenes.length) {
    throw new Error('narrative claim plan must preserve exact scene count');
  }

  const scenes = root.scenes.map((rawScene, sceneIndex) => {
    const expected = request.scenes[sceneIndex];
    const scene = objectValue(rawScene, `narrative claim plan scenes[${sceneIndex}]`);
    exactKeys(scene, ['sceneId', 'openingType', 'blocks'], `narrative claim plan scenes[${sceneIndex}]`);
    if (scene.sceneId !== expected.sceneId) {
      throw new Error('narrative claim plan scene order changed');
    }
    if (!OPENING_TYPES.includes(scene.openingType as NarrativeOpeningTypeV1)) {
      throw new Error(`narrative claim plan ${expected.sceneId} has invalid opening`);
    }
    if (!Array.isArray(scene.blocks) || scene.blocks.length !== BLOCK_KINDS.length) {
      throw new Error(`narrative claim plan ${expected.sceneId} requires five blocks`);
    }

    const allowedFacts = new Set(expected.evidenceFacts.map((fact) => fact.factId));
    let claimNumber = 0;
    const blocks = scene.blocks.map((rawBlock, blockIndex) => {
      const block = objectValue(rawBlock, `${expected.sceneId} plan blocks[${blockIndex}]`);
      exactKeys(block, ['kind', 'claims'], `${expected.sceneId} plan blocks[${blockIndex}]`);
      const kind = BLOCK_KINDS[blockIndex];
      if (block.kind !== kind) {
        throw new Error(`narrative claim plan ${expected.sceneId} block order changed`);
      }
      if (!Array.isArray(block.claims) || block.claims.length === 0) {
        throw new Error(`narrative claim plan ${expected.sceneId} ${kind} requires a claim`);
      }
      const claims = block.claims.map((rawClaim, claimIndex) => {
        const claim = objectValue(
          rawClaim, `${expected.sceneId} ${kind} claims[${claimIndex}]`
        );
        exactKeys(
          claim,
          ['text', 'relation', 'evidenceFactIds'],
          `${expected.sceneId} ${kind} claims[${claimIndex}]`
        );
        if (!RELATIONS.includes(claim.relation as NarrativeClaimRelationV1)) {
          throw new Error(`${expected.sceneId} ${kind} claim has invalid relation`);
        }
        const evidenceFactIds = stringArray(
          claim.evidenceFactIds, `${expected.sceneId} ${kind} claim evidence`
        );
        if (evidenceFactIds.some((factId) => !allowedFacts.has(factId))) {
          throw new Error(`${expected.sceneId} claim evidence must belong to the same scene`);
        }
        claimNumber += 1;
        return {
          claimId: `${expected.sceneId}:claim:${String(claimNumber).padStart(2, '0')}`,
          text: requiredString(claim.text, `${expected.sceneId} ${kind} claim text`),
          relation: claim.relation as NarrativeClaimRelationV1,
          evidenceFactIds,
        };
      });
      return {
        blockId: `${expected.sceneId}:${kind}`,
        kind,
        evidenceFactIds: [...new Set(claims.flatMap((claim) => claim.evidenceFactIds))],
        claims,
      };
    });

    const factIds = expected.evidenceFacts.map((fact) => fact.factId);
    const factBlockUses = new Map(factIds.map((factId) => [factId, 0]));
    for (const block of blocks) {
      for (const factId of block.evidenceFactIds) {
        factBlockUses.set(factId, (factBlockUses.get(factId) ?? 0) + 1);
      }
    }
    if (factIds.some((factId) => factBlockUses.get(factId) === 0)) {
      throw new Error(`narrative claim plan ${expected.sceneId} must use every evidence fact`);
    }
    const reuseLimit = Math.ceil(BLOCK_KINDS.length / factIds.length);
    if (factIds.some((factId) => (factBlockUses.get(factId) ?? 0) > reuseLimit)) {
      throw new Error(`narrative claim plan ${expected.sceneId} exceeds evidence reuse limit ${reuseLimit}`);
    }
    return {
      sceneId: expected.sceneId,
      openingType: scene.openingType as NarrativeOpeningTypeV1,
      blocks,
    };
  });

  if (new Set(scenes.map((scene) => scene.openingType)).size !== scenes.length) {
    throw new Error('narrative claim plan requires a distinct opening per scene');
  }
  return {
    schemaVersion: NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V1,
    scenes,
  };
}

export function validateNarrativeClaimPlanV1(
  raw: unknown,
  request: NarrativeScriptRequestV1
): NarrativeClaimPlanV1 {
  const root = objectValue(raw, 'narrative claim plan');
  exactKeys(root, ['schemaVersion', 'scenes'], 'narrative claim plan');
  if (root.schemaVersion !== NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V1
    || !Array.isArray(root.scenes)) {
    throw new Error('invalid narrative claim plan metadata');
  }

  const draft = {
    schemaVersion: NARRATIVE_CLAIM_PLAN_DRAFT_SCHEMA_VERSION_V1,
    scenes: root.scenes.map((rawScene, sceneIndex) => {
      const scene = objectValue(rawScene, `narrative claim plan scenes[${sceneIndex}]`);
      exactKeys(scene, ['sceneId', 'openingType', 'blocks'], `narrative claim plan scenes[${sceneIndex}]`);
      if (!Array.isArray(scene.blocks)) throw new Error('narrative claim plan blocks must be an array');
      return {
        sceneId: scene.sceneId,
        openingType: scene.openingType,
        blocks: scene.blocks.map((rawBlock, blockIndex) => {
          const block = objectValue(rawBlock, `narrative claim plan blocks[${blockIndex}]`);
          exactKeys(
            block,
            ['blockId', 'kind', 'evidenceFactIds', 'claims'],
            `narrative claim plan blocks[${blockIndex}]`
          );
          if (!Array.isArray(block.claims)) throw new Error('narrative claim plan claims must be an array');
          return {
            kind: block.kind,
            claims: block.claims.map((rawClaim, claimIndex) => {
              const claim = objectValue(rawClaim, `narrative claim plan claims[${claimIndex}]`);
              exactKeys(
                claim,
                ['claimId', 'text', 'relation', 'evidenceFactIds'],
                `narrative claim plan claims[${claimIndex}]`
              );
              return {
                text: claim.text,
                relation: claim.relation,
                evidenceFactIds: claim.evidenceFactIds,
              };
            }),
          };
        }),
      };
    }),
  };
  const canonical = canonicalizeNarrativeClaimPlanV1(draft, request);
  for (const [sceneIndex, scene] of canonical.scenes.entries()) {
    const suppliedScene = root.scenes[sceneIndex] as Record<string, unknown>;
    const suppliedBlocks = suppliedScene.blocks as Array<Record<string, unknown>>;
    for (const [blockIndex, block] of scene.blocks.entries()) {
      if (suppliedBlocks[blockIndex].blockId !== block.blockId) {
        throw new Error('narrative claim plan changed a canonical block ID');
      }
      const suppliedClaims = suppliedBlocks[blockIndex].claims as Array<Record<string, unknown>>;
      for (const [claimIndex, claim] of block.claims.entries()) {
        if (suppliedClaims[claimIndex].claimId !== claim.claimId) {
          throw new Error('narrative claim plan changed a canonical claim ID');
        }
      }
      if (editorialFingerprintV7(suppliedBlocks[blockIndex].evidenceFactIds)
        !== editorialFingerprintV7(block.evidenceFactIds)) {
        throw new Error('narrative claim plan changed derived block evidence');
      }
    }
  }
  return canonical;
}

export function narrativeClaimPlanFingerprintV1(plan: NarrativeClaimPlanV1): string {
  return editorialFingerprintV7(plan);
}
