import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeEvidenceCaseV3,
  NarrativeEvidenceFactV3,
  NarrativeEvidenceRoleV3,
  narrativeEvidenceFactFingerprintV3,
} from './NarrativeEvidenceV3';
import {
  NarrativeBlockKindV1,
  NarrativeOpeningTypeV1,
  SceneNarrativeScriptV1,
  narrativeWordCountV1,
} from './NarrativePilotV1';

export const NARRATIVE_SCRIPT_REQUEST_SCHEMA_VERSION_V3 = 'narrative-script-request-v3' as const;
export const NARRATIVE_CLAIM_PLAN_DRAFT_SCHEMA_VERSION_V3 =
  'narrative-claim-plan-draft-v3' as const;
export const NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V3 = 'narrative-claim-plan-v3' as const;
export const NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V3 = 'narrative-prose-draft-v3' as const;

export type NarrativeClaimRelationV3 =
  | 'direct'
  | 'chronology'
  | 'causality'
  | 'interpretation';

export interface NarrativeScriptSceneRequestV3 {
  sceneId: string;
  name: string;
  ownerCanonicalId: string;
  routePosition: number;
  previousSceneId: string | null;
  nextSceneId: string | null;
  contribution: string;
  allowedProperNouns: string[];
  evidenceFacts: NarrativeEvidenceFactV3[];
}

export interface NarrativeScriptRequestV3 {
  schemaVersion: typeof NARRATIVE_SCRIPT_REQUEST_SCHEMA_VERSION_V3;
  caseId: string;
  city: string;
  language: 'es-ES';
  promise: string;
  centralQuestion: string;
  routeFingerprint: string;
  sourceSnapshotFingerprint: string;
  routeSceneIds: string[];
  scenes: NarrativeScriptSceneRequestV3[];
}

export interface NarrativeClaimPlanClaimV3 {
  claimId: string;
  text: string;
  relation: NarrativeClaimRelationV3;
  evidenceFactIds: string[];
}

export interface NarrativeClaimPlanBlockV3 {
  blockId: string;
  kind: NarrativeBlockKindV1;
  purpose: string;
  evidenceFactIds: string[];
  claims: NarrativeClaimPlanClaimV3[];
}

export interface NarrativeClaimPlanSceneV3 {
  sceneId: string;
  openingType: NarrativeOpeningTypeV1;
  blocks: NarrativeClaimPlanBlockV3[];
}

export interface NarrativeClaimPlanV3 {
  schemaVersion: typeof NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V3;
  scenes: NarrativeClaimPlanSceneV3[];
}

export interface NarrativeProseDraftV3 {
  schemaVersion: typeof NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V3;
  scripts: Array<{
    sceneId: string;
    blocks: Array<{ kind: NarrativeBlockKindV1; text: string }>;
  }>;
}

const BLOCK_KINDS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const OPENING_TYPES: NarrativeOpeningTypeV1[] = [
  'rescue_decision', 'architectural_reversal', 'dated_public_action',
];
const RELATIONS: NarrativeClaimRelationV3[] = [
  'direct', 'chronology', 'causality', 'interpretation',
];
const ROLES: NarrativeEvidenceRoleV3[] = ['observable', 'historical', 'human'];
const VISUAL_INSTRUCTION = /\b(mira|observa|fíjate|levanta|busca|compara|gira)\b/iu;
const SPANISH_MARKERS = new Set([
  'a', 'al', 'como', 'con', 'de', 'del', 'el', 'en', 'es', 'esta', 'la', 'las',
  'lo', 'los', 'para', 'por', 'que', 'se', 'sin', 'su', 'un', 'una', 'y',
]);

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

