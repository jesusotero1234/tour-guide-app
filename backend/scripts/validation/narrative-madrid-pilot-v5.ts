import 'dotenv/config';
import { resolve } from 'path';
import { runAutonomousNarrativeV5 } from '../../src/services/poi/AutonomousNarrativeV5';
import { buildNarrativeClaimPlanV4 } from '../../src/services/poi/NarrativeClaimPlanV4';
import {
  buildNarrativeCriticRequestV4,
  buildNarrativeGroundingCriticRequestV4,
} from '../../src/services/poi/NarrativeCriticV4';
import {
  buildNarrativeDiagnosticBundleV5,
  writeNarrativeDiagnosticBundleV5,
} from '../../src/services/poi/NarrativeDiagnosticsV5';
import { loadMadridNarrativeEvidenceCaseV4 } from '../../src/services/poi/NarrativeMadridEvidenceV4';
import {
  prepareNarrativeCriticV4,
  requestNarrativeFinalCritiqueV4,
  requestNarrativeGroundingCritiqueV4,
} from '../../src/services/poi/NarrativePilotGemmaV4';
import {
  NarrativeVariantV5,
  generateNarrativeProseV5,
} from '../../src/services/poi/NarrativePilotWriterV5';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function preflightVariant(): NarrativeVariantV5 {
  const variant = option('--variant') ?? 'on_site';
  if (variant !== 'on_site' && variant !== 'curiosity' && variant !== 'documentary') {
    throw new Error('--variant must be on_site, curiosity, or documentary');
  }
  return variant;
}

function diagnosticPath(mode: 'preflight' | 'qualification'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(
    process.cwd(),
    `fixtures/narrative-madrid-v5/diagnostics/${stamp}-${mode}.json`
  );
}

async function main(): Promise<void> {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  if (!hasFlag('--generate')) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 'narrative-madrid-pilot-input-check-v5',
      status: 'validated',
      preflight: 'not_run',
      caseId: evidence.caseId,
      scenes: evidence.route.sceneIds,
      writerPacketScenes: plan.scenes.length,
    }, null, 2)}\n`);
    return;
  }
  if (!hasFlag('--allow-external')) throw new Error('--generate requires --allow-external');
  if (!hasFlag('--preflight')) {
    throw new Error('run --preflight before the official three-variant V5 qualification');
  }
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for Madrid V5 generation');
  const ollamaHost = process.env.OLLAMA_HOST?.trim();
  if (!ollamaHost) throw new Error('OLLAMA_HOST is required for the Gemma critic');

  const lifecycle = await prepareNarrativeCriticV4({ ollamaHost });
  const artifact = await runAutonomousNarrativeV5({
    evidence,
    variant: preflightVariant(),
  }, {
    critiqueGrounding: (request: ReturnType<typeof buildNarrativeGroundingCriticRequestV4>) => (
      requestNarrativeGroundingCritiqueV4(request, lifecycle)
    ),
    generateProse: (candidateEvidence, candidatePlan, variant, repair) => (
      generateNarrativeProseV5(candidateEvidence, candidatePlan, variant, { apiKey }, repair)
    ),
    critiqueFinal: (request: ReturnType<typeof buildNarrativeCriticRequestV4>) => (
      requestNarrativeFinalCritiqueV4(request, lifecycle)
    ),
  });
  const bundle = buildNarrativeDiagnosticBundleV5('preflight', [artifact]);
  const bundlePath = diagnosticPath('preflight');
  writeNarrativeDiagnosticBundleV5(bundlePath, bundle);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'narrative-madrid-preflight-result-v5',
    status: artifact.status,
    variant: artifact.variant,
    failure: artifact.failure,
    proseAttempts: artifact.proseAttempts.map((attempt, index) => ({
      contentAttempt: index + 1,
      status: attempt.status,
      errors: attempt.attempts
        .filter((item) => item.error)
        .map((item) => item.error),
      responseFingerprint: attempt.responseFingerprint,
    })),
    finalCritiques: artifact.finalCritiques.map((critique) => ({
      status: critique.status,
      errors: critique.attempts.filter((item) => item.error).map((item) => item.error),
      responseFingerprint: critique.responseFingerprint,
    })),
    text: artifact.text ? {
      totalWordCount: artifact.text.totalWordCount,
      durationMinutes: artifact.text.durationMinutes,
      scenes: artifact.text.scripts.map((scene) => ({
        sceneId: scene.sceneId,
        bodyWordCount: scene.bodyWordCount,
      })),
    } : null,
    diagnosticBundle: bundlePath,
    diagnosticFingerprint: bundle.fingerprint,
  }, null, 2)}\n`);
  if (artifact.status !== 'machine_approved') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
