import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { runAutonomousNarrativeV4 } from '../../src/services/poi/AutonomousNarrativeV4';
import {
  buildNarrativeCriticRequestV4,
  buildNarrativeGroundingCriticRequestV4,
} from '../../src/services/poi/NarrativeCriticV4';
import {
  buildNarrativeClaimPlanV4,
  narrativeClaimPlanFingerprintV4,
} from '../../src/services/poi/NarrativeClaimPlanV4';
import { loadMadridNarrativeEvidenceCaseV4 } from '../../src/services/poi/NarrativeMadridEvidenceV4';
import {
  freezeNarrativeMadridPilotV4,
  NarrativePilotFreezePathsV4,
  readNarrativePilotFreezeDocumentsV4,
  replayNarrativePilotFreezeDocumentsV4,
} from '../../src/services/poi/NarrativeMadridPilotFreezeV4';
import {
  NarrativeMadridPilotQualificationV4,
  runNarrativeMadridPilotQualificationV4,
} from '../../src/services/poi/NarrativeMadridPilotQualificationV4';
import {
  prepareNarrativeCriticV4,
  requestNarrativeFinalCritiqueV4,
  requestNarrativeGroundingCritiqueV4,
} from '../../src/services/poi/NarrativePilotGemmaV4';
import { generateNarrativeProseV4 } from '../../src/services/poi/NarrativePilotWriterV4';

const PATHS: NarrativePilotFreezePathsV4 = {
  qualificationPath: resolve(process.cwd(), 'fixtures/narrative-madrid-v4/qualification.json'),
  artifactPath: resolve(process.cwd(), 'fixtures/narrative-madrid-v4/selected-artifact.json'),
  previewPath: resolve(
    process.cwd(),
    '../frontend/src/fixtures/narrative-madrid-v4-preview.json'
  ),
  manifestPath: resolve(process.cwd(), 'fixtures/narrative-madrid-v4/pilot-manifest.json'),
};

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function printSummary(
  result: NarrativeMadridPilotQualificationV4,
  frozen: boolean
): void {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: result.schemaVersion,
    status: result.status,
    frozen,
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
    })),
    mutations: result.mutations.map((mutation) => ({
      mutation: mutation.mutation,
      status: mutation.status,
      factualRejection: mutation.factualRejection,
      rejectionReasons: mutation.rejectionReasons,
      diagnostic: mutation.diagnostic,
    })),
    fingerprints: result.fingerprints,
  }, null, 2)}\n`);
}

async function main(): Promise<void> {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  const generate = hasFlag('--generate');
  const freeze = hasFlag('--freeze-pilot');
  if (freeze && (!generate || !hasFlag('--allow-external'))) {
    throw new Error('--freeze-pilot requires --generate --allow-external in the same execution');
  }
  if (!generate) {
    const existing = Object.values(PATHS).filter(existsSync);
    if (existing.length > 0 && existing.length !== Object.keys(PATHS).length) {
      throw new Error('partial Madrid V4 freeze detected; all four linked outputs are required');
    }
    if (existing.length === Object.keys(PATHS).length) {
      const documents = readNarrativePilotFreezeDocumentsV4(PATHS);
      replayNarrativePilotFreezeDocumentsV4(documents, evidence);
      process.stdout.write(`${JSON.stringify({
        schemaVersion: 'narrative-madrid-pilot-offline-replay-v4',
        status: documents.qualification.payload.status,
        frozen: true,
        qualificationFingerprint: documents.qualification.freezeLinks.qualification,
        scenes: evidence.route.sceneIds,
      }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 'narrative-madrid-pilot-input-check-v4',
      status: 'validated',
      qualification: 'not_run',
      frozen: false,
      caseId: evidence.caseId,
      scenes: evidence.route.sceneIds,
      evidenceFingerprint: evidence.fingerprint,
      planFingerprint: narrativeClaimPlanFingerprintV4(plan),
    }, null, 2)}\n`);
    return;
  }
  if (!hasFlag('--allow-external')) {
    throw new Error('--generate requires --allow-external');
  }
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for Madrid V4 generation');
  const ollamaHost = process.env.OLLAMA_HOST?.trim();
  if (!ollamaHost) throw new Error('OLLAMA_HOST is required for the Gemma critic');

  const lifecycle = await prepareNarrativeCriticV4({ ollamaHost });
  const autonomousServices = {
    critiqueGrounding: (request: ReturnType<typeof buildNarrativeGroundingCriticRequestV4>) => (
      requestNarrativeGroundingCritiqueV4(request, lifecycle)
    ),
    generateProse: (
      candidateEvidence: typeof evidence,
      candidatePlan: typeof plan,
      variant: Parameters<typeof generateNarrativeProseV4>[2],
      repair?: Parameters<typeof generateNarrativeProseV4>[4]
    ) => generateNarrativeProseV4(
      candidateEvidence,
      candidatePlan,
      variant,
      { apiKey },
      repair
    ),
    critiqueFinal: (request: ReturnType<typeof buildNarrativeCriticRequestV4>) => (
      requestNarrativeFinalCritiqueV4(request, lifecycle)
    ),
  };
  const result = await runNarrativeMadridPilotQualificationV4(evidence, {
    criticModel: lifecycle.model,
    runCandidate: (variant) => runAutonomousNarrativeV4(
      { evidence, variant },
      autonomousServices
    ),
    critique: (text, candidatePlan) => requestNarrativeFinalCritiqueV4(
      buildNarrativeCriticRequestV4(evidence, candidatePlan, text),
      lifecycle
    ),
  });
  if (freeze && result.status === 'passed') {
    freezeNarrativeMadridPilotV4(result, evidence, PATHS);
  }
  printSummary(result, freeze && result.status === 'passed');
  if (result.status !== 'passed') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
