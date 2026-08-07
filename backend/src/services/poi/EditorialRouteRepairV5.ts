import { RouteJuryPlanV5, RouteJuryV5 } from './EditorialRouteJuryV5';
import {
  EditorialRoutePortfolioV5,
  EditorialRouteV5,
  evaluateEditorialRouteOrderV5,
} from './EditorialRoutePortfolioV5';
import { WalkingMatrixSnapshotV4 } from './EditorialWalkingMatrixV4';

export type EditorialRepairOperationV5 =
  | 'original'
  | 'jury_suggestion'
  | 'delete'
  | 'protected_swap'
  | 'relocate'
  | 'reverse'
  | 'two_opt';

export interface EditorialRepairDiagnosticV5 {
  sourceRouteSlot: string;
  operation: EditorialRepairOperationV5;
  signature: string;
  reason: 'physical_constraints' | 'duplicate';
}

export interface EditorialRepairResultV5 {
  portfolio: EditorialRoutePortfolioV5;
  provenance: Record<string, {
    sourceRouteSlot: string;
    operation: EditorialRepairOperationV5;
    sourceSignature: string;
  }>;
  diagnostics: {
    operationCounts: Record<EditorialRepairOperationV5, number>;
    discarded: EditorialRepairDiagnosticV5[];
  };
}

export interface EditorialWinnerV5 {
  route: EditorialRouteV5;
  plan: RouteJuryPlanV5;
}

interface Alternative {
  route: EditorialRouteV5;
  sourceRouteSlot: string;
  sourceSignature: string;
  operation: EditorialRepairOperationV5;
}

const OPERATIONS: EditorialRepairOperationV5[] = [
  'original', 'jury_suggestion', 'delete', 'protected_swap', 'relocate', 'reverse', 'two_opt',
];

function signature(candidateSlots: string[]): string {
  return candidateSlots.join('>');
}

function applySuggestion(
  candidateSlots: string[],
  suggestion: RouteJuryPlanV5['repairSuggestions'][number]
): string[] {
  const next = [...candidateSlots];
  let removedIndex = -1;
  if (suggestion.removeSlot) {
    removedIndex = next.indexOf(suggestion.removeSlot);
    if (removedIndex < 0) return [];
    next.splice(removedIndex, 1);
  }
  if (suggestion.addSlot) {
    if (next.includes(suggestion.addSlot)) return [];
    const afterIndex = suggestion.insertAfterSlot ? next.indexOf(suggestion.insertAfterSlot) : -1;
    if (suggestion.insertAfterSlot && afterIndex < 0) return [];
    const insertionIndex = afterIndex >= 0 ? afterIndex + 1
      : removedIndex >= 0 ? Math.min(removedIndex, next.length) : next.length;
    next.splice(insertionIndex, 0, suggestion.addSlot);
  }
  return next;
}

function relocate(candidateSlots: string[], from: number, to: number): string[] {
  const next = [...candidateSlots];
  const [candidate] = next.splice(from, 1);
  next.splice(to, 0, candidate);
  return next;
}

function reverseRange(candidateSlots: string[], left: number, right: number): string[] {
  return [
    ...candidateSlots.slice(0, left),
    ...candidateSlots.slice(left, right + 1).reverse(),
    ...candidateSlots.slice(right + 1),
  ];
}

