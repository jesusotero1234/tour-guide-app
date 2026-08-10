import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  NarrativePilotPreviewDocumentV5,
  NarrativePilotPreviewV5,
  PILOT_BLOCK_KINDS,
} from './narrativePilotV5';

export const NARRATIVE_PILOT_PREVIEW_PATH_V5 = resolve(
  process.cwd(),
  'src/fixtures/narrative-madrid-v5-preview.json'
);

export type NarrativePilotPreviewLoadV5 =
  | { ok: true; preview: NarrativePilotPreviewV5 }
  | { ok: false; kind: 'missing' | 'invalid'; message: string };

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function validateNarrativePilotPreviewDocumentV5(
  raw: unknown
): NarrativePilotPreviewDocumentV5 {
  const document = objectValue(raw);
  const links = objectValue(document?.freezeLinks);
  const preview = objectValue(document?.payload);
  const tour = objectValue(preview?.tour);
  if (!document || document.schemaVersion !== 'narrative-pilot-freeze-document-v5'
    || document.kind !== 'preview' || !links || !preview || !tour
    || !['qualification', 'artifact', 'preview', 'manifest']
      .every((key) => validHash(links[key]))
    || preview.schemaVersion !== 'narrative-pilot-preview-v5'
    || !validHash(preview.selectedTextFingerprint) || !validHash(preview.fingerprint)
    || links.preview !== preview.fingerprint
    || tour.status !== 'review' || tour.durationMinutes !== 60
    || tour.language !== 'es-ES' || tour.theme !== 'history'
    || !Array.isArray(tour.places) || tour.places.length !== 7) {
    throw new Error('El documento congelado no cumple el contrato del piloto V5.');
  }
  const placesValid = tour.places.every((rawPlace, index) => {
    const place = objectValue(rawPlace);
    const sections = objectValue(place?.descriptionSections);
    const metadata = objectValue(place?.metadata);
    const narration = objectValue(metadata?.narrationMeta);
    return place && sections && narration
      && typeof place.id === 'string' && typeof place.name === 'string'
      && typeof place.description === 'string' && typeof place.observation === 'string'
      && place.position === index && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
      && Object.keys(sections).sort().join(',') === [...PILOT_BLOCK_KINDS].sort().join(',')
      && PILOT_BLOCK_KINDS.every((kind) => typeof sections[kind] === 'string' && sections[kind])
      && validHash(narration.fingerprint)
      && narration.verifiedRate === 1 && narration.criticalFailCount === 0
      && narration.sectionsFallbacked === 0 && !('audioUrl' in place);
  });
  const { fingerprint: storedFingerprint, ...previewContent } = preview;
  if (!placesValid || storedFingerprint !== fingerprint(previewContent)) {
    throw new Error('El contenido o fingerprint del preview V5 ha cambiado.');
  }
  return raw as NarrativePilotPreviewDocumentV5;
}

export function loadNarrativePilotPreviewV5(): NarrativePilotPreviewLoadV5 {
  let source: string;
  try {
    source = readFileSync(NARRATIVE_PILOT_PREVIEW_PATH_V5, 'utf8');
  } catch (error) {
    const code = objectValue(error)?.code;
    if (code === 'ENOENT') {
      return {
        ok: false,
        kind: 'missing',
        message: 'El preview congelado del piloto no existe. Ejecuta primero una calificación V5 aprobada con --freeze-pilot.',
      };
    }
    return { ok: false, kind: 'invalid', message: 'No se pudo leer el preview congelado del piloto.' };
  }
  try {
    return { ok: true, preview: validateNarrativePilotPreviewDocumentV5(JSON.parse(source)).payload };
  } catch (error) {
    return {
      ok: false,
      kind: 'invalid',
      message: error instanceof Error ? error.message : 'El JSON del preview V5 no es válido.',
    };
  }
}
