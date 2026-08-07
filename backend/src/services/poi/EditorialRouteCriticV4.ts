import { EditorialRoutePortfolioV4, EditorialRouteFinalistV4 } from './EditorialRouteOptimizerV4';
import { EditorialStoryMapV4, StoryMapRequestV4 } from './EditorialStoryMapV4';
import {
  EditorialCallResultV4,
  EditorialProviderV4,
  EditorialRequestOptionsV4,
  requestEditorialStructuredV4,
} from './EditorialStructuredLlmV4';

export const ROUTE_CRITIC_SCHEMA_VERSION = 'route-critic-v4' as const;

export const ROUTE_CRITIC_REASON_CODES_V4 = [
  'strong_opening', 'clear_progression', 'strong_resolution', 'better_observability',
  'lower_walking_cost', 'redundant_stop', 'weak_transition', 'misses_high_value',
] as const;

export interface RouteCriticStopInputV4 {
  candidateSlot: string;
  name: string;
  narrativeContributions: Array<{
    beatId: string;
    focus: string;
    strength: number;
    selectedCarrier: boolean;
    evidence: Array<{ ref: string; value: string }>;
  }>;
  marginalReasons: string[];
}

export interface RouteCriticRouteInputV4 {
  routeSlot: string;
  estimatedTourMinutes: number;
  walkingMinutes: number;
  stops: RouteCriticStopInputV4[];
  coveredBeatIds: string[];
  uncoveredBeatIds: string[];
  omittedHighPriority: Array<{
    candidateSlot: string;
    name: string;
    priorityRank: number;
    supportedBeats: string[];
    evidence: Array<{ ref: string; value: string }>;
  }>;
}

export interface RouteCriticRequestV4 {
  city: string;
  theme: string;
  language: string;
  requestedDuration: number;
  centralQuestion: string;
  beatInventory: Array<{ beatId: string; focus: string }>;
  routes: RouteCriticRouteInputV4[];
}

export interface RouteCriticAssessmentV4 {
  coherence: 'strong' | 'adequate' | 'weak';
  avoidableRedundancy: boolean;
  omissionRisk: 'none' | 'moderate' | 'high';
  reasonCodes: Array<typeof ROUTE_CRITIC_REASON_CODES_V4[number]>;
  evidenceRefs: string[];
}

export interface RouteCriticV4 {
  schemaVersion: typeof ROUTE_CRITIC_SCHEMA_VERSION;
  ranking: string[];
  assessments: Record<string, RouteCriticAssessmentV4>;
}

const ROUTE_CRITIC_SYSTEM_PROMPT = `You are a grounded editorial critic comparing only feasible Pareto walking routes.
The beat inventory is a menu of evidence-backed themes, not a required physical order. Judge the narrative created by each route's actual stop order.
Rank the supplied routes by how clearly that fixed order answers the central question, uses chronology intentionally, avoids repetition, preserves high-value candidates, and uses observable evidence.
Use only supplied route and evidence references. Do not add places, facts, routes, geometry or prose fields. Walking matters only after editorial coherence.
You cannot change a route; return every route exactly once in preference order.`;

function evidenceLookup(request: StoryMapRequestV4): Map<string, string> {
  return new Map(request.candidates.flatMap((candidate) => candidate.facts.map((fact) => (
    [`${candidate.slot}:${fact.slot}`, fact.value] as [string, string]
  ))));
}

function evidenceForRefs(refs: string[], lookup: Map<string, string>): Array<{ ref: string; value: string }> {
  return refs.map((ref) => {
    const value = lookup.get(ref);
    if (!value) throw new Error(`Critic input cannot resolve evidence ${ref}`);
    return { ref, value };
  });
}