function stringArray(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
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

function words(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? [];
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function properNouns(sceneName: string, caseData: NarrativeEvidenceCaseV3): string[] {
  const evidenceNames = caseData.scenes.flatMap((scene) => scene.evidenceFacts.flatMap((fact) => (
    fact.normalizedEs.match(/\b\p{Lu}[\p{L}’'-]+(?:\s+\p{Lu}[\p{L}’'-]+)*/gu) ?? []
  )));
  return [...new Set([
    sceneName,
    caseData.city,
    ...caseData.scenes.map((scene) => scene.name),
    ...evidenceNames,
  ].map((value) => value.trim()).filter(Boolean))];
}

function validateEvidenceFact(fact: NarrativeEvidenceFactV3, sceneId: string): void {
  const { fingerprint: _fingerprint, ...content } = fact;
  if (!fact.factId.trim() || !fact.ownerCanonicalId.trim() || !fact.originalExcerpt.trim()
    || !fact.normalizedEs.trim() || !ROLES.includes(fact.role)
    || fact.sources.length === 0
    || fact.fingerprint !== narrativeEvidenceFactFingerprintV3(content)) {
    throw new Error(`narrative v3 evidence changed for ${sceneId}:${fact.factId}`);
  }
  for (const source of fact.sources) {
    const url = new URL(source.url);
    const { fingerprint: sourceFingerprint, ...sourceContent } = source;
    if (url.protocol !== 'https:' || !source.sourceId.trim() || !source.revisionId.trim()
      || !Number.isFinite(Date.parse(source.capturedAt)) || !source.excerpt.trim()
      || sourceFingerprint !== editorialFingerprintV7(sourceContent)) {
      throw new Error(`narrative v3 source changed for ${sceneId}:${fact.factId}`);
    }
  }
}

export function buildNarrativeScriptRequestV3(
  caseData: NarrativeEvidenceCaseV3
): NarrativeScriptRequestV3 {
  if (caseData.schemaVersion !== 'narrative-evidence-v3' || caseData.language !== 'es-ES'
    || caseData.theme !== 'history' || caseData.scenes.length !== 3
    || caseData.scenes.some((scene) => !scene.readiness.ready)) {
    throw new Error('narrative v3 requires a ready three-scene evidence case');
  }
  const routeSceneIds = caseData.scenes.map((scene) => scene.sceneId);
  const request: NarrativeScriptRequestV3 = {
    schemaVersion: NARRATIVE_SCRIPT_REQUEST_SCHEMA_VERSION_V3,
    caseId: caseData.caseId,
    city: caseData.city,
    language: 'es-ES',
    promise: caseData.promise,
    centralQuestion: caseData.centralQuestion,
    routeFingerprint: caseData.routeFingerprint,
    sourceSnapshotFingerprint: caseData.sourceSnapshotFingerprint,
    routeSceneIds,
    scenes: caseData.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      name: scene.name,
      ownerCanonicalId: scene.ownerCanonicalId,
      routePosition: scene.routePosition,
      previousSceneId: scene.previousSceneId,
      nextSceneId: scene.nextSceneId,
      contribution: scene.contribution,
      allowedProperNouns: properNouns(scene.name, caseData),
      evidenceFacts: scene.evidenceFacts.map((fact) => ({
        ...fact,
        relationSupport: [...fact.relationSupport],
        sources: fact.sources.map((source) => ({ ...source })),
      })),
    })),
  };
  return validateNarrativeScriptRequestV3(request);
}

export function validateNarrativeScriptRequestV3(
  request: NarrativeScriptRequestV3
): NarrativeScriptRequestV3 {
  if (request.schemaVersion !== NARRATIVE_SCRIPT_REQUEST_SCHEMA_VERSION_V3
    || request.language !== 'es-ES' || request.scenes.length !== 3
    || request.routeSceneIds.length !== 3) {
    throw new Error('invalid narrative script request v3 metadata');
  }
  requiredString(request.caseId, 'narrative v3 caseId');
  requiredString(request.city, 'narrative v3 city');
  requiredString(request.promise, 'narrative v3 promise');
  requiredString(request.centralQuestion, 'narrative v3 central question');
  requiredString(request.routeFingerprint, 'narrative v3 route fingerprint');
  requiredString(request.sourceSnapshotFingerprint, 'narrative v3 source fingerprint');
  stringArray(request.routeSceneIds, 'narrative v3 route scene IDs');
  for (const [index, scene] of request.scenes.entries()) {
    if (scene.sceneId !== request.routeSceneIds[index] || scene.routePosition !== index + 1
      || scene.previousSceneId !== (request.routeSceneIds[index - 1] ?? null)
      || scene.nextSceneId !== (request.routeSceneIds[index + 1] ?? null)) {
      throw new Error(`narrative v3 scene ${scene.sceneId} has invalid route neighbours`);
    }
    requiredString(scene.name, `narrative v3 ${scene.sceneId} name`);
    requiredString(scene.ownerCanonicalId, `narrative v3 ${scene.sceneId} owner`);
    requiredString(scene.contribution, `narrative v3 ${scene.sceneId} contribution`);
    stringArray(scene.allowedProperNouns, `narrative v3 ${scene.sceneId} proper nouns`);
    if (scene.evidenceFacts.length < 3 || scene.evidenceFacts.length > 6) {
      throw new Error(`narrative v3 ${scene.sceneId} requires three to six evidence facts`);
    }
    stringArray(scene.evidenceFacts.map((fact) => fact.factId), `${scene.sceneId} fact IDs`);
    scene.evidenceFacts.forEach((fact) => validateEvidenceFact(fact, scene.sceneId));
  }
  return request;
}

