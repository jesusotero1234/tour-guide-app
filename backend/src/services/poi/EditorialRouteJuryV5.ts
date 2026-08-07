import { selectRouteConditionedFactPackV5 } from './EditorialEvidenceV5';
import { EditorialRoutePortfolioV5 } from './EditorialRoutePortfolioV5';
import {
  EditorialCallBudgetV5,
  EditorialCallPhaseV5,
  EditorialCallResultV5,
  EditorialProviderV5,
  EditorialRequestOptionsV5,
  requestEditorialStructuredV5,
} from './EditorialStructuredLlmV5';

export const ROUTE_JURY_SCHEMA_VERSION_V5 = 'route-jury-v5' as const;
export const ROUTE_JURY_MODEL_V5 = 'deepseek-v4-flash' as const;

export const ROUTE_JURY_SYSTEM_PROMPT_V5 = `You are the final editorial jury for a paid, exterior, first-visit walking tour.
Compare complete routes in their fixed walking order. Prefer a clear promise, strong first-visit landmarks, causal progression, distinct contributions at every stop, a satisfying resolution, and no avoidable repetition.
Use only supplied route, candidate, and evidence identifiers. Never invent or alter geometry. The candidate catalog may be used only for grounded repair suggestions; a suggestion is not a route until deterministic code validates it.
Return every route exactly once in ranking and assessment. Shortlist exactly three non-rejected routes and provide a grounded route plan for exactly those three.
The first stop must be opening_anchor and the last resolution_anchor. Every stop must cite only its own evidence.
Do not optimize for consuming the requested duration. Do not infer oracle targets, baseline results, or hidden optimizer scores.`;

export type RouteJuryRoleV5 =
  | 'opening_anchor'
  | 'chapter_anchor'
  | 'turning_point'
  | 'resolution_anchor';

export interface RouteJuryCandidateInputV5 {
  candidateSlot: string;
  canonicalId: string;
  localName: string;
  category: string;
  fameScore: number;
  facts: Array<{
    evidenceId: string;
    kind: 'claim' | 'context' | 'observable';
    value: string;
  }>;
}

export interface RouteJuryRouteInputV5 {
  routeSlot: string;
  candidateSlots: string[];
  estimatedTourMinutes: number;
  walkingMinutes: number;
  walkingMeters: number;
  maxSegmentMinutes: number;
  maxSegmentMeters: number;
}

export interface RouteJuryRequestV5 {
  schemaVersion: 'route-jury-request-v5';
  phase: 'initial' | 'final';
  city: string;
  theme: string;
  language: string;
  requestedDuration: number;
  candidateCatalog: RouteJuryCandidateInputV5[];
  routes: RouteJuryRouteInputV5[];
}

export interface RouteJuryAssessmentV5 {
  verdict: 'strong' | 'acceptable' | 'reject';
  paidTourValue: 0 | 1 | 2 | 3 | 4;
  firstVisitCompleteness: 0 | 1 | 2 | 3 | 4;
  progression: 0 | 1 | 2 | 3 | 4;
  nonRedundancy: 0 | 1 | 2 | 3 | 4;
  omissionRisk: 'none' | 'moderate' | 'high';
  reasonCodes: string[];
}

export interface RouteJuryStopPlanV5 {
  candidateSlot: string;
  role: RouteJuryRoleV5;
  uniqueContribution: string;
  evidenceIds: string[];
}

export interface RouteJuryRepairSuggestionV5 {
  removeSlot: string | null;
  addSlot: string | null;
  insertAfterSlot: string | null;
  reason: string;
  evidenceIds: string[];
}

export interface RouteJuryPlanV5 {
  promise: string;
  centralQuestion: string;
  stops: RouteJuryStopPlanV5[];
  repairSuggestions: RouteJuryRepairSuggestionV5[];
}

export interface RouteJuryV5 {
  schemaVersion: typeof ROUTE_JURY_SCHEMA_VERSION_V5;
  ranking: string[];
  shortlist: [string, string, string];
  assessments: Record<string, RouteJuryAssessmentV5>;
  routePlans: Record<string, RouteJuryPlanV5>;
}

