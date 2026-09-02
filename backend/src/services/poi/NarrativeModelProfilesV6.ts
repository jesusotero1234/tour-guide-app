import {
  EditorialProgressCallbackV6,
  EditorialPostV6,
  EditorialPricingV6,
  EditorialProviderV6,
  EditorialReasoningV6,
  EditorialRequestOptionsV6,
} from './EditorialStructuredLlmV6';

export const NARRATIVE_MODEL_PROFILE_NAMES_V6 = [
  'deepseek_control',
  'balanced_openrouter',
  'qwen38_hybrid',
  'multilingual_openrouter',
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
  searches: number;
  captures: number;
  curations: number;
  editorialStops: number;
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
  qwenLocalBaseUrl?: string;
  post?: EditorialPostV6;
  disableOpenRouterCache?: boolean;
  requestTimeoutMs?: number;
  openRouterPricing?: Record<string, EditorialPricingV6>;
  signal?: AbortSignal;
  onProgress?: EditorialProgressCallbackV6;
  runId?: string;
  writerRateLimitAttempts?: 1 | 2 | 3;
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
  acceptedModels: string[] = []
): EditorialProviderV6 {
  return {
    kind: 'openrouter',
    model,
    acceptedModels,
  };
}

const openRouterFlash = openRouterProvider(
  'deepseek/deepseek-v4-flash-0731',
  [
    'deepseek/deepseek-v4-flash-0731-20260731',
    'deepseek/deepseek-v4-flash-20260731',
  ]
);
const openAiMini = openRouterProvider(
  'openai/gpt-5.4-mini',
  ['openai/gpt-5.4-mini-20260317']
);
export const QWEN38_CANONICAL_CORE_PROVIDER_V6: EditorialProviderV6 = openAiMini;
const openAiFull = openRouterProvider(
  'openai/gpt-5.4',
  ['openai/gpt-5.4-20260305']
);
const mistralSmall4 = openRouterProvider(
  'mistralai/mistral-small-2603'
);
const gemini25FlashLite: EditorialProviderV6 = {
  ...openRouterProvider('google/gemini-2.5-flash-lite'),
  zeroDataRetention: true,
};
const openAiNano = openRouterProvider(
  'openai/gpt-5.4-nano',
  ['openai/gpt-5.4-nano-20260317']
);
const qwenLocal = {
  kind: 'qwen_local' as const,
  model: 'qwen-local',
  endpoint: 'http://127.0.0.1:8080/v1',
};
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
      auditor_a: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      auditor_b: { provider: deepseekPro, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      adjudicator: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 4_000 },
      repair: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      global_auditor: { provider: deepseekFlash, reasoning: 'none', temperature: 0, maxTokens: 4_000 },
    },
    concurrency: {
      researchStops: 1,
      searches: 1,
      captures: 1,
      curations: 1,
      editorialStops: 1,
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
      curator: { provider: openAiMini, reasoning: 'low', maxTokens: 16_000 },
      curator_complex: { provider: openAiFull, reasoning: 'medium', maxTokens: 8_000 },
      architect: { provider: openAiMini, reasoning: 'low', maxTokens: 4_000 },
      writer: { provider: openRouterFlash, reasoning: 'none', temperature: 0.7, maxTokens: 2_000 },
      auditor_a: { provider: openRouterFlash, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      auditor_b: { provider: openAiMini, reasoning: 'low', maxTokens: 2_000 },
      adjudicator: { provider: openAiMini, reasoning: 'medium', maxTokens: 4_000 },
      repair: { provider: openRouterFlash, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      global_auditor: { provider: openAiMini, reasoning: 'high', maxTokens: 20_000 },
    },
    concurrency: {
      researchStops: 2,
      searches: 6,
      captures: 2,
      curations: 3,
      editorialStops: 1,
      writers: 1,
      auditStops: 1,
      adjudications: 3,
      globalAudits: 1,
    },
  },
  qwen38_hybrid: {
    name: 'qwen38_hybrid',
    phases: {
      planner: { provider: qwenLocal, reasoning: 'none', temperature: 0, maxTokens: 1_200 },
      curator: { provider: openAiMini, reasoning: 'low', maxTokens: 16_000 },
      curator_complex: { provider: openAiFull, reasoning: 'medium', maxTokens: 8_000 },
      architect: { provider: openAiMini, reasoning: 'low', maxTokens: 4_000 },
      writer: { provider: qwenLocal, reasoning: 'none', temperature: 0.7, maxTokens: 2_000 },
      auditor_a: { provider: qwenLocal, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      auditor_b: { provider: openAiMini, reasoning: 'low', maxTokens: 2_000 },
      adjudicator: { provider: openAiMini, reasoning: 'medium', maxTokens: 4_000 },
      repair: { provider: qwenLocal, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      global_auditor: { provider: openAiMini, reasoning: 'high', maxTokens: 20_000 },
    },
    concurrency: {
      researchStops: 2,
      searches: 6,
      captures: 2,
      curations: 3,
      editorialStops: 1,
      writers: 1,
      auditStops: 1,
      adjudications: 3,
      globalAudits: 1,
    },
  },
  multilingual_openrouter: {
    name: 'multilingual_openrouter',
    phases: {
      planner: { provider: qwenLocal, reasoning: 'none', temperature: 0, maxTokens: 1_200 },
      curator: { provider: mistralSmall4, reasoning: 'none', maxTokens: 16_000 },
      curator_complex: { provider: openAiFull, reasoning: 'medium', maxTokens: 8_000 },
      architect: { provider: gemini25FlashLite, reasoning: 'low', maxTokens: 8_000 },
      writer: { provider: qwenLocal, reasoning: 'none', temperature: 0.7, maxTokens: 2_000 },
      auditor_a: { provider: openRouterFlash, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      auditor_b: { provider: mistralSmall4, reasoning: 'none', maxTokens: 2_000 },
      adjudicator: { provider: openAiNano, reasoning: 'medium', maxTokens: 4_000 },
      repair: { provider: qwenLocal, reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      global_auditor: { provider: mistralSmall4, reasoning: 'none', maxTokens: 12_000 },
    },
    concurrency: {
      researchStops: 2,
      searches: 6,
      captures: 2,
      curations: 3,
      editorialStops: 1,
      writers: 1,
      auditStops: 1,
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
  requestAttempts: 1 | 2 = 2,
  rateLimitAttempts?: 1 | 2 | 3
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
      qwenLocalBaseUrl: client.qwenLocalBaseUrl,
      post: client.post,
      disableOpenRouterCache: client.disableOpenRouterCache,
      requestTimeoutMs: client.requestTimeoutMs,
      pricing: config.provider.kind === 'openrouter'
        ? client.openRouterPricing?.[config.provider.model]
        : undefined,
      signal: client.signal,
      onProgress: client.onProgress,
      runId: client.runId,
      ...(stopId ? { stopId } : {}),
      phase,
      profile: profile.name,
      reasoning: config.reasoning,
      ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
      maxTokens: config.maxTokens,
      requestAttempts,
      ...(rateLimitAttempts !== undefined ? { rateLimitAttempts } : {}),
    },
  };
}