export function narrativeClaimPlanDraftSchemaV3(): Record<string, unknown> {
  const claim = strictObject({
    text: { type: 'string' },
    relation: { type: 'string', enum: RELATIONS },
    evidenceFactIds: { type: 'array', items: { type: 'string' } },
  });
  const block = strictObject({
    kind: { type: 'string', enum: BLOCK_KINDS },
    purpose: { type: 'string' },
    claims: { type: 'array', items: claim },
  });
  const scene = strictObject({
    sceneId: { type: 'string' },
    openingType: { type: 'string', enum: OPENING_TYPES },
    blocks: { type: 'array', items: block },
  });
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_CLAIM_PLAN_DRAFT_SCHEMA_VERSION_V3] },
    scenes: { type: 'array', items: scene },
  });
}

function validateRelationSupport(
  relation: NarrativeClaimRelationV3,
  facts: NarrativeEvidenceFactV3[],
  sceneId: string
): void {
  if (relation === 'causality' && facts.some((fact) => !fact.allowsCausality)) {
    throw new Error(`narrative v3 ${sceneId} evidence does not support causality`);
  }
  if (relation === 'chronology'
    && facts.some((fact) => !fact.relationSupport.includes('chronology'))) {
    throw new Error(`narrative v3 ${sceneId} evidence does not support chronology`);
  }
}

export function canonicalizeNarrativeClaimPlanV3(
  raw: unknown,
  request: NarrativeScriptRequestV3
): NarrativeClaimPlanV3 {
  validateNarrativeScriptRequestV3(request);
  const root = objectValue(raw, 'narrative claim plan draft v3');
  exactKeys(root, ['schemaVersion', 'scenes'], 'narrative claim plan draft v3');
  if (root.schemaVersion !== NARRATIVE_CLAIM_PLAN_DRAFT_SCHEMA_VERSION_V3
    || !Array.isArray(root.scenes) || root.scenes.length !== request.scenes.length) {
    throw new Error('invalid narrative claim plan draft v3 metadata');
  }
  const scenes = root.scenes.map((rawScene, sceneIndex): NarrativeClaimPlanSceneV3 => {
    const expected = request.scenes[sceneIndex];
    const scene = objectValue(rawScene, `narrative v3 plan scenes[${sceneIndex}]`);
    exactKeys(scene, ['sceneId', 'openingType', 'blocks'], `narrative v3 plan ${sceneIndex}`);
    if (scene.sceneId !== expected.sceneId) throw new Error('narrative v3 plan scene order changed');
    if (!OPENING_TYPES.includes(scene.openingType as NarrativeOpeningTypeV1)) {
      throw new Error(`narrative v3 ${expected.sceneId} opening is invalid`);
    }
    if (!Array.isArray(scene.blocks) || scene.blocks.length !== BLOCK_KINDS.length) {
      throw new Error(`narrative v3 ${expected.sceneId} requires five blocks`);
    }
    const allowedFacts = new Map(expected.evidenceFacts.map((fact) => [fact.factId, fact]));
    const assignedFacts = new Set<string>();
    let claimNumber = 0;
    const blocks = scene.blocks.map((rawBlock, blockIndex): NarrativeClaimPlanBlockV3 => {
      const block = objectValue(rawBlock, `${expected.sceneId} plan blocks[${blockIndex}]`);
      exactKeys(block, ['kind', 'purpose', 'claims'], `${expected.sceneId} plan block`);
      const kind = BLOCK_KINDS[blockIndex];
      if (block.kind !== kind) throw new Error(`narrative v3 ${expected.sceneId} block order changed`);
      if (!Array.isArray(block.claims)) throw new Error(`${expected.sceneId} claims must be an array`);
      const claims = block.claims.map((rawClaim, claimIndex): NarrativeClaimPlanClaimV3 => {
        const claim = objectValue(rawClaim, `${expected.sceneId} claims[${claimIndex}]`);
        exactKeys(claim, ['text', 'relation', 'evidenceFactIds'], `${expected.sceneId} claim`);
        if (!RELATIONS.includes(claim.relation as NarrativeClaimRelationV3)) {
          throw new Error(`narrative v3 ${expected.sceneId} claim relation is invalid`);
        }
        const evidenceFactIds = stringArray(
          claim.evidenceFactIds, `${expected.sceneId} claim evidence`
        );
        const facts = evidenceFactIds.map((factId) => {
          const fact = allowedFacts.get(factId);
          if (!fact) throw new Error(`narrative v3 claim evidence must belong to the same scene`);
          if (assignedFacts.has(factId)) {
            throw new Error(`narrative v3 evidence ${factId} is assigned to more than one claim`);
          }
          assignedFacts.add(factId);
          return fact;
        });
        const relation = claim.relation as NarrativeClaimRelationV3;
        validateRelationSupport(relation, facts, expected.sceneId);
        claimNumber += 1;
        return {
          claimId: `${expected.sceneId}:claim:${String(claimNumber).padStart(2, '0')}`,
          text: requiredString(claim.text, `${expected.sceneId} claim text`),
          relation,
          evidenceFactIds,
        };
      });
      return {
        blockId: `${expected.sceneId}:${kind}`,
        kind,
        purpose: requiredString(block.purpose, `${expected.sceneId} ${kind} purpose`),
        evidenceFactIds: claims.flatMap((claim) => claim.evidenceFactIds),
        claims,
      };
    });
    const claims = blocks.flatMap((block) => block.claims);
    if (claims.length < 3 || claims.length > 6) {
      throw new Error(`narrative v3 ${expected.sceneId} requires three to six selected claims`);
    }
    const selectedRoles = new Set([...assignedFacts].map((factId) => allowedFacts.get(factId)?.role));
    if (ROLES.some((role) => !selectedRoles.has(role))) {
      throw new Error(`narrative v3 ${expected.sceneId} must select observable, historical, and human evidence`);
    }
    return {
      sceneId: expected.sceneId,
      openingType: scene.openingType as NarrativeOpeningTypeV1,
      blocks,
    };
  });
  return { schemaVersion: NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V3, scenes };
}

