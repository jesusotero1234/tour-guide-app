import {
  EditorialPostV6,
  EditorialProviderV6,
  EditorialReasoningV6,
  EditorialRequestOptionsV6,
} from './EditorialStructuredLlmV6';

export const NARRATIVE_MODEL_PROFILE_NAMES_V6 = [
  'deepseek_control',
  'balanced_openrouter',
] as const;

export type NarrativeModelProfileNameV6 = typeof NARRATIVE_MODEL_PROFILE_NAMES_V6[number];

export type NarrativeModelPhaseV6 =
  | 'planner'
  | 'curator'
  | 'curator_complex'
  | 'architect'
  | 'writer'
  | 'auditor_a'
  | 'auditor_b'
  | 'adjudicator'
  | 'repair'
  | 'global_auditor';

export interface NarrativeModelPhaseConfigV6 {
  provider: EditorialProviderV6;
  reasoning: EditorialReasoningV6;
  temperature?: number;
  maxTokens: number;
}

export interface NarrativeConcurrencyV6 {
  researchStops: number;
  captures: number;
  curations: number;
  writers: number;
  auditStops: number;
  adjudications: number;
  globalAudits: number;
}

export interface NarrativeModelProfileV6 {
  name: NarrativeModelProfileNameV6;
  phases: Record<NarrativeModelPhaseV6, NarrativeModelPhaseConfigV6>;
  concurrency: NarrativeConcurrencyV6;
}

export interface NarrativeModelClientOptionsV6 {
  profile?: NarrativeModelProfileNameV6 | string;
  apiKey?: string;
  openRouterApiKey?: string;
  ollamaHost?: string;
  post?: EditorialPostV6;
  disableOpenRouterCache?: boolean;
  runId?: string;
}

export interface NarrativePhaseExecutionV6 {
  profile: NarrativeModelProfileV6;
  provider: EditorialProviderV6;
  options: EditorialRequestOptionsV6;
}

const deepseekFlash = {
  kind: 'deepseek' as const,
  model: 'deepseek-v4-flash',
};
const deepseekPro = {
  kind: 'deepseek' as const,
  model: 'deepseek-v4-pro',
};

function openRouterProvider(
  model: string,
  endpoint: string,
  expectedProviderName: string,
  acceptedModels: string[] = []
): EditorialProviderV6 {
  return {
    kind: 'openrouter',
    model,
    endpoint,
    expectedProviderName,
    acceptedModels,
  };
}

const openRouterFlash = openRouterProvider(
  'deepseek/deepseek-v4-flash-0731',
  'digitalocean',
  'DigitalOcean',
  ['deepseek/deepseek-v4-flash-0731-20260731']
);
const openAiMini = openRouterProvider('openai/gpt-5.4-mini', 'openai', 'OpenAI');
const openAiFull = openRouterProvider('openai/gpt-5.4', 'openai', 'OpenAI');
const geminiAudit = openRouterProvider(
  'google/gemini-3.5-flash-lite', 'google-ai-studio', 'Google AI Studio'
);
const geminiGlobal = openRouterProvider(
  'google/gemini-3.6-flash', 'google-vertex/global', 'Google'
);

export const NARRATIVE_MODEL_PROFILES_V6: Record<
  NarrativeModelProfileNameV6,
  NarrativeModelProfileV6
> = {
  deepseek_control: {
    name: 'deepseek_control',
    phases: {
      planner: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 1_200 },
      curator: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 8_000 },
      curator_complex: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 8_000 },
      architect: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 4_000 },
      writer: { provider: deepseekFlash, reasoning: 'none', temperature: 0.7, maxTokens: 2_000 },
      auditor_a: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 6_000 },
      auditor_b: { provider: deepseekPro, reasoning: 'none', temperature: 0, maxTokens: 6_000 },
      adjudicator: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 4_000 },
      repair: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      global_auditor: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 4_000 },
    },
    concurrency: {
      researchStops: 1,
      captures: 1,
      curations: 1,
      writers: 1,
      auditStops: 1,
      adjudications: 1,
      globalAudits: 1,
    },
  },
  balanced_openrouter: {
    name: 'balanced_openrouter',
    phases: {
      planner: { provider: openRouterFlash, reasoning: 'none', temperature: 0, maxTokens: 1_200 },
      curator: { provider: openAiMini, reasoning: 'low', maxTokens: 8_000 },
      curator_complex: { provider: openAiFull, reasoning: 'medium', maxTokens: 8_000 },
      architect: { provider: openAiMini, reasoning: 'low', maxTokens: 4_000 },
      writer: { provider: openRouterFlash, reasoning: 'none', temperature: 0.7, maxTokens: 2_000 },
      auditor_a: { provider: openRouterFlash, reasoning: 'low', temperature: 0, maxTokens: 6_000 },
      auditor_b: { provider: geminiAudit, reasoning: 'low', temperature: 0, maxTokens: 6_000 },
      adjudicator: { provider: openAiMini, reasoning: 'medium', maxTokens: 4_000 },
      repair: { provider: openRouterFlash, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      global_auditor: { provider: geminiGlobal, reasoning: 'low', maxTokens: 4_000 },
    },
    concurrency: {
      researchStops: 2,
      captures: 2,
      curations: 3,
      writers: 3,
      auditStops: 2,
      adjudications: 3,
      globalAudits: 1,
    },
  },
};

export function resolveNarrativeModelProfileV6(
  name: string | undefined = process.env.NARRATIVE_MODEL_PROFILE
): NarrativeModelProfileV6 {
  const selected = name?.trim() || 'deepseek_control';
  if (!NARRATIVE_MODEL_PROFILE_NAMES_V6.includes(selected as NarrativeModelProfileNameV6)) {
    throw new Error(`Unknown narrative model profile: ${selected}`);
  }
  return NARRATIVE_MODEL_PROFILES_V6[selected as NarrativeModelProfileNameV6];
}

export function narrativePhaseExecutionV6(
  client: NarrativeModelClientOptionsV6,
  phase: NarrativeModelPhaseV6,
  stopId?: string,
  requestAttempts: 1 | 2 = 2
): NarrativePhaseExecutionV6 {
  const profile = resolveNarrativeModelProfileV6(client.profile);
  const config = profile.phases[phase];
  return {
    profile,
    provider: config.provider,
    options: {
      apiKey: client.apiKey,
      openRouterApiKey: client.openRouterApiKey,
      ollamaHost: client.ollamaHost,
      post: client.post,
      disableOpenRouterCache: client.disableOpenRouterCache,
      runId: client.runId,
      ...(stopId ? { stopId } : {}),
      phase,
      profile: profile.name,
      reasoning: config.reasoning,
      ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
      maxTokens: config.maxTokens,
      requestAttempts,
    },
  };
}
