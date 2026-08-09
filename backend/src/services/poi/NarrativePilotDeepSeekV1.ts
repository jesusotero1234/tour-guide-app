import {
  EditorialCallResultV6,
  EditorialRequestOptionsV6,
  requestEditorialStructuredV6,
} from './EditorialStructuredLlmV6';
import {
  NarrativeScriptRequestV1,
  SceneNarrativeScriptV1,
  NARRATIVE_PILOT_MODEL_V1,
  NARRATIVE_PILOT_SYSTEM_PROMPT_V1,
  NARRATIVE_PILOT_TOOL_NAME_V1,
  narrativeScriptResponseSchemaV1,
  narrativeEventTermConstraintsV1,
  validateNarrativeScriptRequestV1,
  validateNarrativeScriptResponseV1,
} from './NarrativePilotV1';

export { NARRATIVE_PILOT_MODEL_V1 } from './NarrativePilotV1';
export const NARRATIVE_GENERATOR_PARAMETERS_V1 = {
  temperature: 0,
  maxTokens: 8_000,
  thinking: false,
  strictSchema: true,
} as const;

export interface NarrativeCandidateRepairV1 {
  instructions: string[];
  previousCandidate: unknown;
}

export async function generateNarrativeCandidateV1(
  request: NarrativeScriptRequestV1,
  options: EditorialRequestOptionsV6 = {},
  repair?: NarrativeCandidateRepairV1
): Promise<EditorialCallResultV6<SceneNarrativeScriptV1[]>> {
  validateNarrativeScriptRequestV1(request);
  if (repair?.instructions.some((instruction) => !instruction.trim())) {
    throw new Error('narrative repair instructions must be non-empty strings');
  }
  const generationContext = {
    request,
    eventTermsByScene: narrativeEventTermConstraintsV1(request),
  };
  const input = repair
    ? {
      ...generationContext,
      previousCandidate: repair.previousCandidate,
      repairInstructions: repair.instructions,
    }
    : generationContext;
  return requestEditorialStructuredV6({
    callId: 'paris-premium-narrative-pilot-v1',
    input,
    provider: { kind: 'deepseek', model: NARRATIVE_PILOT_MODEL_V1 },
    options: {
      ...options,
      maxTokens: NARRATIVE_GENERATOR_PARAMETERS_V1.maxTokens,
      deepseekStrictTools: NARRATIVE_GENERATOR_PARAMETERS_V1.strictSchema,
    },
    systemPrompt: NARRATIVE_PILOT_SYSTEM_PROMPT_V1,
    schema: narrativeScriptResponseSchemaV1(),
    toolName: NARRATIVE_PILOT_TOOL_NAME_V1,
    toolDescription: 'Submit the three grounded Spanish narrative scripts for the fixed Paris route.',
    inputCharacterLimit: 80_000,
    schemaCharacterLimit: 7_000,
    validate: (value) => validateNarrativeScriptResponseV1(value, request),
  });
}
