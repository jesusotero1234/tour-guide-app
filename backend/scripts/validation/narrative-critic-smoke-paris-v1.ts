import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  AutonomousNarrativePilotArtifactV1,
  replayAutonomousNarrativePilotArtifactV1,
} from '../../src/services/poi/AutonomousNarrativePilotV1';
import { evaluateNarrativeCriticGateV1 } from '../../src/services/poi/NarrativePilotCriticV1';
import {
  inspectNarrativeCriticModelV1,
  requestNarrativeCritiqueV1,
} from '../../src/services/poi/NarrativePilotGemmaV1';
import { buildParisNarrativeScriptRequestV1 } from '../../src/services/poi/ParisNarrativePilotV1';
import { buildNarrativeCriticSmokeCasesV1 } from '../../src/services/poi/NarrativePilotSmokeV1';
import { EditorialWorkbenchV7 } from '../../src/services/poi/EditorialWorkbenchV7';

const ARTIFACT_PATH = 'fixtures/narrative-pilot-v1/paris-premium-es.artifact.json';

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--allow-external')) {
    throw new Error('live critic smoke requires --allow-external');
  }
  const ollamaHost = process.env.OLLAMA_HOST?.trim();
  if (!ollamaHost) throw new Error('OLLAMA_HOST is required for the local Gemma critic');
  const route = loadJson<EditorialWorkbenchV7>(resolve(
    process.cwd(), 'fixtures/editorial-v7/paris-history-en-120.json'
  ));
  const request = buildParisNarrativeScriptRequestV1(route);
  const artifact = replayAutonomousNarrativePilotArtifactV1(
    loadJson<AutonomousNarrativePilotArtifactV1>(resolve(process.cwd(), ARTIFACT_PATH)),
    request
  );
  if (artifact.status !== 'machine_approved') {
    throw new Error('live critic smoke requires a machine-approved Paris artifact');
  }
  const model = await inspectNarrativeCriticModelV1({ ollamaHost });
  const results = [];
  for (const item of buildNarrativeCriticSmokeCasesV1(request, artifact.scripts)) {
    const critique = await requestNarrativeCritiqueV1(item.request, model, { ollamaHost });
    if (!critique.value) {
      throw new Error(`${item.name} critic failed: ${critique.status}`);
    }
    const gate = evaluateNarrativeCriticGateV1(critique.value);
    const actualVerdict = gate.passed ? 'approve' : 'reject';
    results.push({
      name: item.name,
      expectedVerdict: item.expectedVerdict,
      actualVerdict,
      latencyMs: critique.attempts.reduce((total, attempt) => total + attempt.latencyMs, 0),
      unsupportedClaims: critique.value.unsupportedClaims,
      misleadingOmissions: critique.value.misleadingOmissions,
    });
    if (actualVerdict !== item.expectedVerdict) {
      throw new Error(`${item.name} expected ${item.expectedVerdict}, received ${actualVerdict}`);
    }
  }
  process.stdout.write(`${JSON.stringify({ model, results }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
