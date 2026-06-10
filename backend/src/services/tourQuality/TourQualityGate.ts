// ═══════════════════════════════════════════════════════════════════
// Fase 6 — Tour Quality Gate: narración no debe llegar a DB como
// producto listo si es fallback genérico.
// ═══════════════════════════════════════════════════════════════════

export type NarrationQualityStatus = 'ready' | 'review_required' | 'degraded' | 'blocked';

export interface SectionQuality {
  status: 'generated' | 'fallback' | 'degraded';
  reason?: string;
  attempts: number;
}

export interface NarrationQualityMetadata {
  status: NarrationQualityStatus;
  model: string;
  modelVersion: string;
  promptVersion: string;
  validatorVersion: string;
  sections: Record<string, SectionQuality>;
  fallbackRate: number; // 0.0 – 1.0
  contradictedClaims: number;
  criticalFails: number;
}

/** Quality thresholds */
const QUALITY_THRESHOLDS = {
  /** Maximum fallback rate for a tour to be considered "ready" */
  MAX_FALLBACK_RATE_READY: 0.10, // 10%
  /** Fallback rate that requires human review */
  REVIEW_REQUIRED_THRESHOLD: 0.10, // >10%
  /** DEGRADED: >25% weighted fallback rate — not commercial quality */
  DEGRADED_THRESHOLD: 0.25, // >25%
};

export interface QualityEvaluationInput {
  /** Total number of sections across all stops */
  totalSections: number;
  /** Number of sections that fell back */
  fallbackSections: number;
  /** Per-section details */
  sectionDetails: Array<{
    stopName: string;
    sectionName: string;
    status: 'generated' | 'fallback' | 'degraded';
    reason?: string;
    attempts: number;
  }>;
  /** Claim check results from the LLM pod */
  claimCheck?: {
    contradictedCount: number;
    criticalFailCount: number;
    unverifiedCount: number;
    totalExtracted: number;
  };
  model: string;
  modelVersion: string;
}

export interface QualityEvaluationResult {
  status: NarrationQualityStatus;
  metadata: NarrationQualityMetadata;
  shouldPublish: boolean;
  shouldHide: boolean;
  shouldReEvaluate: boolean;
}

/** Evaluates tour quality and returns a verdict on whether it's ready for publishing. */
export function evaluateTourQuality(input: QualityEvaluationInput): QualityEvaluationResult {
  const fallbackRate = input.totalSections > 0
    ? input.fallbackSections / input.totalSections
    : 0;

  const contradictedClaims = input.claimCheck?.contradictedCount || 0;
  const criticalFails = input.claimCheck?.criticalFailCount || 0;

  // Build section quality map
  const sections: Record<string, SectionQuality> = {};
  for (const detail of input.sectionDetails) {
    const key = `${detail.stopName}:${detail.sectionName}`;
    sections[key] = {
      status: detail.status,
      reason: detail.reason,
      attempts: detail.attempts,
    };
  }

  // Determine status — contradiction takes priority over fallback rate
  let status: NarrationQualityStatus;
  if (criticalFails > 0 || contradictedClaims > 0) {
    status = 'blocked'; // Contradictions in critical claims = product defect
  } else if (fallbackRate > QUALITY_THRESHOLDS.DEGRADED_THRESHOLD) {
    status = 'degraded'; // >40% fallback — not commercial quality
  } else if (fallbackRate > QUALITY_THRESHOLDS.REVIEW_REQUIRED_THRESHOLD) {
    status = 'review_required'; // 10-40% fallback — needs human look
  } else {
    status = 'ready'; // 0-10% fallback, no critical fails
  }

  const metadata: NarrationQualityMetadata = {
    status,
    model: input.model,
    modelVersion: input.modelVersion,
    promptVersion: 'narrative-brief-v1',
    validatorVersion: 'evidence-aware-v1',
    sections,
    fallbackRate: Math.round(fallbackRate * 100) / 100,
    contradictedClaims,
    criticalFails,
  };

  return {
    status,
    metadata,
    shouldPublish: status === 'ready',
    shouldHide: status === 'degraded' || status === 'blocked',
    shouldReEvaluate: status === 'review_required',
  };
}

/** Checks whether a finalized tour can be safely published to users. */
export function canPublishTour(status: NarrationQualityStatus): boolean {
  return status === 'ready';
}

/** Checks whether a tour should be hidden from UI. */
export function shouldHideTour(status: NarrationQualityStatus): boolean {
  return status === 'degraded' || status === 'blocked';
}

export { QUALITY_THRESHOLDS };
