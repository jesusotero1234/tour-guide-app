import axios from 'axios';
import { createHash } from 'crypto';
import {
  NARRATIVE_MODEL_PROFILES_V6,
  NarrativeModelPhaseConfigV6,
  NarrativeModelProfileNameV6,
} from './NarrativeModelProfilesV6';
import { EditorialPricingV6 } from './EditorialStructuredLlmV6';

export type OpenRouterCatalogGetV6 = (
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
) => Promise<{ data: unknown }>;

export interface OpenRouterPreflightCheckV6 {
  model: string;
  endpointModel: string;
  endpoint: string;
  provider: string;
  requiredParameters: string[];
  supportedParameters: string[];
  pricing: EditorialPricingV6;
}

export interface OpenRouterPreflightResultV6 {
  status: 'ready' | 'protocol_failed';
  fingerprint: string;
  checks: OpenRouterPreflightCheckV6[];
  issues: string[];
}

export function openRouterPricingFromPreflightV6(
  preflight: OpenRouterPreflightResultV6
): Record<string, EditorialPricingV6> {
  if (preflight.status !== 'ready') {
    throw new Error('OpenRouter pricing requires a ready endpoint preflight');
  }
  return Object.fromEntries(preflight.checks.map((check) => [check.model, check.pricing]));
}

