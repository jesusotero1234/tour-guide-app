import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import manifestJson from '../../fixtures/narrative-madrid-v6/reference.json';

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function main(): void {
  const runDirectory = resolve(option('--run-dir') ?? '');
  if (!option('--run-dir')) throw new Error('--run-dir is required');
  const diagnostics = JSON.parse(
    readFileSync(resolve(runDirectory, 'diagnostics.private.json'), 'utf8')
  ) as {
    workflow?: Array<{
      callId?: string;
      status?: string;
      actualModel?: string;
      actualProvider?: string;
      value?: { text?: string };
    }>;
  };
  const drafts = new Map((diagnostics.workflow ?? []).flatMap((item) => {
    const stopId = item.callId?.match(/^narrative-v6-writer-(.+)$/)?.[1];
    return stopId && item.status === 'valid' && item.value?.text
      ? [[stopId, item] as const]
      : [];
  }));
  const missing = manifestJson.stops.filter((stop) => !drafts.has(stop.stopId));
  if (missing.length > 0) {
    throw new Error(`writer drafts are missing: ${missing.map((stop) => stop.stopId).join(', ')}`);
  }
  const now = new Date().toISOString();
  const runId = basename(runDirectory);
  const tour = {
    id: `narrative-v6-${runId}`,
    city: 'Madrid',
    country: 'Spain',
    countryCode: 'ES',
    theme: 'history',
    language: 'es',
    durationMinutes: 120,
    status: 'draft',
    introduction: manifestJson.promise,
    metadata: {
      generationMode: 'narrative-v6-openrouter-preview',
      sourceRunId: runId,
      stopCount: manifestJson.stops.length,
    },
    places: manifestJson.stops.map((stop, position) => {
      const draft = drafts.get(stop.stopId)!;
      return {
        id: stop.stopId,
        tourId: `narrative-v6-${runId}`,
        name: stop.name,
        description: draft.value!.text,
        latitude: stop.coordinates.lat,
        longitude: stop.coordinates.lng,
        position,
        metadata: {
          narrativeStopId: stop.stopId,
          model: draft.actualModel,
          provider: draft.actualProvider,
        },
      };
    }),
    createdAt: now,
    updatedAt: now,
  };
  const output = resolve(runDirectory, 'tour-preview.json');
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(output, JSON.stringify(tour, null, 2));
  process.stdout.write(`${JSON.stringify({ output, places: tour.places.length }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
