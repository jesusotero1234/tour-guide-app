import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  EditorialWorkbenchV7,
  replayEditorialWorkbenchV7,
} from '../../src/services/poi/EditorialWorkbenchV7';

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main(): Promise<void> {
  const artifactPath = resolve(
    process.cwd(),
    argument('--artifact') ?? 'fixtures/editorial-v7/madrid-history-es-120.json'
  );
  const workbench = JSON.parse(readFileSync(artifactPath, 'utf8')) as EditorialWorkbenchV7;
  const result = await replayEditorialWorkbenchV7(workbench);
  const route = result.route;

  process.stdout.write(`${JSON.stringify({
    schemaVersion: workbench.schemaVersion,
    status: result.status,
    reason: result.reason,
    route: route ? {
      sceneIds: route.sceneIds,
      walkingMeters: route.metrics.walkingMeters,
      walkingMinutes: route.metrics.walkingMinutes,
      maxSegmentMeters: route.metrics.maxSegmentMeters,
    } : null,
    recommendedDurationMinutes: result.duration?.recommendedDurationMinutes ?? null,
    narrationSource: result.duration?.narrationSource ?? null,
    externalGates: result.externalGates,
    snapshotReplayed: true,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