export function buildRouteCriticRequestV4(
  portfolio: EditorialRoutePortfolioV4,
  storyMap: EditorialStoryMapV4,
  storyRequest: StoryMapRequestV4,
  context: Pick<RouteCriticRequestV4, 'city' | 'theme' | 'language' | 'requestedDuration'>
): RouteCriticRequestV4 {
  if (portfolio.finalists.length < 2 || portfolio.finalists.length > 5) {
    throw new Error('Route critic requires 2 to 5 Pareto finalists');
  }
  const lookup = evidenceLookup(storyRequest);
  const candidatesBySlot = new Map(storyRequest.candidates.map((candidate) => [candidate.slot, candidate]));
  const beatsById = new Map(storyMap.beats.map((beat) => [beat.beatId, beat]));
  const routes = portfolio.finalists.map((route) => {
    const selected = new Set(route.candidateSlots);
    const omitted = portfolio.reducedCandidates.filter((candidate) => !selected.has(candidate.slot))
      .sort((left, right) => left.assessment.relativePriorityRank - right.assessment.relativePriorityRank)
      .slice(0, 5);
    return {
      routeSlot: route.slot,
      estimatedTourMinutes: route.metrics.estimatedTourMinutes,
      walkingMinutes: route.metrics.walkingMinutes,
      coveredBeatIds: route.assignments.map((assignment) => assignment.beatId),
      uncoveredBeatIds: storyMap.beats.filter((beat) => !route.assignments.some((assignment) => (
        assignment.beatId === beat.beatId
      ))).map((beat) => beat.beatId),
      stops: route.candidateSlots.map((candidateSlot, index) => {
        const candidate = candidatesBySlot.get(candidateSlot);
        if (!candidate) throw new Error(`Critic input is missing ${candidateSlot}`);
        return {
          candidateSlot,
          name: route.entities[index].localName,
          narrativeContributions: storyMap.candidates[candidateSlot].contributions
            .filter((contribution) => contribution.strength >= 2)
            .map((contribution) => {
              const beat = beatsById.get(contribution.beatId);
              if (!beat) throw new Error(`Critic input cannot map ${candidateSlot}:${contribution.beatId}`);
              return {
                beatId: beat.beatId, focus: beat.focus, strength: contribution.strength,
                selectedCarrier: route.assignments.some((assignment) => (
                  assignment.beatId === beat.beatId && assignment.candidateSlot === candidateSlot
                )),
                evidence: evidenceForRefs(contribution.evidenceRefs, lookup),
              };
            }),
          marginalReasons: route.marginalContributions[candidateSlot] ?? [],
        };
      }),
      omittedHighPriority: omitted.map((candidate) => ({
        candidateSlot: candidate.slot,
        name: candidate.entity.localName,
        priorityRank: candidate.assessment.relativePriorityRank,
        supportedBeats: candidate.assessment.contributions.filter((item) => item.strength >= 2).map((item) => item.beatId),
        evidence: evidenceForRefs(candidate.assessment.contributions.flatMap((item) => item.evidenceRefs).slice(0, 2), lookup),
      })),
    };
  });
  return {
    ...context,
    centralQuestion: storyMap.centralQuestion,
    beatInventory: storyMap.beats.map((beat) => ({ beatId: beat.beatId, focus: beat.focus })),
    routes,
  };
}

function evidenceRefs(request: RouteCriticRequestV4): string[] {
  return [...new Set(request.routes.flatMap((route) => [
    ...route.stops.flatMap((stop) => stop.narrativeContributions.flatMap((beat) => beat.evidence.map((item) => item.ref))),
    ...route.omittedHighPriority.flatMap((candidate) => candidate.evidence.map((item) => item.ref)),
  ]))];
}