export function buildRouteJuryRequestV5(
  portfolio: EditorialRoutePortfolioV5,
  context: Pick<RouteJuryRequestV5, 'phase' | 'city' | 'theme' | 'language' | 'requestedDuration'>
): RouteJuryRequestV5 {
  const maximumRoutes = context.phase === 'initial' ? 10 : 6;
  if (portfolio.routes.length < 3 || portfolio.routes.length > maximumRoutes) {
    throw new Error(`${context.phase} route jury requires 3 to ${maximumRoutes} routes`);
  }
  if (portfolio.candidates.length === 0 || portfolio.candidates.length > 30) {
    throw new Error('Route jury candidate catalog requires 1 to 30 candidates');
  }
  const routeEntities = [...new Map(portfolio.routes.flatMap((route) => (
    route.entities.map((entity) => [entity.canonicalId, entity] as const)
  ))).values()];
  return {
    schemaVersion: 'route-jury-request-v5',
    ...context,
    candidateCatalog: portfolio.candidates.map((candidate) => ({
      candidateSlot: candidate.slot,
      canonicalId: candidate.entity.canonicalId,
      localName: candidate.entity.localName,
      category: candidate.entity.category,
      fameScore: candidate.entity.fameScore,
      facts: selectRouteConditionedFactPackV5(candidate.entity, routeEntities).map((fact) => ({
        evidenceId: fact.id,
        kind: fact.kind,
        value: fact.value.replace(/\s+/g, ' ').trim().slice(0, 280),
      })),
    })),
    routes: portfolio.routes.map((route) => ({
      routeSlot: route.slot,
      candidateSlots: route.candidateSlots,
      estimatedTourMinutes: route.metrics.estimatedTourMinutes,
      walkingMinutes: route.metrics.walkingMinutes,
      walkingMeters: route.metrics.walkingMeters,
      maxSegmentMinutes: route.metrics.maxSegmentMinutes,
      maxSegmentMeters: route.metrics.maxSegmentMeters,
    })),
  };
}

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

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label} is invalid`);
  return value as T;
}

function boundedInteger<T extends number>(value: unknown, minimum: number, maximum: number, label: string): T {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value as T;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid`);
  return value.trim();
}

function exactStringList(value: unknown, allowed: string[], label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} is invalid`);
  }
  const strings = value as string[];
  if (new Set(strings).size !== strings.length
    || strings.length !== allowed.length
    || [...strings].sort().join(',') !== [...allowed].sort().join(',')) {
    throw new Error(`${label} must contain every allowed ID exactly once`);
  }
  return strings;
}

function controlledStringList(
  value: unknown,
  label: string,
  options: { minimum: number; maximum: number; allowed?: Set<string> }
): string[] {
  if (!Array.isArray(value) || value.length < options.minimum || value.length > options.maximum
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} is invalid`);
  }
  const strings = value as string[];
  if (new Set(strings).size !== strings.length
    || (options.allowed && strings.some((item) => !options.allowed!.has(item)))) {
    throw new Error(`${label} contains duplicates or unknown IDs`);
  }
  return strings;
}

function nullableSlot(value: unknown, allowed: Set<string>, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !allowed.has(value)) throw new Error(`${label} is invalid`);
  return value;
}

