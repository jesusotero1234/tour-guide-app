import {
  buildRouteJuryRequestV5,
  requestRouteJuryV5,
  RouteJuryRequestV5,
  RouteJuryV5,
  validateRouteJuryV5,
} from './EditorialRouteJuryV5';
import { EditorialRoutePortfolioV5 } from './EditorialRoutePortfolioV5';
import {
  buildEditorialRepairPortfolioV5,
  EditorialRepairResultV5,
  EditorialWinnerV5,
  selectEditorialRouteWinnerV5,
} from './EditorialRouteRepairV5';
import {
  createEditorialCallBudgetV5,
  EditorialCallBudgetV5,
  EditorialCallResultV5,
  EditorialProviderV5,
  EditorialRequestOptionsV5,
} from './EditorialStructuredLlmV5';
import { WalkingMatrixSnapshotV4 } from './EditorialWalkingMatrixV4';

export const EDITORIAL_SELECTION_SNAPSHOT_SCHEMA_VERSION_V5 = 'editorial-selection-snapshot-v5' as const;

export interface EditorialSelectionContextV5 {
  city: string;
  theme: string;
  language: string;
  requestedDuration: number;
}

export interface EditorialSelectionSnapshotV5 {
  schemaVersion: typeof EDITORIAL_SELECTION_SNAPSHOT_SCHEMA_VERSION_V5;
  createdAt: string;
  provider: EditorialProviderV5;
  matrixCandidateFingerprint: string;
  callBudget: EditorialCallBudgetV5;
  initialCall: EditorialCallResultV5<RouteJuryV5> | null;
  repair: EditorialRepairResultV5 | null;
  finalCall: EditorialCallResultV5<RouteJuryV5> | null;
}

export interface EditorialSelectionWorkflowResultV5 {
  status: 'selected' | 'curator_failed' | 'no_editorial_route';
  failureStage: 'portfolio' | 'initial_jury' | 'repair' | 'final_jury' | 'final_validation' | null;
  initialCall: EditorialCallResultV5<RouteJuryV5> | null;
  repair: EditorialRepairResultV5 | null;
  finalCall: EditorialCallResultV5<RouteJuryV5> | null;
  winner: EditorialWinnerV5 | null;
  snapshot: EditorialSelectionSnapshotV5;
  reason: string | null;
}

function snapshot(
  provider: EditorialProviderV5,
  matrix: WalkingMatrixSnapshotV4,
  budget: EditorialCallBudgetV5,
  initialCall: EditorialCallResultV5<RouteJuryV5> | null,
  repair: EditorialRepairResultV5 | null,
  finalCall: EditorialCallResultV5<RouteJuryV5> | null,
  createdAt = new Date().toISOString()
): EditorialSelectionSnapshotV5 {
  return {
    schemaVersion: EDITORIAL_SELECTION_SNAPSHOT_SCHEMA_VERSION_V5,
    createdAt,
    provider,
    matrixCandidateFingerprint: matrix.candidateFingerprint,
    callBudget: {
      normalPhases: [...budget.normalPhases],
      retryUsed: budget.retryUsed,
      actualCallCount: budget.actualCallCount,
    },
    initialCall,
    repair,
    finalCall,
  };
}

function result(
  status: EditorialSelectionWorkflowResultV5['status'],
  failureStage: EditorialSelectionWorkflowResultV5['failureStage'],
  provider: EditorialProviderV5,
  matrix: WalkingMatrixSnapshotV4,
  budget: EditorialCallBudgetV5,
  initialCall: EditorialCallResultV5<RouteJuryV5> | null,
  repair: EditorialRepairResultV5 | null,
  finalCall: EditorialCallResultV5<RouteJuryV5> | null,
  winner: EditorialWinnerV5 | null,
  reason: string | null,
  createdAt?: string
): EditorialSelectionWorkflowResultV5 {
  return {
    status, failureStage, initialCall, repair, finalCall, winner, reason,
    snapshot: snapshot(provider, matrix, budget, initialCall, repair, finalCall, createdAt),
  };
}

function juryContext(
  phase: 'initial' | 'final',
  context: EditorialSelectionContextV5
): Pick<RouteJuryRequestV5, 'phase' | 'city' | 'theme' | 'language' | 'requestedDuration'> {
  return { phase, ...context };
}

