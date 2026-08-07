import { editorialFingerprintV7, OwnedEvidenceFactV1, VisitSceneV1 } from './EditorialProfileV7';
import { recommendAdvertisedDurationV7 } from './EditorialRouteOptimizerV7';

export const STORY_MODULE_PLAN_SCHEMA_VERSION_V1 = 'story-module-plan-v1' as const;
export const STORY_PLAN_REQUEST_SCHEMA_VERSION_V1 = 'story-plan-request-v1' as const;
export const STORY_PLAN_INPUT_CHARACTER_LIMIT_V7 = 12_000;
export const STORY_PLAN_SCHEMA_CHARACTER_LIMIT_V7 = 5_000;

export interface StoryPlanSceneInputV7 {
  sceneId: string;
  name: string;
  memberCanonicalIds: string[];
  facts: OwnedEvidenceFactV1[];
}

export interface StoryPlanRequestV7 {
  schemaVersion: typeof STORY_PLAN_REQUEST_SCHEMA_VERSION_V1;
  language: string;
  routeSceneIds: string[];
  scenes: StoryPlanSceneInputV7[];
}

export interface StoryModuleV1 {
  moduleId: string;
  title: string;
  contribution: string;
  targetWords: number;
  primaryFactId: string;
  evidenceFactIds: string[];
}

export interface StoryObservationV1 {
  instruction: string;
  seconds: number;
  evidenceFactIds: string[];
}

export interface SceneStoryPlanV1 {
  sceneId: string;
  main: StoryModuleV1;
  deepDives: StoryModuleV1[];
  observation: StoryObservationV1 | null;
}

export interface StoryModulePlanV1 {
  schemaVersion: typeof STORY_MODULE_PLAN_SCHEMA_VERSION_V1;
  routeSceneIds: string[];
  promise: string;
  centralQuestion: string;
  scenes: SceneStoryPlanV1[];
}

export interface StoryPlanAttemptV7 {
  attempt: number;
  status: 'valid' | 'transport_error' | 'malformed_response' | 'semantic_error';
  rawOutput: string | null;
  error: string | null;
}

export interface StoryPlanCallResultV7 {
  status: StoryPlanAttemptV7['status'];
  value: StoryModulePlanV1 | null;
  attempts: StoryPlanAttemptV7[];
  promptFingerprint: string;
  input: StoryPlanRequestV7;
}

export type StoryPlanGeneratorV7 = (
  request: StoryPlanRequestV7,
  schema: Record<string, unknown>
) => Promise<string>;

export interface EditorialAudioV7 {
  seconds: number;
  fingerprint: string;
}

export interface EditorialDurationInputV7 {
  requestedDurationMinutes: number;
  walkingSeconds: number;
  plan: StoryModulePlanV1;
  wordsPerMinute?: number;
  audioByModuleId?: Record<string, EditorialAudioV7>;
}

export interface EditorialDurationResultV7 {
  walkingSeconds: number;
  narrationSeconds: number;
  observationSeconds: number;
  totalSeconds: number;
  totalMinutes: number;
  narrationSource: 'word_estimate' | 'audio_actual';
  recommendedDurationMinutes: number;
}

function exactRoute(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}

function requiredString(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value.trim();
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must contain unique strings`);
  }
  const normalized = value.map((item) => (item as string).trim());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must contain unique strings`);
  }
  return normalized;
}

