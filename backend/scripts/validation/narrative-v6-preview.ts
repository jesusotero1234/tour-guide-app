import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import manifestJson from '../../fixtures/narrative-madrid-v6/reference.json';

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

function readableParagraphs(text: string): string {
  const sentences = text.trim().replace(/\s+/gu, ' ').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/u);
  if (sentences.length < 4) return sentences.join(' ');
  const paragraphCount = Math.min(5, Math.max(3, Math.ceil(sentences.length / 7)));
  const baseSize = Math.floor(sentences.length / paragraphCount);
  const remainder = sentences.length % paragraphCount;
  const paragraphs: string[] = [];
  let cursor = 0;
  for (let index = 0; index < paragraphCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    paragraphs.push(sentences.slice(cursor, cursor + size).join(' '));
    cursor += size;
  }
  return paragraphs.join('\n\n');
}

export function writeNarrativeV6PreviewV6(
  runDirectory: string,
  markdownOutput = resolve(runDirectory, 'tour-preview.md')
): { output: string; markdownOutput: string; places: number } {
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
  const reviewPath = resolve(runDirectory, 'review.json');
  const review = existsSync(reviewPath)
    ? JSON.parse(readFileSync(reviewPath, 'utf8')) as {
      gate?: { status?: string };
      workflowStatus?: string;
      tourOnly?: boolean;
      scripts?: Array<{ stopId?: string; text?: string }>;
    }
    : undefined;
  const finalScripts = new Map((review?.scripts ?? []).flatMap((item) => (
    item.stopId && item.text ? [[item.stopId, item.text] as const] : []
  )));
  const missing = manifestJson.stops.filter((stop) => (
    !finalScripts.has(stop.stopId) && !drafts.has(stop.stopId)
  ));
  if (missing.length > 0) {
    throw new Error(`tour scripts are missing: ${missing.map((stop) => stop.stopId).join(', ')}`);
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
      editorialGate: review?.gate?.status ?? 'not_completed',
    },
    places: manifestJson.stops.map((stop, position) => {
      const draft = drafts.get(stop.stopId);
      return {
        id: stop.stopId,
        tourId: `narrative-v6-${runId}`,
        name: stop.name,
        description: finalScripts.get(stop.stopId) ?? draft?.value?.text ?? '',
        latitude: stop.coordinates.lat,
        longitude: stop.coordinates.lng,
        position,
        metadata: {
          narrativeStopId: stop.stopId,
          model: draft?.actualModel,
          provider: draft?.actualProvider,
        },
      };
    }),
    createdAt: now,
    updatedAt: now,
  };
  const output = resolve(runDirectory, 'tour-preview.json');
  const stopWordCounts = tour.places.map((place) => wordCount(place.description));
  const totalWords = stopWordCounts.reduce((total, count) => total + count, 0);
  const gatePassed = review?.gate?.status === 'passed';
  const scriptsAudited = review?.workflowStatus === 'ready_for_human_gate';
  const status = scriptsAudited && review?.tourOnly
    ? 'guiones auditados — pruebas de mutación omitidas'
    : gatePassed
      ? 'gate editorial superado'
      : 'borrador — la auditoría automática no finalizó';
  const markdown = [
    '# Tour completo de Madrid',
    '',
    `> **Estado:** ${status}.`,
    `> **Duración:** 120 min incluyendo recorrido y pausas · unos ${Math.ceil(totalWords / 140)} min de escucha.`,
    '',
    '## Introducción',
    '',
    tour.introduction,
    '',
    '## Índice',
    '',
    ...tour.places.map((place, index) => `${index + 1}. [${place.name}](#parada-${index + 1})`),
    '',
    '## Resumen de palabras',
    '',
    '| Parada | Palabras |',
    '| --- | ---: |',
    ...tour.places.map((place, index) => `| ${index + 1}. ${place.name} | ${stopWordCounts[index]} |`),
    `| **Total** | **${totalWords}** |`,
    '',
    ...tour.places.flatMap((place, index) => [
      `<a id="parada-${index + 1}"></a>`,
      '',
      `## ${index + 1}. ${place.name}`,
      '',
      `_${place.latitude}, ${place.longitude} · ~${Math.ceil(stopWordCounts[index] / 140)} min de escucha · Modelo: ${place.metadata.model ?? 'no informado'} · Proveedor: ${place.metadata.provider ?? 'no informado'}_`,
      '',
      readableParagraphs(place.description),
      '',
    ]),
  ].join('\n');
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(output, JSON.stringify(tour, null, 2));
  writeFileSync(markdownOutput, `${markdown}\n`);
  return { output, markdownOutput, places: tour.places.length };
}

if (require.main === module) {
  try {
    const runDirectory = resolve(option('--run-dir') ?? '');
    if (!option('--run-dir')) throw new Error('--run-dir is required');
    const output = writeNarrativeV6PreviewV6(
      runDirectory,
      resolve(option('--markdown-output') ?? resolve(runDirectory, 'tour-preview.md'))
    );
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