function jaccard(left: EditorialRouteV5, right: EditorialRouteV5): number {
  const leftSet = new Set(left.candidateSlots);
  const rightSet = new Set(right.candidateSlots);
  const intersection = [...leftSet].filter((slot) => rightSet.has(slot)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function operationPriority(operation: EditorialRepairOperationV5): number {
  return [
    'jury_suggestion', 'protected_swap', 'delete', 'two_opt', 'relocate', 'reverse', 'original',
  ].indexOf(operation);
}

export function buildEditorialRepairPortfolioV5(
  initial: EditorialRoutePortfolioV5,
  jury: RouteJuryV5,
  matrix: WalkingMatrixSnapshotV4,
  durationCeiling = initial.searchedDuration
): EditorialRepairResultV5 {
  const operationCounts: Record<EditorialRepairOperationV5, number> = Object.fromEntries(
    OPERATIONS.map((operation) => [operation, 0])
  ) as Record<EditorialRepairOperationV5, number>;
  const discarded: EditorialRepairDiagnosticV5[] = [];
  const alternatives: Alternative[] = [];
  const seen = new Set<string>();
  const candidateSlotSet = new Set(initial.candidates.map((candidate) => candidate.slot));
  const addAlternative = (
    source: EditorialRouteV5,
    candidateSlots: string[],
    operation: EditorialRepairOperationV5
  ) => {
    const candidateSignature = signature(candidateSlots);
    const route = evaluateEditorialRouteOrderV5(
      '', candidateSlots, initial.candidates, matrix, durationCeiling,
      initial.requestedDuration, initial.protectedCandidateSlots
    );
    if (!route) {
      discarded.push({
        sourceRouteSlot: source.slot, operation, signature: candidateSignature,
        reason: 'physical_constraints',
      });
      return;
    }
    operationCounts[operation] += 1;
    if (seen.has(candidateSignature)) {
      discarded.push({
        sourceRouteSlot: source.slot, operation, signature: candidateSignature,
        reason: 'duplicate',
      });
      return;
    }
    seen.add(candidateSignature);
    alternatives.push({
      route, sourceRouteSlot: source.slot,
      sourceSignature: signature(source.candidateSlots), operation,
    });
  };

  const rankedOriginals = jury.ranking.map((routeSlot) => (
    initial.routes.find((route) => route.slot === routeSlot)
  )).filter((route): route is EditorialRouteV5 => Boolean(route))
    .filter((route) => jury.assessments[route.slot]?.verdict !== 'reject');
  for (const source of rankedOriginals) addAlternative(source, source.candidateSlots, 'original');
  const mutationSources = rankedOriginals.slice(0, 2);
  for (const source of mutationSources) {
    const plan = jury.routePlans[source.slot];
    if (plan) {
      let cumulative = [...source.candidateSlots];
      for (const suggestion of plan.repairSuggestions.slice(0, 2)) {
        const individual = applySuggestion(source.candidateSlots, suggestion);
        if (individual.length > 0) addAlternative(source, individual, 'jury_suggestion');
        cumulative = applySuggestion(cumulative, suggestion);
        if (cumulative.length === 0) break;
      }
      if (plan.repairSuggestions.length > 1 && cumulative.length > 0) {
        addAlternative(source, cumulative, 'jury_suggestion');
      }
    }
    for (let remove = 0; remove < source.candidateSlots.length; remove += 1) {
      addAlternative(source, source.candidateSlots.filter((_, index) => index !== remove), 'delete');
    }
    const omittedProtected = initial.protectedCandidateSlots.filter((slot) => (
      candidateSlotSet.has(slot) && !source.candidateSlots.includes(slot)
    ));
    for (const addSlot of omittedProtected) {
      for (let replace = 0; replace < source.candidateSlots.length; replace += 1) {
        const swapped = [...source.candidateSlots];
        swapped[replace] = addSlot;
        addAlternative(source, swapped, 'protected_swap');
      }
    }
    for (let from = 0; from < source.candidateSlots.length; from += 1) {
      for (let to = 0; to < source.candidateSlots.length; to += 1) {
        if (from !== to) addAlternative(source, relocate(source.candidateSlots, from, to), 'relocate');
      }
    }
    addAlternative(source, [...source.candidateSlots].reverse(), 'reverse');
    for (let left = 1; left < source.candidateSlots.length - 2; left += 1) {
      for (let right = left + 1; right < source.candidateSlots.length - 1; right += 1) {
        addAlternative(source, reverseRange(source.candidateSlots, left, right), 'two_opt');
      }
    }
  }

  const selected: Alternative[] = [];
  const selectedSignatures = new Set<string>();
  const select = (alternative: Alternative | undefined) => {
    if (!alternative || selected.length >= 6) return;
    const candidateSignature = signature(alternative.route.candidateSlots);
    if (!selectedSignatures.has(candidateSignature)) {
      selected.push(alternative);
      selectedSignatures.add(candidateSignature);
    }
  };
  for (const source of rankedOriginals.slice(0, 2)) {
    select(alternatives.find((alternative) => (
      alternative.operation === 'original' && alternative.sourceRouteSlot === source.slot
    )));
  }
  for (const source of mutationSources) {
    select(alternatives.find((alternative) => (
      alternative.operation === 'jury_suggestion' && alternative.sourceRouteSlot === source.slot
    )));
  }
  const protectedSet = new Set(initial.protectedCandidateSlots);
  while (selected.length < Math.min(6, alternatives.length)) {
    const covered = new Set(selected.flatMap((alternative) => alternative.route.candidateSlots));
    const options = alternatives.filter((alternative) => (
      !selectedSignatures.has(signature(alternative.route.candidateSlots))
    )).map((alternative) => ({
      alternative,
      newProtected: alternative.route.candidateSlots.filter((slot) => (
        protectedSet.has(slot) && !covered.has(slot)
      )).length,
      maxSimilarity: selected.length === 0 ? 0 : Math.max(...selected.map((chosen) => (
        jaccard(alternative.route, chosen.route)
      ))),
    })).sort((left, right) => (
      right.newProtected - left.newProtected
        || Number(left.maxSimilarity > 0.75) - Number(right.maxSimilarity > 0.75)
        || left.maxSimilarity - right.maxSimilarity
        || operationPriority(left.alternative.operation) - operationPriority(right.alternative.operation)
        || left.alternative.route.metrics.walkingMinutes - right.alternative.route.metrics.walkingMinutes
        || left.alternative.route.candidateSlots.length - right.alternative.route.candidateSlots.length
        || signature(left.alternative.route.candidateSlots)
          .localeCompare(signature(right.alternative.route.candidateSlots))
    ));
    if (options.length === 0) break;
    select(options[0].alternative);
  }
  if (selected.length < 3) {
    throw new Error('Deterministic repair produced fewer than three valid final alternatives');
  }
  const provenance: EditorialRepairResultV5['provenance'] = {};
  const routes = selected.map((alternative, index) => {
    const slot = `f${String(index + 1).padStart(2, '0')}`;
    provenance[slot] = {
      sourceRouteSlot: alternative.sourceRouteSlot,
      operation: alternative.operation,
      sourceSignature: alternative.sourceSignature,
    };
    return { ...alternative.route, slot };
  });
  const covered = new Set(routes.flatMap((route) => route.candidateSlots));
  return {
    portfolio: {
      ...initial,
      routes,
      uncoveredProtectedCandidateSlots: initial.protectedCandidateSlots.filter((slot) => !covered.has(slot)),
    },
    provenance,
    diagnostics: { operationCounts, discarded },
  };
}

export function selectEditorialRouteWinnerV5(
  portfolio: EditorialRoutePortfolioV5,
  finalJury: RouteJuryV5,
  matrix: WalkingMatrixSnapshotV4
): EditorialWinnerV5 | null {
  const shortlisted = new Set(finalJury.shortlist);
  for (const routeSlot of finalJury.ranking) {
    if (!shortlisted.has(routeSlot) || finalJury.assessments[routeSlot]?.verdict === 'reject') continue;
    const route = portfolio.routes.find((candidate) => candidate.slot === routeSlot);
    const plan = finalJury.routePlans[routeSlot];
    if (!route || !plan
      || plan.stops.map((stop) => stop.candidateSlot).join('>') !== route.candidateSlots.join('>')) continue;
    const validated = evaluateEditorialRouteOrderV5(
      route.slot, route.candidateSlots, portfolio.candidates, matrix,
      portfolio.searchedDuration, portfolio.requestedDuration, portfolio.protectedCandidateSlots
    );
    if (validated) return { route: validated, plan };
  }
  return null;
}
