export type NarrativeRunReasonV8 =
  | 'core_disagreement'
  | 'required_identity_missing'
  | 'too_many_self_transfers'
  | 'guided_duration_infeasible'
  | 'no_results'
  | 'capture_blocked'
  | 'parse_empty'
  | 'authority_insufficient'
  | 'evidence_review_required'
  | 'curator_contract_failed';

export type NarrativeRunPhaseV8 =
  | 'discovery'
  | 'map'
  | 'capture'
  | 'curation'
  | 'core_selection'
  | 'geometry';

export interface NarrativePhaseLogEntryV8 {
  phase: NarrativeRunPhaseV8;
  provider: string;
  language: string;
  country: string;
  resultCount: number;
  mappedUrls: string[];
  finalHttpStatus: number | null;
  authorityTier: string;
  cacheHit: boolean;
  evidenceGaps: string[];
  substitutions: number;
  editorialCoreCoverage: number;
  freeTransferCount: number;
  reason: NarrativeRunReasonV8 | null;
  message?: string;
}

export class NarrativeRunDiagnosticsV8 {
  phases: NarrativePhaseLogEntryV8[] = [];
  reasons: NarrativeRunReasonV8[] = [];

  appendPhase(entry: NarrativePhaseLogEntryV8): void {
    this.phases.push(entry);
    if (entry.reason !== null) {
      this.reasons.push(entry.reason);
    }
  }
}

export interface ClassifyRunBlockInputV8 {
  missingRequiredIds: string[];
  geometryStatus: 'walkable' | 'route_review_required' | null;
  geometryReason: string | null;
  noResults: boolean;
  captureBlocked: boolean;
  parseEmpty: boolean;
  authorityInsufficient: boolean;
  evidenceReviewRequired: boolean;
  curatorContractFailed: boolean;
  coreDisagreement: boolean;
}

const GEOMETRY_REASONS_V8 = new Set([
  'too_many_self_transfers',
  'guided_duration_infeasible',
]);

/**
 * Returns ONLY the highest-priority applicable reason: a blocked run is
 * explained by one principal reason. Required identities and geometry
 * verdicts outrank capture and parse failures.
 */
export function classifyRunBlockV8(input: ClassifyRunBlockInputV8): NarrativeRunReasonV8[] {
  if (input.geometryReason !== null && !GEOMETRY_REASONS_V8.has(input.geometryReason)) {
    throw new Error(`classifyRunBlockV8 received an unknown geometry reason: ${input.geometryReason}`);
  }
  if (input.geometryStatus === 'route_review_required' && input.geometryReason === null) {
    throw new Error('classifyRunBlockV8 requires a geometry reason when route review is required');
  }
  if (input.geometryStatus !== 'route_review_required' && input.geometryReason !== null) {
    throw new Error('classifyRunBlockV8 received a geometry reason for a non-review route status');
  }
  if (input.coreDisagreement) return ['core_disagreement'];
  if (input.missingRequiredIds.length > 0) return ['required_identity_missing'];
  if (input.geometryReason === 'too_many_self_transfers') return ['too_many_self_transfers'];
  if (input.geometryReason === 'guided_duration_infeasible') return ['guided_duration_infeasible'];
  if (input.captureBlocked) return ['capture_blocked'];
  if (input.curatorContractFailed) return ['curator_contract_failed'];
  if (input.parseEmpty) return ['parse_empty'];
  if (input.authorityInsufficient) return ['authority_insufficient'];
  if (input.evidenceReviewRequired) return ['evidence_review_required'];
  if (input.noResults) return ['no_results'];
  return [];
}
