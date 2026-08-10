import {
  AutonomousNarrativeArtifactV3,
  AutonomousNarrativeGenerationRecordV3,
} from './AutonomousNarrativeV3';

export const NARRATIVE_DIAGNOSTIC_SCHEMA_VERSION_V3 =
  'narrative-diagnostic-bundle-v3' as const;

export function redactNarrativeDiagnosticTextV3(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, '[REDACTED]')
    .replace(/\b(api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/giu, '$1=[REDACTED]');
}

function record(stage: string, value: AutonomousNarrativeGenerationRecordV3) {
  return {
    stage,
    status: value.status,
    model: value.model,
    promptFingerprint: value.promptFingerprint,
    responseFingerprint: value.responseFingerprint,
    attempts: value.attempts.map((attempt) => ({
      attempt: attempt.attempt,
      status: attempt.status,
      latencyMs: attempt.latencyMs,
      error: attempt.error ? redactNarrativeDiagnosticTextV3(attempt.error) : null,
    })),
  };
}

export function buildNarrativeDiagnosticBundleV3(artifact: AutonomousNarrativeArtifactV3) {
  const stages = [
    ...artifact.planAttempts.flatMap((attempt) => [
      record(`plan_generation:${attempt.contentAttempt}`, attempt.generation),
      ...(attempt.grounding
        ? [record(`grounding_critique:${attempt.contentAttempt}`, attempt.grounding)]
        : []),
    ]),
    ...artifact.proseAttempts.flatMap((attempt) => [
      record(`prose_generation:${attempt.contentAttempt}`, attempt.generation),
      ...(attempt.critique
        ? [record(`final_critique:${attempt.contentAttempt}`, attempt.critique)]
        : []),
    ]),
  ];
  return {
    schemaVersion: NARRATIVE_DIAGNOSTIC_SCHEMA_VERSION_V3,
    caseId: artifact.caseId,
    outcome: artifact.outcome.type,
    failure: artifact.outcome.type === 'rejected' ? {
      ...artifact.outcome.failure,
      message: redactNarrativeDiagnosticTextV3(artifact.outcome.failure.message),
    } : null,
    writerModel: artifact.writerModel,
    criticModel: artifact.criticModel ? {
      name: artifact.criticModel.name,
      digest: artifact.criticModel.digest,
      fullyGpu: artifact.criticModel.fullyGpu,
    } : null,
    stages,
    fingerprints: artifact.fingerprints,
  };
}