export async function runEditorialSelectionV5(
  portfolio: EditorialRoutePortfolioV5,
  matrix: WalkingMatrixSnapshotV4,
  context: EditorialSelectionContextV5,
  provider: EditorialProviderV5,
  options: EditorialRequestOptionsV5 = {}
): Promise<EditorialSelectionWorkflowResultV5> {
  if (context.requestedDuration !== portfolio.requestedDuration) {
    throw new Error('Editorial selection context duration does not match the portfolio');
  }
  const budget = createEditorialCallBudgetV5();
  if (portfolio.routes.length < 3) {
    return result(
      'no_editorial_route', 'portfolio', provider, matrix, budget,
      null, null, null, null, 'The deterministic portfolio contains fewer than three routes.'
    );
  }
  const initialRequest = buildRouteJuryRequestV5(portfolio, juryContext('initial', context));
  const initialCall = await requestRouteJuryV5(initialRequest, provider, budget, options);
  if (!initialCall.value) {
    return result(
      'curator_failed', 'initial_jury', provider, matrix, budget,
      initialCall, null, null, null,
      initialCall.attempts.at(-1)?.error ?? initialCall.status
    );
  }
  let repair: EditorialRepairResultV5;
  try {
    repair = buildEditorialRepairPortfolioV5(
      portfolio, initialCall.value, matrix, portfolio.searchedDuration
    );
  } catch (error) {
    return result(
      'no_editorial_route', 'repair', provider, matrix, budget,
      initialCall, null, null, null, error instanceof Error ? error.message : String(error)
    );
  }
  const finalRequest = buildRouteJuryRequestV5(repair.portfolio, juryContext('final', context));
  const finalCall = await requestRouteJuryV5(finalRequest, provider, budget, options);
  if (!finalCall.value) {
    return result(
      'curator_failed', 'final_jury', provider, matrix, budget,
      initialCall, repair, finalCall, null,
      finalCall.attempts.at(-1)?.error ?? finalCall.status
    );
  }
  const winner = selectEditorialRouteWinnerV5(repair.portfolio, finalCall.value, matrix);
  if (!winner) {
    return result(
      'no_editorial_route', 'final_validation', provider, matrix, budget,
      initialCall, repair, finalCall, null,
      'No non-rejected shortlisted route passed deterministic revalidation.'
    );
  }
  return result(
    'selected', null, provider, matrix, budget,
    initialCall, repair, finalCall, winner, null
  );
}

function replayValidCall(
  call: EditorialCallResultV5<RouteJuryV5>,
  request: RouteJuryRequestV5
): EditorialCallResultV5<RouteJuryV5> {
  if (JSON.stringify(call.input) !== JSON.stringify(request)) {
    throw new Error(`Snapshot ${request.phase} jury input changed`);
  }
  const attempt = [...call.attempts].reverse().find((item) => (
    item.status === 'valid' && item.rawOutput
  ));
  if (!attempt?.rawOutput) throw new Error(`Snapshot ${request.phase} jury has no valid raw output`);
  return { ...call, value: validateRouteJuryV5(JSON.parse(attempt.rawOutput), request) };
}

function routeSignatures(portfolio: EditorialRoutePortfolioV5): string[] {
  return portfolio.routes.map((route) => `${route.slot}:${route.candidateSlots.join('>')}`);
}

export function replayEditorialSelectionV5(
  portfolio: EditorialRoutePortfolioV5,
  matrix: WalkingMatrixSnapshotV4,
  context: EditorialSelectionContextV5,
  saved: EditorialSelectionSnapshotV5
): EditorialSelectionWorkflowResultV5 {
  if (saved.schemaVersion !== EDITORIAL_SELECTION_SNAPSHOT_SCHEMA_VERSION_V5) {
    throw new Error('Invalid editorial v5 selection snapshot schemaVersion');
  }
  if (saved.matrixCandidateFingerprint !== matrix.candidateFingerprint) {
    throw new Error('Editorial v5 snapshot walking matrix changed');
  }
  if (!saved.initialCall || !saved.repair || !saved.finalCall) {
    throw new Error('Editorial v5 replay requires a complete two-jury snapshot');
  }
  const initialRequest = buildRouteJuryRequestV5(portfolio, juryContext('initial', context));
  const initialCall = replayValidCall(saved.initialCall, initialRequest);
  const repair = buildEditorialRepairPortfolioV5(
    portfolio, initialCall.value as RouteJuryV5, matrix, portfolio.searchedDuration
  );
  if (JSON.stringify(routeSignatures(repair.portfolio))
    !== JSON.stringify(routeSignatures(saved.repair.portfolio))
    || JSON.stringify(repair.provenance) !== JSON.stringify(saved.repair.provenance)) {
    throw new Error('Editorial v5 deterministic repair changed');
  }
  const finalRequest = buildRouteJuryRequestV5(repair.portfolio, juryContext('final', context));
  const finalCall = replayValidCall(saved.finalCall, finalRequest);
  const winner = selectEditorialRouteWinnerV5(
    repair.portfolio, finalCall.value as RouteJuryV5, matrix
  );
  if (!winner) {
    return result(
      'no_editorial_route', 'final_validation', saved.provider, matrix, saved.callBudget,
      initialCall, repair, finalCall, null,
      'No non-rejected shortlisted route passed deterministic revalidation.', saved.createdAt
    );
  }
  return result(
    'selected', null, saved.provider, matrix, saved.callBudget,
    initialCall, repair, finalCall, winner, null, saved.createdAt
  );
}