export function validateRouteJuryV5(value: unknown, request: RouteJuryRequestV5): RouteJuryV5 {
  const root = objectValue(value, 'route jury');
  exactKeys(root, ['schemaVersion', 'ranking', 'shortlist', 'assessments', 'routePlans'], 'route jury');
  if (root.schemaVersion !== ROUTE_JURY_SCHEMA_VERSION_V5) throw new Error('Invalid route jury schemaVersion');
  const routeSlots = request.routes.map((route) => route.routeSlot);
  const routeSlotSet = new Set(routeSlots);
  const ranking = exactStringList(root.ranking, routeSlots, 'route jury ranking');
  if (!Array.isArray(root.shortlist) || root.shortlist.length !== 3) {
    throw new Error('route jury shortlist must contain exactly three routes');
  }
  const shortlist = controlledStringList(root.shortlist, 'route jury shortlist', {
    minimum: 3, maximum: 3, allowed: routeSlotSet,
  }) as [string, string, string];
  const rawAssessments = objectValue(root.assessments, 'route jury assessments');
  exactKeys(rawAssessments, routeSlots, 'route jury assessments');
  const assessments: Record<string, RouteJuryAssessmentV5> = {};
  for (const routeSlot of routeSlots) {
    const raw = objectValue(rawAssessments[routeSlot], `assessments.${routeSlot}`);
    exactKeys(raw, [
      'verdict', 'paidTourValue', 'firstVisitCompleteness', 'progression',
      'nonRedundancy', 'omissionRisk', 'reasonCodes',
    ], `assessments.${routeSlot}`);
    assessments[routeSlot] = {
      verdict: enumValue(raw.verdict, ['strong', 'acceptable', 'reject'] as const, `assessments.${routeSlot}.verdict`),
      paidTourValue: boundedInteger(raw.paidTourValue, 0, 4, `assessments.${routeSlot}.paidTourValue`),
      firstVisitCompleteness: boundedInteger(raw.firstVisitCompleteness, 0, 4, `assessments.${routeSlot}.firstVisitCompleteness`),
      progression: boundedInteger(raw.progression, 0, 4, `assessments.${routeSlot}.progression`),
      nonRedundancy: boundedInteger(raw.nonRedundancy, 0, 4, `assessments.${routeSlot}.nonRedundancy`),
      omissionRisk: enumValue(raw.omissionRisk, ['none', 'moderate', 'high'] as const, `assessments.${routeSlot}.omissionRisk`),
      reasonCodes: controlledStringList(raw.reasonCodes, `assessments.${routeSlot}.reasonCodes`, {
        minimum: 1, maximum: 6,
      }),
    };
  }
  if (shortlist.some((routeSlot) => assessments[routeSlot].verdict === 'reject')) {
    throw new Error('route jury shortlist must contain three non-rejected routes');
  }
  const catalogSlots = new Set(request.candidateCatalog.map((candidate) => candidate.candidateSlot));
  const evidenceByCandidate = new Map(request.candidateCatalog.map((candidate) => [
    candidate.candidateSlot, new Set(candidate.facts.map((fact) => fact.evidenceId)),
  ]));
  const rawPlans = objectValue(root.routePlans, 'route jury routePlans');
  exactKeys(rawPlans, shortlist, 'route jury routePlans');
  const routePlans: Record<string, RouteJuryPlanV5> = {};
  for (const routeSlot of shortlist) {
    const route = request.routes.find((item) => item.routeSlot === routeSlot) as RouteJuryRouteInputV5;
    const routeCandidateSet = new Set(route.candidateSlots);
    const rawPlan = objectValue(rawPlans[routeSlot], `routePlans.${routeSlot}`);
    exactKeys(rawPlan, ['promise', 'centralQuestion', 'stops', 'repairSuggestions'], `routePlans.${routeSlot}`);
    if (!Array.isArray(rawPlan.stops) || rawPlan.stops.length !== route.candidateSlots.length) {
      throw new Error(`routePlans.${routeSlot}.stops must match the fixed route order`);
    }
    const stops = rawPlan.stops.map((valueAtStop, index): RouteJuryStopPlanV5 => {
      const rawStop = objectValue(valueAtStop, `routePlans.${routeSlot}.stops[${index}]`);
      exactKeys(rawStop, ['candidateSlot', 'role', 'uniqueContribution', 'evidenceIds'], `routePlans.${routeSlot}.stops[${index}]`);
      if (rawStop.candidateSlot !== route.candidateSlots[index]) {
        throw new Error(`routePlans.${routeSlot}.stops must preserve the fixed route order`);
      }
      const candidateSlot = rawStop.candidateSlot as string;
      const role = enumValue(rawStop.role, [
        'opening_anchor', 'chapter_anchor', 'turning_point', 'resolution_anchor',
      ] as const, `routePlans.${routeSlot}.stops[${index}].role`);
      if (index === 0 && role !== 'opening_anchor') {
        throw new Error(`routePlans.${routeSlot} first stop must be opening_anchor`);
      }
      if (index === route.candidateSlots.length - 1 && role !== 'resolution_anchor') {
        throw new Error(`routePlans.${routeSlot} last stop must be resolution_anchor`);
      }
      if (index > 0 && index < route.candidateSlots.length - 1
        && (role === 'opening_anchor' || role === 'resolution_anchor')) {
        throw new Error(`routePlans.${routeSlot} boundary roles cannot appear internally`);
      }
      const evidenceIds = controlledStringList(rawStop.evidenceIds, `routePlans.${routeSlot}.stops[${index}].evidenceIds`, {
        minimum: 1, maximum: 4, allowed: evidenceByCandidate.get(candidateSlot),
      });
      return {
        candidateSlot, role,
        uniqueContribution: nonEmptyString(rawStop.uniqueContribution, `routePlans.${routeSlot}.stops[${index}].uniqueContribution`),
        evidenceIds,
      };
    });
    if (new Set(stops.map((stop) => stop.uniqueContribution.toLowerCase())).size !== stops.length) {
      throw new Error(`routePlans.${routeSlot} requires a unique contribution for every stop`);
    }
    if (!Array.isArray(rawPlan.repairSuggestions) || rawPlan.repairSuggestions.length > 2) {
      throw new Error(`routePlans.${routeSlot}.repairSuggestions is invalid`);
    }
    const repairSuggestions = rawPlan.repairSuggestions.map((valueAtSuggestion, index): RouteJuryRepairSuggestionV5 => {
      const label = `routePlans.${routeSlot}.repairSuggestions[${index}]`;
      const rawSuggestion = objectValue(valueAtSuggestion, label);
      exactKeys(rawSuggestion, ['removeSlot', 'addSlot', 'insertAfterSlot', 'reason', 'evidenceIds'], label);
      const removeSlot = nullableSlot(rawSuggestion.removeSlot, routeCandidateSet, `${label}.removeSlot`);
      const addSlot = nullableSlot(rawSuggestion.addSlot, catalogSlots, `${label}.addSlot`);
      const insertAfterSlot = nullableSlot(rawSuggestion.insertAfterSlot, routeCandidateSet, `${label}.insertAfterSlot`);
      if (removeSlot === null && addSlot === null) throw new Error(`${label} must change the route`);
      if (addSlot && routeCandidateSet.has(addSlot) && addSlot !== removeSlot) {
        throw new Error(`${label}.addSlot already exists in the route`);
      }
      if (insertAfterSlot === removeSlot && removeSlot !== null) {
        throw new Error(`${label}.insertAfterSlot cannot be removed`);
      }
      if (addSlot === null && insertAfterSlot !== null) {
        throw new Error(`${label}.insertAfterSlot requires addSlot`);
      }
      const evidenceOwners = new Set([
        ...(removeSlot ? evidenceByCandidate.get(removeSlot) ?? [] : []),
        ...(addSlot ? evidenceByCandidate.get(addSlot) ?? [] : []),
      ]);
      return {
        removeSlot, addSlot, insertAfterSlot,
        reason: nonEmptyString(rawSuggestion.reason, `${label}.reason`),
        evidenceIds: controlledStringList(rawSuggestion.evidenceIds, `${label}.evidenceIds`, {
          minimum: 1, maximum: 4, allowed: evidenceOwners,
        }),
      };
    });
    routePlans[routeSlot] = {
      promise: nonEmptyString(rawPlan.promise, `routePlans.${routeSlot}.promise`),
      centralQuestion: nonEmptyString(rawPlan.centralQuestion, `routePlans.${routeSlot}.centralQuestion`),
      stops, repairSuggestions,
    };
  }
  if (request.requestedDuration >= 90 && shortlist.some((routeSlot) => (
    routePlans[routeSlot].stops.length < 4
  ))) throw new Error('Tours of at least 90 minutes require four substantive stops');
  return { schemaVersion: ROUTE_JURY_SCHEMA_VERSION_V5, ranking, shortlist, assessments, routePlans };
}

