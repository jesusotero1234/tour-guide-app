import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { AutonomousNarrativeArtifactV5 } from './AutonomousNarrativeV5';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import { narrativeTourTextFingerprintV5 } from './NarrativeProseV5';

export const NARRATIVE_DIAGNOSTIC_SCHEMA_VERSION_V5 =
  'narrative-diagnostic-bundle-v5' as const;

export type NarrativeDiagnosticModeV5 = 'preflight' | 'qualification';

export interface NarrativeDiagnosticBundleV5 {
  schemaVersion: typeof NARRATIVE_DIAGNOSTIC_SCHEMA_VERSION_V5;
  mode: NarrativeDiagnosticModeV5;
  createdAt: string;
  candidates: Array<{
    variant: string;
    status: AutonomousNarrativeArtifactV5['status'];
    failure: AutonomousNarrativeArtifactV5['failure'];
    text: AutonomousNarrativeArtifactV5['text'];
    grounding: ReturnType<typeof diagnosticCall>;
    proseAttempts: ReturnType<typeof diagnosticCall>[];
    finalCritiques: ReturnType<typeof diagnosticCall>[];
    fingerprints: {
      evidence: string;
      plan: string;
      text: string | null;
      responses: Array<string | null>;
    };
  }>;
  fingerprint: string;
}

function redact(value: string | null): string | null {
  if (value === null) return null;
  return value
    .replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, '[REDACTED]')
    .replace(/\b(api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/giu, '$1=[REDACTED]');
}

function diagnosticCall(result: EditorialCallResultV6<unknown>) {
  return {
    callId: result.callId,
    status: result.status,
    model: result.model,
    promptFingerprint: result.promptFingerprint,
    responseFingerprint: result.responseFingerprint,
    input: result.input,
    rawOutput: redact(result.rawOutput),
    value: result.value,
    attempts: result.attempts.map((attempt) => ({
      ...attempt,
      rawOutput: redact(attempt.rawOutput),
      error: redact(attempt.error),
    })),
  };
}

export function buildNarrativeDiagnosticBundleV5(
  mode: NarrativeDiagnosticModeV5,
  artifacts: AutonomousNarrativeArtifactV5[],
  createdAt = new Date().toISOString()
): NarrativeDiagnosticBundleV5 {
  const candidates = artifacts.map((artifact) => {
    const calls: EditorialCallResultV6<unknown>[] = [
      artifact.grounding,
      ...artifact.proseAttempts,
      ...artifact.finalCritiques,
    ];
    return {
      variant: artifact.variant,
      status: artifact.status,
      failure: artifact.failure,
      text: artifact.text,
      grounding: diagnosticCall(artifact.grounding),
      proseAttempts: artifact.proseAttempts.map(diagnosticCall),
      finalCritiques: artifact.finalCritiques.map(diagnosticCall),
      fingerprints: {
        evidence: artifact.evidenceFingerprint,
        plan: artifact.planFingerprint,
        text: artifact.text ? narrativeTourTextFingerprintV5(artifact.text) : null,
        responses: calls.map((call) => call.responseFingerprint),
      },
    };
  });
  const content = {
    schemaVersion: NARRATIVE_DIAGNOSTIC_SCHEMA_VERSION_V5,
    mode,
    createdAt,
    candidates,
  };
  return { ...content, fingerprint: editorialFingerprintV7(content) };
}

export function writeNarrativeDiagnosticBundleV5(
  path: string,
  bundle: NarrativeDiagnosticBundleV5
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
