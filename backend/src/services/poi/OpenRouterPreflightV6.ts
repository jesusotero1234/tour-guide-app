import axios from 'axios';
import { createHash } from 'crypto';
import {
  NARRATIVE_MODEL_PROFILES_V6,
  NarrativeModelPhaseConfigV6,
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

interface RequiredEndpointV6 {
  model: string;
  endpoint: string;
  provider: string;
  acceptedModels: string[];
  requiredParameters: Set<string>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedProvider(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
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

function requirements(): RequiredEndpointV6[] {
  const byRoute = new Map<string, RequiredEndpointV6>();
  for (const phase of Object.values(NARRATIVE_MODEL_PROFILES_V6.balanced_openrouter.phases)) {
    if (phase.provider.kind !== 'openrouter'
      || !phase.provider.endpoint
      || !phase.provider.expectedProviderName) {
      throw new Error('balanced_openrouter contains an incomplete provider pin');
    }
    const key = `${phase.provider.model}\n${phase.provider.endpoint}`;
    const existing = byRoute.get(key) ?? {
      model: phase.provider.model,
      endpoint: phase.provider.endpoint,
      provider: phase.provider.expectedProviderName,
      acceptedModels: [phase.provider.model, ...(phase.provider.acceptedModels ?? [])],
      requiredParameters: new Set<string>(),
    };
    parametersForPhase(phase).forEach((parameter) => existing.requiredParameters.add(parameter));
    byRoute.set(key, existing);
  }
  return [...byRoute.values()].sort((left, right) => (
    `${left.model}/${left.endpoint}`.localeCompare(`${right.model}/${right.endpoint}`)
  ));
}

const defaultGet: OpenRouterCatalogGetV6 = async (url, headers, signal) => {
  const response = await axios.get(url, { headers, timeout: 30_000, signal });
  return { data: response.data };
};

export async function preflightBalancedOpenRouterV6(options: {
  baseUrl?: string;
  get?: OpenRouterCatalogGetV6;
  signal?: AbortSignal;
} = {}): Promise<OpenRouterPreflightResultV6> {
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

  const endpointResults = await Promise.all(requirements().map(async (requirement) => {
    const endpointIssues: string[] = [];
    const endpointChecks: OpenRouterPreflightCheckV6[] = [];
    if (!requirement.acceptedModels.some((model) => catalogModels.has(model))) {
      endpointIssues.push(`Model is absent from the OpenRouter catalog: ${requirement.model}`);
    }
    try {
      const response = record((await get(
        `${baseUrl}/models/${requirement.model}/endpoints`,
        { Accept: 'application/json' },
        options.signal
      )).data);
      const data = record(response?.data);
      const endpoints = Array.isArray(data?.endpoints) ? data.endpoints : [];
      const endpoint = endpoints.map(record).find((candidate) => (
        candidate?.tag === requirement.endpoint
      ));
      if (!endpoint) {
        endpointIssues.push(
          `Pinned endpoint is unavailable: ${requirement.model} -> ${requirement.endpoint}`
        );
        return { checks: endpointChecks, issues: endpointIssues };
      }
      const providerName = typeof endpoint.provider_name === 'string'
        ? endpoint.provider_name
        : '';
      const endpointName = typeof endpoint.name === 'string' ? endpoint.name : '';
      const endpointModel = requirement.acceptedModels.find((model) => (
        endpointName === model || endpointName.endsWith(`| ${model}`)
      )) ?? '';
      const supportedParameters = Array.isArray(endpoint.supported_parameters)
        ? endpoint.supported_parameters.filter((item): item is string => typeof item === 'string').sort()
        : [];
      const requiredParameters = [...requirement.requiredParameters].sort();
      let pricing: EditorialPricingV6;
      try {
        pricing = endpointPricing(endpoint.pricing);
      } catch (error) {
        endpointIssues.push(
          `Pinned endpoint pricing is invalid for ${requirement.model}: ${error instanceof Error ? error.message : String(error)}`
        );
        return { checks: endpointChecks, issues: endpointIssues };
      }
      endpointChecks.push({
        model: requirement.model,
        endpointModel,
        endpoint: requirement.endpoint,
        provider: providerName,
        requiredParameters,
        supportedParameters,
        pricing,
      });
      if (normalizedProvider(providerName) !== normalizedProvider(requirement.provider)) {
        endpointIssues.push(
          `Pinned provider mismatch for ${requirement.model}: expected ${requirement.provider}, got ${providerName || 'unknown'}`
        );
      }
      if (!endpointModel) {
        endpointIssues.push(
          `Pinned endpoint model mismatch for ${requirement.model}: ${endpointName || 'unknown'}`
        );
      }
      const missing = requiredParameters.filter((parameter) => (
        parameter === 'reasoning'
          ? !supportedParameters.includes('reasoning')
            && !supportedParameters.includes('reasoning_effort')
          : !supportedParameters.includes(parameter)
      ));
      if (missing.length > 0) {
        endpointIssues.push(
          `Pinned endpoint lacks required parameters for ${requirement.model}: ${missing.join(', ')}`
        );
      }
    } catch (error) {
      endpointIssues.push(
        `Endpoint catalog failed for ${requirement.model}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return { checks: endpointChecks, issues: endpointIssues };
  }));
  endpointResults.forEach((result) => {
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
