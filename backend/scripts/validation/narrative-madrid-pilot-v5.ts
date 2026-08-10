import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  AutonomousNarrativeServicesV5,
  runAutonomousNarrativeV5,
} from '../../src/services/poi/AutonomousNarrativeV5';
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
  NarrativePilotFreezePathsV5,
  freezeNarrativeMadridPilotV5,
  readNarrativePilotFreezeDocumentsV5,
  replayNarrativePilotFreezeDocumentsV5,
} from '../../src/services/poi/NarrativeMadridPilotFreezeV5';
import {
  runNarrativeMadridPilotQualificationV5,
} from '../../src/services/poi/NarrativeMadridPilotQualificationV5';
import {
  prepareNarrativeCriticV4,
  requestNarrativeGroundingCritiqueV4,
} from '../../src/services/poi/NarrativePilotGemmaV4';
import { requestNarrativeFinalCritiqueV5 } from '../../src/services/poi/NarrativePilotGemmaV5';
import {
  NarrativeVariantV5,
  generateNarrativeProseV5,
} from '../../src/services/poi/NarrativePilotWriterV5';

const PATHS: NarrativePilotFreezePathsV5 = {
  qualificationPath: resolve(process.cwd(), 'fixtures/narrative-madrid-v5/qualification.json'),
  artifactPath: resolve(process.cwd(), 'fixtures/narrative-madrid-v5/selected-artifact.json'),
  previewPath: resolve(
    process.cwd(),
    '../frontend/src/fixtures/narrative-madrid-v5-preview.json'
  ),
  manifestPath: resolve(process.cwd(), 'fixtures/narrative-madrid-v5/pilot-manifest.json'),
};

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
    const existing = Object.values(PATHS).filter(existsSync);
    if (existing.length > 0 && existing.length !== Object.keys(PATHS).length) {
      throw new Error('partial Madrid V5 freeze detected; all four linked outputs are required');
    }
    if (existing.length === Object.keys(PATHS).length) {
      const documents = readNarrativePilotFreezeDocumentsV5(PATHS);
      replayNarrativePilotFreezeDocumentsV5(documents, evidence);
      process.stdout.write(`${JSON.stringify({
        schemaVersion: 'narrative-madrid-pilot-offline-replay-v5',
        status: documents.qualification.payload.status,
        frozen: true,
        publicTourStatus: documents.artifact.payload.publicTourStatus,
        manifestState: documents.manifest.payload.state,
        scenes: documents.preview.payload.tour.places.map((place) => place.id),
      }, null, 2)}\n`);
      return;
    }
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
  const preflight = hasFlag('--preflight');
  const official = hasFlag('--official');
  if (preflight === official) {
    throw new Error('--generate requires exactly one of --preflight or --official');
  }
  const freeze = hasFlag('--freeze-pilot');
  if (freeze && !official) {
    throw new Error('--freeze-pilot requires --generate --allow-external --official');
  }
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for Madrid V5 generation');
  const ollamaHost = process.env.OLLAMA_HOST?.trim();
  if (!ollamaHost) throw new Error('OLLAMA_HOST is required for the Gemma critic');

  const lifecycle = await prepareNarrativeCriticV4({ ollamaHost });
  const autonomousServices: AutonomousNarrativeServicesV5 = {
    critiqueGrounding: (request: ReturnType<typeof buildNarrativeGroundingCriticRequestV4>) => (
      requestNarrativeGroundingCritiqueV4(request, lifecycle)
    ),
    generateProse: (candidateEvidence, candidatePlan, variant, repair) => (
      generateNarrativeProseV5(candidateEvidence, candidatePlan, variant, { apiKey }, repair)
    ),
    critiqueFinal: (request: ReturnType<typeof buildNarrativeCriticRequestV4>) => (
      requestNarrativeFinalCritiqueV5(request, lifecycle)
    ),
  };
  if (preflight) {
    const artifact = await runAutonomousNarrativeV5({
      evidence,
      variant: preflightVariant(),
    }, autonomousServices);
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
        errors: attempt.attempts.filter((item) => item.error).map((item) => item.error),
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
    return;
  }

  const result = await runNarrativeMadridPilotQualificationV5(evidence, {
    criticModel: lifecycle.model,
    runCandidate: (variant) => runAutonomousNarrativeV5(
      { evidence, variant },
      autonomousServices
    ),
    critique: (text, candidatePlan) => requestNarrativeFinalCritiqueV5(
      buildNarrativeCriticRequestV4(evidence, candidatePlan, text),
      lifecycle
    ),
  });
  const bundle = buildNarrativeDiagnosticBundleV5(
    'qualification', result.candidates, undefined, result
  );
  const bundlePath = diagnosticPath('qualification');
  writeNarrativeDiagnosticBundleV5(bundlePath, bundle);
  if (freeze && result.status === 'passed') {
    freezeNarrativeMadridPilotV5(result, evidence, PATHS);
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: result.schemaVersion,
    status: result.status,
    frozen: freeze && result.status === 'passed',
    selectedVariant: result.selectedVariant,
    approvedCandidates: `${result.summary.approvedCandidates}/${result.summary.totalCandidates}`,
    cleanCritiquePassed: result.summary.cleanCritiquePassed,
    factualMutationDetections:
      `${result.summary.factualMutationsDetected}/${result.summary.totalMutations}`,
    allCritiquesBelow180Seconds: result.summary.allCritiquesBelow180Seconds,
    criticFullyGpu: result.summary.criticFullyGpu,
    failureReasons: result.failureReasons,
    candidateOutcomes: result.candidates.map((candidate) => ({
      variant: candidate.variant,
      status: candidate.status,
      failure: candidate.failure,
      writerErrors: candidate.proseAttempts.flatMap((attempt) => (
        attempt.attempts.filter((item) => item.error).map((item) => item.error)
      )),
    })),
    cleanCritique: result.cleanCritique ? {
      status: result.cleanCritique.status,
      rejectionReasons: result.cleanCritique.rejectionReasons,
      diagnostic: result.cleanCritique.diagnostic,
    } : null,
    mutations: result.mutations.map((mutation) => ({
      mutation: mutation.mutation,
      status: mutation.status,
      factualRejection: mutation.factualRejection,
      rejectionReasons: mutation.rejectionReasons,
      diagnostic: mutation.diagnostic,
    })),
    diagnosticBundle: bundlePath,
    diagnosticFingerprint: bundle.fingerprint,
    fingerprints: result.fingerprints,
  }, null, 2)}\n`);
  if (result.status !== 'passed') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