export function buildStoryPlanRequestV7(
  routeSceneIds: string[],
  scenes: VisitSceneV1[],
  language: string
): StoryPlanRequestV7 {
  if (routeSceneIds.length < 4 || routeSceneIds.length > 8
    || new Set(routeSceneIds).size !== routeSceneIds.length) {
    throw new Error('story plan route must contain four to eight unique scenes');
  }
  const sceneById = new Map(scenes.map((scene) => [scene.sceneId, scene]));
  const selected = routeSceneIds.map((sceneId) => {
    const scene = sceneById.get(sceneId);
    if (!scene) throw new Error(`story plan route scene ${sceneId} is missing`);
    return {
      sceneId: scene.sceneId,
      name: scene.name,
      memberCanonicalIds: [...scene.memberCanonicalIds],
      facts: scene.facts.map((fact) => ({ ...fact })),
    };
  });
  const request: StoryPlanRequestV7 = {
    schemaVersion: STORY_PLAN_REQUEST_SCHEMA_VERSION_V1,
    language: requiredString(language, 'story plan language', 20),
    routeSceneIds: [...routeSceneIds],
    scenes: selected,
  };
  const length = JSON.stringify(request).length;
  if (length > STORY_PLAN_INPUT_CHARACTER_LIMIT_V7) {
    throw new Error(`story plan input exceeds ${STORY_PLAN_INPUT_CHARACTER_LIMIT_V7} characters (${length})`);
  }
  return request;
}

