import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  createFrozenNarrativePilotArtifactV1,
  NarrativePilotArtifactV1,
  NarrativePilotFreezeManifestV1,
  replayNarrativePilotArtifactV1,
} from '../../src/services/poi/NarrativePilotV1';
import { generateNarrativePilotV1 } from '../../src/services/poi/NarrativePilotDeepSeekV1';
import { buildParisNarrativeScriptRequestV1 } from '../../src/services/poi/ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from '../../src/services/poi/EditorialWorkbenchV7';

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function main(): Promise<void> {
  const route = loadJson<EditorialWorkbenchV7>(resolve(
    process.cwd(), 'fixtures/editorial-v7/paris-history-en-120.json'
  ));
  const request = buildParisNarrativeScriptRequestV1(route);
  let artifact: NarrativePilotArtifactV1;

  if (hasFlag('--generate')) {
    if (!hasFlag('--allow-external')) {
      throw new Error('external narrative generation requires --generate --allow-external');
    }
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for external generation');
    artifact = await generateNarrativePilotV1(request, { apiKey });
  } else {
    const response = loadJson<unknown>(resolve(
      process.cwd(), 'fixtures/narrative-pilot-v1/paris-premium-es.response.json'
    ));
    const manifest = loadJson<NarrativePilotFreezeManifestV1>(resolve(
      process.cwd(), 'fixtures/narrative-pilot-v1/paris-premium-es.manifest.json'
    ));
    artifact = createFrozenNarrativePilotArtifactV1(request, response, manifest);
    replayNarrativePilotArtifactV1(artifact, request);
  }

  process.stdout.write(`${JSON.stringify({
    schemaVersion: artifact.schemaVersion,
    status: artifact.status,
    generationMode: artifact.generation.mode,
    generationStatus: artifact.generation.status,
    scenes: artifact.scripts.map((script) => ({
      sceneId: script.sceneId,
      openingType: script.openingType,
      wordCount: script.wordCount,
      transitionTarget: script.transition.targetSceneId,
    })),
    fingerprints: artifact.fingerprints,
    humanReviewCount: artifact.reviews.length,
    replayedOffline: !hasFlag('--generate'),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