interface RequiredModelV6 {
  model: string;
  acceptedModels: string[];
  requiredParameters: Set<string>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function price(value: unknown, label: string): number {
  const parsed = typeof value === 'string' || typeof value === 'number'
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} is not a non-negative USD price`);
  }
  return parsed;
}

function endpointPricing(value: unknown): EditorialPricingV6 {
  const pricing = record(value);
  if (!pricing) throw new Error('endpoint pricing is missing');
  if (pricing.prompt === undefined || pricing.completion === undefined) {
    throw new Error('endpoint pricing omitted prompt or completion');
  }
  const rows = [
    pricing,
    ...(Array.isArray(pricing.overrides) ? pricing.overrides.map(record).filter(
      (row): row is Record<string, unknown> => row !== null
    ) : []),
  ];
  const maximum = (field: string, fallback = 0): number => Math.max(
    fallback,
    ...rows.map((row) => row[field] === undefined ? fallback : price(row[field], field))
  );
  return {
    inputUsdPerToken: maximum('prompt'),
    outputUsdPerToken: maximum('completion'),
    internalReasoningUsdPerToken: maximum('internal_reasoning'),
    requestUsd: maximum('request'),
  };
}

function parametersForPhase(phase: NarrativeModelPhaseConfigV6): string[] {
  return [
    'max_tokens',
    'reasoning',
    'response_format',
    'structured_outputs',
    ...(phase.temperature === undefined ? [] : ['temperature']),
  ];
}

function requirements(profile: NarrativeModelProfileNameV6): RequiredModelV6[] {
  const byModel = new Map<string, RequiredModelV6>();
  for (const phase of Object.values(NARRATIVE_MODEL_PROFILES_V6[profile].phases)) {
    if (phase.provider.kind !== 'openrouter') continue;
    const model = phase.provider.model;
    const existing = byModel.get(model) ?? {
      model,
      acceptedModels: [model, ...(phase.provider.acceptedModels ?? [])],
      requiredParameters: new Set<string>(),
    };
    parametersForPhase(phase).forEach((parameter) => existing.requiredParameters.add(parameter));
    byModel.set(model, existing);
  }
  return [...byModel.values()].sort((left, right) => left.model.localeCompare(right.model));
}

const defaultGet: OpenRouterCatalogGetV6 = async (url, headers, signal) => {
  const response = await axios.get(url, { headers, timeout: 30_000, signal });
  return { data: response.data };
};

export async function preflightNarrativeOpenRouterV6(options: {
  profile?: NarrativeModelProfileNameV6;
  baseUrl?: string;
  get?: OpenRouterCatalogGetV6;
  signal?: AbortSignal;
} = {}): Promise<OpenRouterPreflightResultV6> {
  const profile = options.profile ?? 'balanced_openrouter';
  const baseUrl = (options.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const get = options.get ?? defaultGet;
  const issues: string[] = [];
  const checks: OpenRouterPreflightCheckV6[] = [];
  let catalogModels = new Set<string>();

  try {
    const catalog = record((await get(
      `${baseUrl}/models`, { Accept: 'application/json' }, options.signal
    )).data);
    const models = Array.isArray(catalog?.data) ? catalog.data : [];
    catalogModels = new Set(models.flatMap((item) => {
      const model = record(item);
      return typeof model?.id === 'string' ? [model.id] : [];
    }));
    if (models.length === 0) issues.push('OpenRouter model catalog returned no models');
  } catch (error) {
    issues.push(`OpenRouter model catalog failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const modelResults = await Promise.all(requirements(profile).map(async (requirement) => {
    const modelIssues: string[] = [];
    const modelChecks: OpenRouterPreflightCheckV6[] = [];
    if (!requirement.acceptedModels.some((model) => catalogModels.has(model))) {
      modelIssues.push(`Model is absent from the OpenRouter catalog: ${requirement.model}`);
    }
    try {
      const response = record((await get(
        `${baseUrl}/models/${requirement.model}/endpoints`,
        { Accept: 'application/json' },
        options.signal
      )).data);
      const data = record(response?.data);
      const endpoints = Array.isArray(data?.endpoints) ? data.endpoints : [];
      const compatibleEndpoints = endpoints.map(record).filter((candidate): candidate is Record<string, unknown> => {
        if (!candidate) return false;
        const endpointName = typeof candidate.name === 'string' ? candidate.name : '';
        const endpointModel = requirement.acceptedModels.find((model) => (
          endpointName === model || endpointName.endsWith(`| ${model}`)
        ));
        if (!endpointModel) return false;
        const supportedParameters = Array.isArray(candidate.supported_parameters)
          ? candidate.supported_parameters.filter((item): item is string => typeof item === 'string')
          : [];
        const missing = [...requirement.requiredParameters].filter((parameter) => (
          parameter === 'reasoning'
            ? !supportedParameters.includes('reasoning')
              && !supportedParameters.includes('reasoning_effort')
            : !supportedParameters.includes(parameter)
        ));
        return missing.length === 0;
      });
      if (compatibleEndpoints.length === 0) {
        modelIssues.push(
          `No compatible endpoint found for ${requirement.model} satisfying required parameters: ${[...requirement.requiredParameters].sort().join(', ')}`
        );
        return { checks: modelChecks, issues: modelIssues };
      }
      const aggregatedPricing = compatibleEndpoints.reduce((acc: EditorialPricingV6, endpoint) => {
        try {
          const endpointPricingValue = endpointPricing(endpoint.pricing);
          return {
            inputUsdPerToken: Math.max(acc.inputUsdPerToken, endpointPricingValue.inputUsdPerToken),
            outputUsdPerToken: Math.max(acc.outputUsdPerToken, endpointPricingValue.outputUsdPerToken),
            internalReasoningUsdPerToken: Math.max(acc.internalReasoningUsdPerToken ?? 0, endpointPricingValue.internalReasoningUsdPerToken ?? 0),
            requestUsd: Math.max(acc.requestUsd ?? 0, endpointPricingValue.requestUsd ?? 0),
          };
        } catch (error) {
          modelIssues.push(
            `Endpoint pricing is invalid for ${requirement.model}: ${error instanceof Error ? error.message : String(error)}`
          );
          return acc;
        }
      }, {
        inputUsdPerToken: 0,
        outputUsdPerToken: 0,
        internalReasoningUsdPerToken: 0,
        requestUsd: 0,
      });
      const firstCompatible = compatibleEndpoints[0];
      const providerName = typeof firstCompatible.provider_name === 'string'
        ? firstCompatible.provider_name
        : '';
      const endpointTag = typeof firstCompatible.tag === 'string' ? firstCompatible.tag : '';
      const endpointName = typeof firstCompatible.name === 'string' ? firstCompatible.name : '';
      const endpointModel = requirement.acceptedModels.find((model) => (
        endpointName === model || endpointName.endsWith(`| ${model}`)
      )) ?? '';
      const supportedParameters = Array.isArray(firstCompatible.supported_parameters)
        ? firstCompatible.supported_parameters.filter((item): item is string => typeof item === 'string').sort()
        : [];
      const requiredParameters = [...requirement.requiredParameters].sort();
      modelChecks.push({
        model: requirement.model,
        endpointModel,
        endpoint: endpointTag,
        provider: providerName,
        requiredParameters,
        supportedParameters,
        pricing: aggregatedPricing,
      });
    } catch (error) {
      modelIssues.push(
        `Endpoint catalog failed for ${requirement.model}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return { checks: modelChecks, issues: modelIssues };
  }));
  modelResults.forEach((result) => {
    checks.push(...result.checks);
    issues.push(...result.issues);
  });

  const normalized = { checks, issues: [...issues].sort() };
  return {
    status: issues.length === 0 ? 'ready' : 'protocol_failed',
    fingerprint: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
    checks,
    issues,
  };
}

export async function preflightBalancedOpenRouterV6(options: {
  baseUrl?: string;
  get?: OpenRouterCatalogGetV6;
  signal?: AbortSignal;
} = {}): Promise<OpenRouterPreflightResultV6> {
  return preflightNarrativeOpenRouterV6({
    ...options,
    profile: 'balanced_openrouter',
  });
}