export function storyPlanResponseSchemaV7(): Record<string, unknown> {
  const module = {
    type: 'object', additionalProperties: false,
    required: ['moduleId', 'title', 'contribution', 'targetWords', 'primaryFactId', 'evidenceFactIds'],
    properties: {
      moduleId: { type: 'string' }, title: { type: 'string' }, contribution: { type: 'string' },
      targetWords: { type: 'integer', minimum: 180, maximum: 260 },
      primaryFactId: { type: 'string' },
      evidenceFactIds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
    },
  };
  const schema: Record<string, unknown> = {
    type: 'object', additionalProperties: false,
    required: ['schemaVersion', 'routeSceneIds', 'promise', 'centralQuestion', 'scenes'],
    properties: {
      schemaVersion: { const: STORY_MODULE_PLAN_SCHEMA_VERSION_V1 },
      routeSceneIds: { type: 'array', minItems: 4, maxItems: 8, items: { type: 'string' } },
      promise: { type: 'string' }, centralQuestion: { type: 'string' },
      scenes: {
        type: 'array', minItems: 4, maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          required: ['sceneId', 'main', 'deepDives', 'observation'],
          properties: {
            sceneId: { type: 'string' }, main: module,
            deepDives: { type: 'array', maxItems: 3, items: module },
            observation: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'object', additionalProperties: false,
                  required: ['instruction', 'seconds', 'evidenceFactIds'],
                  properties: {
                    instruction: { type: 'string' },
                    seconds: { type: 'integer', minimum: 45, maximum: 90 },
                    evidenceFactIds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
  const length = JSON.stringify(schema).length;
  if (length > STORY_PLAN_SCHEMA_CHARACTER_LIMIT_V7) {
    throw new Error(`story plan schema exceeds ${STORY_PLAN_SCHEMA_CHARACTER_LIMIT_V7} characters (${length})`);
  }
  return schema;
}

export function storyPlanPromptFingerprintV7(): string {
  return editorialFingerprintV7({
    instruction: 'Plan grounded modules for this fixed route. Do not add, remove, or reorder scenes.',
    schema: storyPlanResponseSchemaV7(),
  });
}

function validateEvidenceIds(
  value: unknown,
  allowedFactIds: Set<string>,
  label: string
): string[] {
  const ids = stringArray(value, label);
  if (ids.some((id) => !allowedFactIds.has(id))) throw new Error(`${label} contains invented evidence`);
  return ids;
}

function validateModule(
  value: unknown,
  allowedFactIds: Set<string>,
  label: string
): StoryModuleV1 {
  const module = objectValue(value, label);
  exactKeys(module, [
    'moduleId', 'title', 'contribution', 'targetWords', 'primaryFactId', 'evidenceFactIds',
  ], label);
  if (!Number.isInteger(module.targetWords) || (module.targetWords as number) < 180
    || (module.targetWords as number) > 260) throw new Error(`${label} targetWords must be 180 to 260`);
  const primaryFactId = requiredString(module.primaryFactId, `${label} primaryFactId`, 200);
  if (!allowedFactIds.has(primaryFactId)) throw new Error(`${label} contains invented evidence`);
  const evidenceFactIds = validateEvidenceIds(module.evidenceFactIds, allowedFactIds, `${label} evidenceFactIds`);
  if (!evidenceFactIds.includes(primaryFactId)) throw new Error(`${label} must cite its primary fact`);
  return {
    moduleId: requiredString(module.moduleId, `${label} moduleId`, 200),
    title: requiredString(module.title, `${label} title`, 200),
    contribution: requiredString(module.contribution, `${label} contribution`, 500),
    targetWords: module.targetWords as number,
    primaryFactId,
    evidenceFactIds,
  };
}

export function validateStoryModulePlanV1(
  value: unknown,
  request: StoryPlanRequestV7
): StoryModulePlanV1 {
  const root = objectValue(value, 'story plan');
  exactKeys(root, ['schemaVersion', 'routeSceneIds', 'promise', 'centralQuestion', 'scenes'], 'story plan');
  if (root.schemaVersion !== STORY_MODULE_PLAN_SCHEMA_VERSION_V1) throw new Error('invalid story plan schemaVersion');
  const routeSceneIds = stringArray(root.routeSceneIds, 'story plan routeSceneIds');
  if (!exactRoute(routeSceneIds, request.routeSceneIds)) throw new Error('story plan cannot change the fixed route order');
  if (!Array.isArray(root.scenes) || root.scenes.length !== request.scenes.length) {
    throw new Error('story plan must contain every route scene exactly once');
  }
  const moduleIds = new Set<string>();
  const primaryFactIds = new Set<string>();
  const scenes = root.scenes.map((valueScene, index): SceneStoryPlanV1 => {
    const raw = objectValue(valueScene, `story scenes[${index}]`);
    exactKeys(raw, ['sceneId', 'main', 'deepDives', 'observation'], `story scenes[${index}]`);
    const expected = request.scenes[index];
    if (raw.sceneId !== expected.sceneId) throw new Error('story plan cannot change the fixed route order');
    const allowedFactIds = new Set(expected.facts.map((fact) => fact.factId));
    const main = validateModule(raw.main, allowedFactIds, `story scenes[${index}].main`);
    if (!Array.isArray(raw.deepDives) || raw.deepDives.length > 3) {
      throw new Error(`story scenes[${index}] permits at most three deep dives`);
    }
    const deepDives = raw.deepDives.map((module, moduleIndex) => (
      validateModule(module, allowedFactIds, `story scenes[${index}].deepDives[${moduleIndex}]`)
    ));
    const modules = [main, ...deepDives];
    for (const module of modules) {
      if (moduleIds.has(module.moduleId)) throw new Error('story plan duplicates a moduleId');
      if (primaryFactIds.has(module.primaryFactId)) throw new Error('story plan reuses a primary fact');
      moduleIds.add(module.moduleId);
      primaryFactIds.add(module.primaryFactId);
    }
    if (new Set(modules.map((module) => module.contribution.toLowerCase())).size !== modules.length) {
      throw new Error(`story scenes[${index}] repeats a contribution`);
    }
    let observation: StoryObservationV1 | null = null;
    if (raw.observation !== null) {
      const item = objectValue(raw.observation, `story scenes[${index}].observation`);
      exactKeys(item, ['instruction', 'seconds', 'evidenceFactIds'], `story scenes[${index}].observation`);
      if (!Number.isInteger(item.seconds) || (item.seconds as number) < 45 || (item.seconds as number) > 90) {
        throw new Error(`story scenes[${index}] observation must be 45 to 90 seconds`);
      }
      observation = {
        instruction: requiredString(item.instruction, `story scenes[${index}] observation instruction`, 500),
        seconds: item.seconds as number,
        evidenceFactIds: validateEvidenceIds(
          item.evidenceFactIds, allowedFactIds, `story scenes[${index}] observation evidenceFactIds`
        ),
      };
    }
    return { sceneId: expected.sceneId, main, deepDives, observation };
  });
  return {
    schemaVersion: STORY_MODULE_PLAN_SCHEMA_VERSION_V1,
    routeSceneIds,
    promise: requiredString(root.promise, 'story plan promise', 500),
    centralQuestion: requiredString(root.centralQuestion, 'story plan centralQuestion', 500),
    scenes,
  };
}

export async function requestStoryPlanV7(
  request: StoryPlanRequestV7,
  generate: StoryPlanGeneratorV7
): Promise<StoryPlanCallResultV7> {
  const schema = storyPlanResponseSchemaV7();
  const promptFingerprint = storyPlanPromptFingerprintV7();
  const attempts: StoryPlanAttemptV7[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let rawOutput: string;
    try {
      rawOutput = await generate(request, schema);
    } catch (error) {
      attempts.push({
        attempt, status: 'transport_error', rawOutput: null,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === 1) continue;
      return { status: 'transport_error', value: null, attempts, promptFingerprint, input: request };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (error) {
      attempts.push({
        attempt, status: 'malformed_response', rawOutput,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === 1) continue;
      return { status: 'malformed_response', value: null, attempts, promptFingerprint, input: request };
    }
    try {
      const plan = validateStoryModulePlanV1(parsed, request);
      attempts.push({ attempt, status: 'valid', rawOutput, error: null });
      return { status: 'valid', value: plan, attempts, promptFingerprint, input: request };
    } catch (error) {
      attempts.push({
        attempt, status: 'semantic_error', rawOutput,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'semantic_error', value: null, attempts, promptFingerprint, input: request };
    }
  }
  throw new Error('story plan request exhausted attempts unexpectedly');
}

function modules(plan: StoryModulePlanV1): StoryModuleV1[] {
  return plan.scenes.flatMap((scene) => [scene.main, ...scene.deepDives]);
}

export function calculateEditorialDurationV7(
  input: EditorialDurationInputV7
): EditorialDurationResultV7 {
  if (!Number.isFinite(input.walkingSeconds) || input.walkingSeconds < 0) {
    throw new Error('walkingSeconds must be non-negative');
  }
  if (!Number.isFinite(input.requestedDurationMinutes) || input.requestedDurationMinutes <= 0) {
    throw new Error('requestedDurationMinutes must be positive');
  }
  const storyModules = modules(input.plan);
  let narrationSeconds: number;
  let narrationSource: EditorialDurationResultV7['narrationSource'];
  if (input.audioByModuleId) {
    const expectedIds = storyModules.map((module) => module.moduleId).sort();
    const actualIds = Object.keys(input.audioByModuleId).sort();
    if (!exactRoute(actualIds, expectedIds)) throw new Error('actual audio must cover every story module exactly once');
    narrationSeconds = Object.values(input.audioByModuleId).reduce((sum, audio) => {
      if (!Number.isFinite(audio.seconds) || audio.seconds <= 0 || !audio.fingerprint.trim()) {
        throw new Error('actual audio metadata is invalid');
      }
      return sum + audio.seconds;
    }, 0);
    narrationSource = 'audio_actual';
  } else {
    const wordsPerMinute = input.wordsPerMinute ?? 150;
    if (!Number.isFinite(wordsPerMinute) || wordsPerMinute < 80 || wordsPerMinute > 220) {
      throw new Error('wordsPerMinute must be 80 to 220');
    }
    narrationSeconds = storyModules.reduce((sum, module) => sum + module.targetWords, 0)
      / wordsPerMinute * 60;
    narrationSource = 'word_estimate';
  }
  const observationSeconds = input.plan.scenes.reduce((sum, scene) => (
    sum + (scene.observation?.seconds ?? 0)
  ), 0);
  const totalSeconds = input.walkingSeconds + narrationSeconds + observationSeconds;
  const totalMinutes = Number((totalSeconds / 60).toFixed(2));
  return {
    walkingSeconds: Number(input.walkingSeconds.toFixed(2)),
    narrationSeconds: Number(narrationSeconds.toFixed(2)),
    observationSeconds,
    totalSeconds: Number(totalSeconds.toFixed(2)),
    totalMinutes,
    narrationSource,
    recommendedDurationMinutes: recommendAdvertisedDurationV7(
      totalMinutes, input.requestedDurationMinutes
    ),
  };
}