export function routeCriticResponseSchemaV4(request: RouteCriticRequestV4): Record<string, unknown> {
  const routeSlots = request.routes.map((route) => route.routeSlot);
  const refs = evidenceRefs(request);
  const assessment = {
    type: 'object', additionalProperties: false,
    required: ['coherence', 'avoidableRedundancy', 'omissionRisk', 'reasonCodes', 'evidenceRefs'],
    properties: {
      coherence: { type: 'string', enum: ['strong', 'adequate', 'weak'] },
      avoidableRedundancy: { type: 'boolean' },
      omissionRisk: { type: 'string', enum: ['none', 'moderate', 'high'] },
      reasonCodes: {
        type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
        items: { type: 'string', enum: ROUTE_CRITIC_REASON_CODES_V4 },
      },
      evidenceRefs: {
        type: 'array', minItems: 1, maxItems: 5, uniqueItems: true,
        items: { type: 'string', enum: refs },
      },
    },
  };
  return {
    type: 'object', additionalProperties: false,
    required: ['schemaVersion', 'ranking', 'assessments'],
    properties: {
      schemaVersion: { type: 'string', enum: [ROUTE_CRITIC_SCHEMA_VERSION] },
      ranking: {
        type: 'array', minItems: routeSlots.length, maxItems: routeSlots.length, uniqueItems: true,
        items: { type: 'string', enum: routeSlots },
      },
      assessments: {
        type: 'object', additionalProperties: false, required: routeSlots,
        properties: Object.fromEntries(routeSlots.map((routeSlot) => [routeSlot, assessment])),
      },
    },
  };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) throw new Error(`${label} has unexpected or missing fields`);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label} is invalid`);
  return value as T;
}

function stringList<T extends string>(value: unknown, allowed: readonly T[], label: string): T[] {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== 'string' || !allowed.includes(item as T))) throw new Error(`${label} is invalid`);
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
  return value as T[];
}

export function validateRouteCriticV4(value: unknown, request: RouteCriticRequestV4): RouteCriticV4 {
  const root = objectValue(value, 'route critic');
  exactKeys(root, ['schemaVersion', 'ranking', 'assessments'], 'route critic');
  if (root.schemaVersion !== ROUTE_CRITIC_SCHEMA_VERSION) throw new Error('Invalid route critic schemaVersion');
  const routeSlots = request.routes.map((route) => route.routeSlot);
  const ranking = stringList(root.ranking, routeSlots, 'route critic ranking');
  if (ranking.length !== routeSlots.length || [...ranking].sort().join(',') !== [...routeSlots].sort().join(',')) {
    throw new Error('Route critic ranking must contain every finalist exactly once');
  }
  const rawAssessments = objectValue(root.assessments, 'route critic assessments');
  exactKeys(rawAssessments, routeSlots, 'route critic assessments');
  const refs = evidenceRefs(request);
  const assessments: Record<string, RouteCriticAssessmentV4> = {};
  for (const routeSlot of routeSlots) {
    const raw = objectValue(rawAssessments[routeSlot], `assessments.${routeSlot}`);
    exactKeys(raw, ['coherence', 'avoidableRedundancy', 'omissionRisk', 'reasonCodes', 'evidenceRefs'], `assessments.${routeSlot}`);
    if (typeof raw.avoidableRedundancy !== 'boolean') throw new Error(`assessments.${routeSlot}.avoidableRedundancy is invalid`);
    assessments[routeSlot] = {
      coherence: enumValue(raw.coherence, ['strong', 'adequate', 'weak'] as const, `assessments.${routeSlot}.coherence`),
      avoidableRedundancy: raw.avoidableRedundancy,
      omissionRisk: enumValue(raw.omissionRisk, ['none', 'moderate', 'high'] as const, `assessments.${routeSlot}.omissionRisk`),
      reasonCodes: stringList(raw.reasonCodes, ROUTE_CRITIC_REASON_CODES_V4, `assessments.${routeSlot}.reasonCodes`),
      evidenceRefs: stringList(raw.evidenceRefs, refs, `assessments.${routeSlot}.evidenceRefs`),
    };
  }
  return { schemaVersion: ROUTE_CRITIC_SCHEMA_VERSION, ranking, assessments };
}

export function requestRouteCriticV4(
  request: RouteCriticRequestV4,
  provider: EditorialProviderV4,
  options: EditorialRequestOptionsV4 = {}
): Promise<EditorialCallResultV4<RouteCriticV4>> {
  return requestEditorialStructuredV4({
    input: request, provider, options, systemPrompt: ROUTE_CRITIC_SYSTEM_PROMPT,
    schema: routeCriticResponseSchemaV4(request), toolName: 'submit_route_critic_v4',
    toolDescription: 'Rank every feasible route and submit grounded controlled assessments.',
    validate: (value) => validateRouteCriticV4(value, request),
  });
}

export function selectRouteCriticWinnerV4(
  portfolio: EditorialRoutePortfolioV4,
  critic: RouteCriticV4 | null
): EditorialRouteFinalistV4 {
  if (portfolio.finalists.length === 0) throw new Error('Cannot select from an empty route portfolio');
  if (portfolio.finalists.length === 1) return portfolio.finalists[0];
  if (!critic) throw new Error('Multiple Pareto finalists require a valid route critic');
  const criticOrder = new Map(critic.ranking.map((slot, index) => [slot, index]));
  const acceptable = portfolio.finalists.filter((route) => {
    const assessment = critic.assessments[route.slot];
    return assessment && assessment.coherence !== 'weak' && !assessment.avoidableRedundancy;
  }).sort((left, right) => (
    right.scores.priorityCoverage - left.scores.priorityCoverage
      || right.scores.beatCoverage - left.scores.beatCoverage
      || (criticOrder.get(left.slot) as number) - (criticOrder.get(right.slot) as number)
  ));
  if (acceptable.length === 0) throw new Error('Route critic found no coherent, non-redundant finalist');
  return acceptable[0];
}
