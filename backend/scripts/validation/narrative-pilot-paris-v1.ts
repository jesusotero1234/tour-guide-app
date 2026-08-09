import 'dotenv/config';
import { readFileSync, renameSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  AutonomousNarrativePilotArtifactV1,
  replayAutonomousNarrativePilotArtifactV1,
  runAutonomousNarrativePilotV1,
  serializeMachineApprovedNarrativePilotArtifactV1,
} from '../../src/services/poi/AutonomousNarrativePilotV1';
import { buildParisNarrativeScriptRequestV1 } from '../../src/services/poi/ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from '../../src/services/poi/EditorialWorkbenchV7';

const ARTIFACT_PATH = 'fixtures/narrative-pilot-v1/paris-premium-es.artifact.json';

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function freezeApprovedArtifact(path: string, artifact: AutonomousNarrativePilotArtifactV1): void {
  const serialized = serializeMachineApprovedNarrativePilotArtifactV1(artifact);
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporaryPath, path);
}

function evidenceUseDiagnostic(rawOutput: string | null): unknown {
  if (!rawOutput) return null;
  try {
    const root = JSON.parse(rawOutput) as {
      scripts?: Array<{ sceneId?: unknown; blocks?: Array<{ evidenceFactIds?: unknown }> }>;
    };
    if (!Array.isArray(root.scripts)) return null;
    return root.scripts.map((scene) => {
      const uses: Record<string, number> = {};
      if (Array.isArray(scene.blocks)) {
        for (const block of scene.blocks) {
          if (!Array.isArray(block.evidenceFactIds)) continue;
          for (const factId of block.evidenceFactIds) {
            if (typeof factId === 'string') uses[factId] = (uses[factId] ?? 0) + 1;
          }
        }
      }
      return { sceneId: scene.sceneId ?? null, evidenceUses: uses };
    });
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const route = loadJson<EditorialWorkbenchV7>(resolve(
    process.cwd(), 'fixtures/editorial-v7/paris-history-en-120.json'
  ));
  const request = buildParisNarrativeScriptRequestV1(route);
  const generate = hasFlag('--generate');
  const freeze = hasFlag('--freeze-approved');
  if (freeze && !generate) throw new Error('--freeze-approved requires --generate --allow-external');

  let artifact: AutonomousNarrativePilotArtifactV1;
  if (generate) {
    if (!hasFlag('--allow-external')) {
      throw new Error('external narrative generation requires --generate --allow-external');
    }
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for external generation');
    const ollamaHost = process.env.OLLAMA_HOST?.trim();
    if (!ollamaHost) throw new Error('OLLAMA_HOST is required for the local Gemma critic');
    artifact = await runAutonomousNarrativePilotV1(request, {
      generator: { apiKey },
      critic: { ollamaHost },
    });
    if (freeze) freezeApprovedArtifact(resolve(process.cwd(), ARTIFACT_PATH), artifact);
  } else {
    artifact = loadJson<AutonomousNarrativePilotArtifactV1>(
      resolve(process.cwd(), ARTIFACT_PATH)
    );
    replayAutonomousNarrativePilotArtifactV1(artifact, request);
  }

  const finalCritique = artifact.attempts[artifact.attempts.length - 1]?.critique;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: artifact.schemaVersion,
    status: artifact.status,
    failure: artifact.failure,
    attemptCount: artifact.attempts.length,
    generationStatuses: artifact.attempts.map((attempt) => attempt.generation.status),
    repairInstructionsByAttempt: artifact.attempts.map((attempt) => attempt.repairInstructions),
    generationErrors: artifact.attempts.map((attempt) => (
      attempt.generation.attempts[attempt.generation.attempts.length - 1]?.error ?? null
    )),
    generationEvidenceUses: artifact.attempts.map((attempt) => evidenceUseDiagnostic(
      attempt.generation.attempts[attempt.generation.attempts.length - 1]?.rawOutput ?? null
    )),
    critiqueStatuses: artifact.attempts.map((attempt) => attempt.critique?.status ?? null),
    scenes: artifact.scripts.map((script) => ({
      sceneId: script.sceneId,
      openingType: script.openingType,
      wordCount: script.wordCount,
      transitionTarget: script.transition.targetSceneId,
    })),
    premiumReadiness: finalCritique?.report?.premiumReadiness ?? null,
    criticVerdict: finalCritique?.report?.verdict ?? null,
    unsupportedClaims: finalCritique?.report?.unsupportedClaims ?? [],
    misleadingOmissions: finalCritique?.report?.misleadingOmissions ?? [],
    repairInstructions: finalCritique?.report?.repairInstructions ?? [],
    critiqueLatencyMs: finalCritique?.attempts.reduce(
      (total, attempt) => total + attempt.latencyMs, 0
    ) ?? null,
    criticModel: finalCritique ? {
      name: finalCritique.model,
      digest: finalCritique.modelDigest,
    } : null,
    fingerprints: artifact.fingerprints,
    replayedOffline: !generate,
    frozen: freeze,
  }, null, 2)}\n`);
  if (artifact.status === 'rejected') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