export function validateNarrativeClaimPlanV3(
  raw: unknown,
  request: NarrativeScriptRequestV3
): NarrativeClaimPlanV3 {
  const root = objectValue(raw, 'narrative claim plan v3');
  exactKeys(root, ['schemaVersion', 'scenes'], 'narrative claim plan v3');
  if (root.schemaVersion !== NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V3
    || !Array.isArray(root.scenes)) throw new Error('invalid narrative claim plan v3 metadata');
  const draft = {
    schemaVersion: NARRATIVE_CLAIM_PLAN_DRAFT_SCHEMA_VERSION_V3,
    scenes: root.scenes.map((rawScene, sceneIndex) => {
      const scene = objectValue(rawScene, `canonical v3 scenes[${sceneIndex}]`);
      exactKeys(scene, ['sceneId', 'openingType', 'blocks'], 'canonical v3 scene');
      if (!Array.isArray(scene.blocks)) throw new Error('canonical v3 blocks must be an array');
      return {
        sceneId: scene.sceneId,
        openingType: scene.openingType,
        blocks: scene.blocks.map((rawBlock) => {
          const block = objectValue(rawBlock, 'canonical v3 block');
          exactKeys(block, ['blockId', 'kind', 'purpose', 'evidenceFactIds', 'claims'], 'canonical v3 block');
          if (!Array.isArray(block.claims)) throw new Error('canonical v3 claims must be an array');
          return {
            kind: block.kind,
            purpose: block.purpose,
            claims: block.claims.map((rawClaim) => {
              const claim = objectValue(rawClaim, 'canonical v3 claim');
              exactKeys(claim, ['claimId', 'text', 'relation', 'evidenceFactIds'], 'canonical v3 claim');
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
  const canonical = canonicalizeNarrativeClaimPlanV3(draft, request);
  if (editorialFingerprintV7(canonical) !== editorialFingerprintV7(raw)) {
    throw new Error('narrative claim plan v3 canonical metadata changed');
  }
  return canonical;
}

export function narrativeClaimPlanFingerprintV3(plan: NarrativeClaimPlanV3): string {
  return editorialFingerprintV7(plan);
}

export function narrativeProseDraftSchemaV3(): Record<string, unknown> {
  const block = strictObject({
    kind: { type: 'string', enum: BLOCK_KINDS },
    text: { type: 'string' },
  });
  const scene = strictObject({
    sceneId: { type: 'string' },
    blocks: { type: 'array', items: block },
  });
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V3] },
    scripts: { type: 'array', items: scene },
  });
}

export function validateNarrativeProseDraftV3(
  raw: unknown,
  request: NarrativeScriptRequestV3
): NarrativeProseDraftV3 {
  validateNarrativeScriptRequestV3(request);
  const root = objectValue(raw, 'narrative prose draft v3');
  exactKeys(root, ['schemaVersion', 'scripts'], 'narrative prose draft v3');
  if (root.schemaVersion !== NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V3
    || !Array.isArray(root.scripts) || root.scripts.length !== request.scenes.length) {
    throw new Error('invalid narrative prose draft v3 metadata');
  }
  const scripts = root.scripts.map((rawScript, sceneIndex) => {
    const expected = request.scenes[sceneIndex];
    const script = objectValue(rawScript, `narrative prose v3 scripts[${sceneIndex}]`);
    exactKeys(script, ['sceneId', 'blocks'], `narrative prose v3 script ${sceneIndex}`);
    if (script.sceneId !== expected.sceneId) throw new Error('narrative prose v3 scene order changed');
    if (!Array.isArray(script.blocks) || script.blocks.length !== BLOCK_KINDS.length) {
      throw new Error(`narrative prose v3 ${expected.sceneId} requires five blocks`);
    }
    return {
      sceneId: expected.sceneId,
      blocks: script.blocks.map((rawBlock, blockIndex) => {
        const block = objectValue(rawBlock, `${expected.sceneId} prose blocks[${blockIndex}]`);
        exactKeys(block, ['kind', 'text'], `${expected.sceneId} prose block`);
        const kind = BLOCK_KINDS[blockIndex];
        if (block.kind !== kind) throw new Error(`narrative prose v3 ${expected.sceneId} block order changed`);
        return { kind, text: requiredString(block.text, `${expected.sceneId} ${kind} text`) };
      }),
    };
  });
  return { schemaVersion: NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V3, scripts };
}

export function narrativeTransitionTextV3(
  request: NarrativeScriptRequestV3,
  sceneIndex: number
): string {
  const scene = request.scenes[sceneIndex];
  if (!scene.nextSceneId) {
    return 'Aquí termina el recorrido. Tómate un momento para mirar de nuevo el lugar y cerrar la historia de la ruta.';
  }
  const target = request.scenes[sceneIndex + 1];
  return `Sigue la ruta del mapa hasta ${target.name}; al llegar, inicia la siguiente escena desde el punto marcado.`;
}

function assertSpanish(text: string, sceneId: string): void {
  const tokens = words(normalized(text));
  if (tokens.filter((token) => SPANISH_MARKERS.has(token)).length < 12
    || /\b(the|this|that|with|from|through)\b/iu.test(text)) {
    throw new Error(`narrative prose v3 ${sceneId} is not Spanish`);
  }
}

function assertSupportedNumbers(
  script: SceneNarrativeScriptV1,
  scene: NarrativeScriptSceneRequestV3
): void {
  const allowed = new Set(scene.evidenceFacts.flatMap((fact) => (
    fact.normalizedEs.match(/\b\d+\b/gu) ?? []
  )));
  const used = script.blocks.flatMap((block) => block.text.match(/\b\d+\b/gu) ?? []);
  if (used.some((value) => !allowed.has(value))) {
    throw new Error(`narrative prose v3 ${scene.sceneId} contains an unsupported number`);
  }
}

export function materializeNarrativeScriptsV3(
  raw: unknown,
  request: NarrativeScriptRequestV3,
  plan: NarrativeClaimPlanV3
): SceneNarrativeScriptV1[] {
  const prose = validateNarrativeProseDraftV3(raw, request);
  const canonicalPlan = validateNarrativeClaimPlanV3(plan, request);
  return prose.scripts.map((script, sceneIndex) => {
    const expected = request.scenes[sceneIndex];
    const planned = canonicalPlan.scenes[sceneIndex];
    const targetSceneId = expected.nextSceneId;
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
        kind: targetSceneId ? 'walk_to_next' : 'tour_end',
        targetSceneId,
        text: narrativeTransitionTextV3(request, sceneIndex),
      },
      wordCount: 0,
    };
    result.wordCount = narrativeWordCountV1(result);
    if (result.wordCount < 220 || result.wordCount > 260) {
      throw new Error(`narrative prose v3 ${expected.sceneId} requires 220 to 260 words`);
    }
    if (!VISUAL_INSTRUCTION.test(result.blocks[1].text)) {
      throw new Error(`narrative prose v3 ${expected.sceneId} requires a visual instruction`);
    }
    assertSpanish(result.blocks.map((block) => block.text).join(' '), expected.sceneId);
    assertSupportedNumbers(result, expected);
    return result;
  });
}

export function narrativeProseFingerprintV3(scripts: SceneNarrativeScriptV1[]): string {
  return editorialFingerprintV7(scripts);
}