function scoreSchema(): Record<string, unknown> {
  return { type: 'integer', minimum: 0, maximum: 4 };
}

export function routeJuryResponseSchemaV5(request: RouteJuryRequestV5): Record<string, unknown> {
  const routeSlots = request.routes.map((route) => route.routeSlot);
  const candidateSlots = request.candidateCatalog.map((candidate) => candidate.candidateSlot);
  const evidenceIds = request.candidateCatalog.flatMap((candidate) => candidate.facts.map((fact) => fact.evidenceId));
  const nullableCandidate = { enum: [null, ...candidateSlots] };
  const plan = {
    type: 'object', additionalProperties: false,
    required: ['promise', 'centralQuestion', 'stops', 'repairSuggestions'],
    properties: {
      promise: { type: 'string', minLength: 1 },
      centralQuestion: { type: 'string', minLength: 1 },
      stops: {
        type: 'array', minItems: 4, maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          required: ['candidateSlot', 'role', 'uniqueContribution', 'evidenceIds'],
          properties: {
            candidateSlot: { type: 'string', enum: candidateSlots },
            role: { type: 'string', enum: ['opening_anchor', 'chapter_anchor', 'turning_point', 'resolution_anchor'] },
            uniqueContribution: { type: 'string', minLength: 1 },
            evidenceIds: {
              type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
              items: { type: 'string', enum: evidenceIds },
            },
          },
        },
      },
      repairSuggestions: {
        type: 'array', maxItems: 2,
        items: {
          type: 'object', additionalProperties: false,
          required: ['removeSlot', 'addSlot', 'insertAfterSlot', 'reason', 'evidenceIds'],
          properties: {
            removeSlot: nullableCandidate,
            addSlot: nullableCandidate,
            insertAfterSlot: nullableCandidate,
            reason: { type: 'string', minLength: 1 },
            evidenceIds: {
              type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
              items: { type: 'string', enum: evidenceIds },
            },
          },
        },
      },
    },
  };
  const assessment = {
    type: 'object', additionalProperties: false,
    required: [
      'verdict', 'paidTourValue', 'firstVisitCompleteness', 'progression',
      'nonRedundancy', 'omissionRisk', 'reasonCodes',
    ],
    properties: {
      verdict: { type: 'string', enum: ['strong', 'acceptable', 'reject'] },
      paidTourValue: scoreSchema(), firstVisitCompleteness: scoreSchema(),
      progression: scoreSchema(), nonRedundancy: scoreSchema(),
      omissionRisk: { type: 'string', enum: ['none', 'moderate', 'high'] },
      reasonCodes: {
        type: 'array', minItems: 1, maxItems: 6, uniqueItems: true,
        items: { type: 'string', minLength: 1 },
      },
    },
  };
  return {
    type: 'object', additionalProperties: false,
    required: ['schemaVersion', 'ranking', 'shortlist', 'assessments', 'routePlans'],
    properties: {
      schemaVersion: { type: 'string', enum: [ROUTE_JURY_SCHEMA_VERSION_V5] },
      ranking: {
        type: 'array', minItems: routeSlots.length, maxItems: routeSlots.length,
        uniqueItems: true, items: { type: 'string', enum: routeSlots },
      },
      shortlist: {
        type: 'array', minItems: 3, maxItems: 3, uniqueItems: true,
        items: { type: 'string', enum: routeSlots },
      },
      assessments: {
        type: 'object', additionalProperties: false, required: routeSlots,
        properties: Object.fromEntries(routeSlots.map((routeSlot) => [routeSlot, assessment])),
      },
      routePlans: {
        type: 'object', minProperties: 3, maxProperties: 3,
        propertyNames: { enum: routeSlots }, additionalProperties: plan,
      },
    },
  };
}

export function requestRouteJuryV5(
  request: RouteJuryRequestV5,
  provider: EditorialProviderV5,
  budget: EditorialCallBudgetV5,
  options: EditorialRequestOptionsV5 = {}
): Promise<EditorialCallResultV5<RouteJuryV5>> {
  return requestEditorialStructuredV5({
    phase: request.phase satisfies EditorialCallPhaseV5,
    budget,
    input: request,
    provider,
    options,
    systemPrompt: ROUTE_JURY_SYSTEM_PROMPT_V5,
    schema: routeJuryResponseSchemaV5(request),
    toolName: `submit_${request.phase}_route_jury_v5`,
    toolDescription: 'Rank every supplied route and return exactly three grounded route plans.',
    validate: (value) => validateRouteJuryV5(value, request),
  });
}
