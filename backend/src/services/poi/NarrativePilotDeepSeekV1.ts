import {
  EditorialRequestOptionsV6,
  requestEditorialStructuredV6,
} from './EditorialStructuredLlmV6';
import {
  createNarrativePilotArtifactV1,
  NarrativePilotArtifactV1,
  NarrativeScriptRequestV1,
  NARRATIVE_PILOT_MODEL_V1,
  NARRATIVE_PILOT_SYSTEM_PROMPT_V1,
  NARRATIVE_PILOT_TOOL_NAME_V1,
  narrativeScriptResponseSchemaV1,
  validateNarrativeScriptRequestV1,
  validateNarrativeScriptResponseV1,
} from './NarrativePilotV1';

export { NARRATIVE_PILOT_MODEL_V1 } from './NarrativePilotV1';

export async function generateNarrativePilotV1(
  request: NarrativeScriptRequestV1,
  options: EditorialRequestOptionsV6 = {}
): Promise<NarrativePilotArtifactV1> {
  validateNarrativeScriptRequestV1(request);
  const call = await requestEditorialStructuredV6({
    callId: 'paris-premium-narrative-pilot-v1',
    input: request,
    provider: { kind: 'deepseek', model: NARRATIVE_PILOT_MODEL_V1 },
    options,
    systemPrompt: NARRATIVE_PILOT_SYSTEM_PROMPT_V1,
    schema: narrativeScriptResponseSchemaV1(),
    toolName: NARRATIVE_PILOT_TOOL_NAME_V1,
    toolDescription: 'Submit the three grounded Spanish narrative scripts for the fixed Paris route.',
    inputCharacterLimit: 20_000,
    schemaCharacterLimit: 7_000,
    validate: (value) => validateNarrativeScriptResponseV1(value, request),
  });
  return createNarrativePilotArtifactV1(request, call);
}
