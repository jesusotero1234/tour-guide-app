import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { PostgresTourRepository } from '../../infrastructure/postgres/PostgresTourRepository';
import { admittedToPilot } from '../PilotRelease';
import { TourAudioService } from '../TourAudioService';
import type { AudioPaths } from './fingerprint';
import { baseKeyOf } from './legsPlan';
import type { Manifest, ManifestTour } from './plan';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});

/** What is read from a database about the published tours. The same code runs on the server (snapshot) and on a local copy. */
export interface DumpedTour {
  tour: { id: string; language: string; city: string; country: string; countryCode: string; theme: string; introduction: string | null;
    introductionSpokenText: string | null; metadata: Record<string, unknown> };
  places: Array<{ id: string; position: number; name: string; description: string; spokenText: string | null; latitude: number; longitude: number; metadata: Record<string, unknown> }>;
  rendererKey: string;
  audioVersions: Record<string, string>;
  /** Fingerprint stored in the tour and whether the backend admits it today. */
  storedFingerprint: string | null;
  admitted: boolean;
}
export interface CatalogDump { version: 1; createdAt: string; source: string; tours: DumpedTour[]; notAdmitted: string[] }

/** Reads every published tour with the backend's own code. Tours the backend does not admit are listed apart and never regenerated. */
export async function dumpCatalog(client: PrismaClient, source: string, paths?: AudioPaths, only?: string[]): Promise<CatalogDump> {
  const repository = new PostgresTourRepository(client), audio = new TourAudioService(client, undefined, paths);
  const ids = (await client.tour.findMany({ where: { status: 'published', ...(only ? { id: { in: only } } : {}) }, select: { id: true }, orderBy: [{ city: 'asc' }, { language: 'asc' }, { id: 'asc' }] })).map(r => r.id);
  const tours: DumpedTour[] = [], notAdmitted: string[] = [];
  for (const id of ids) {
    const tour = await repository.findById(id);
    if (!tour) continue;
    const state = await audio.get(id, true);
    if (!admittedToPilot(tour, state)) { notAdmitted.push(id); continue; }
    const snapshot = await audio.snapshot(id, true);
    tours.push({
      tour: { id, language: tour.language, city: tour.city, country: tour.country, countryCode: tour.countryCode, theme: tour.theme,
        introduction: tour.introduction ?? null, introductionSpokenText: tour.introductionSpokenText ?? null, metadata: record(tour.metadata) },
      places: tour.places.map(p => ({ id: p.id, position: p.position, name: p.name, description: p.description, spokenText: p.spokenText ?? null,
        latitude: p.latitude, longitude: p.longitude, metadata: record(p.metadata) })),
      rendererKey: snapshot.rendererKey, audioVersions: state.audioVersions ?? {},
      storedFingerprint: (record(tour.metadata).pilotRelease as { fingerprint?: string } | undefined)?.fingerprint ?? null, admitted: true });
  }
  return { version: 1, createdAt: new Date().toISOString(), source, tours, notAdmitted };
}

export function manifestFromDump(dump: CatalogDump, runId: string, source: Manifest['source'], now = new Date()): Manifest {
  const seen = new Set<string>();
  const tours: ManifestTour[] = dump.tours.map(row => {
    const { tour } = row;
    if (seen.has(tour.id)) throw new Error('Duplicate tour in the snapshot: ' + tour.id);
    seen.add(tour.id);
    if (!tour.introduction?.trim() || row.places.length < 2) throw new Error('The snapshot has an incomplete tour: ' + tour.id);
    if (!/^[a-f0-9]{64}$/.test(row.rendererKey) || !row.storedFingerprint) throw new Error('The snapshot lacks the voice or the fingerprint of tour ' + tour.id);
    const places = [...row.places].sort((a, b) => a.position - b.position).map(p => ({
      placeId: p.id, position: p.position, name: p.name, ...(typeof p.metadata.nameInTourLanguage === 'string' ? { nameInTourLanguage: p.metadata.nameInTourLanguage } : {}),
      description: p.description, spokenText: p.spokenText, latitude: p.latitude, longitude: p.longitude, metadata: p.metadata }));
    return { tourId: tour.id, language: tour.language, city: tour.city, countryCode: tour.countryCode, theme: tour.theme,
      baseKey: baseKeyOf({ countryCode: tour.countryCode, theme: tour.theme, places }), fingerprint: row.storedFingerprint, rendererKey: row.rendererKey,
      introduction: tour.introduction, introductionSpokenText: tour.introductionSpokenText,
      ...(typeof tour.metadata.introductionAudioId === 'string' ? { introductionAudioId: tour.metadata.introductionAudioId } : {}),
      audioVersions: row.audioVersions, metadata: tour.metadata, places };
  });
  return { version: 1, runId, createdAt: now.toISOString(), source, tours };
}

export const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
export const manifestSha256 = (manifest: Manifest) => sha(canonicalJson(manifest));

/** What the public API says about a tour, reduced to what the snapshot is compared with. */
export interface PublicTour { id: string; introduction?: string; pilot?: { version?: string }; places: Array<{ id: string; description: string; audioVersion?: string }> }

/** Plan 04 section 4: the snapshot must say what the public API says, or nothing is regenerated from it. */
export function crossCheck(manifest: Manifest, api: Record<string, PublicTour | null | undefined>): string[] {
  const problems: string[] = [];
  for (const tour of manifest.tours) {
    const pub = api[tour.tourId];
    if (!pub) { problems.push(tour.tourId + ': not served by the public API'); continue; }
    if (pub.introduction !== tour.introduction) problems.push(tour.tourId + ': introduction differs');
    if (pub.pilot?.version !== tour.fingerprint) problems.push(tour.tourId + ': fingerprint differs');
    if (pub.places.length !== tour.places.length) { problems.push(tour.tourId + ': number of stops differs'); continue; }
    for (const place of tour.places) {
      const served = pub.places.find(p => p.id === place.placeId);
      if (!served) problems.push(tour.tourId + ': stop ' + place.placeId + ' is not served');
      else {
        if (served.description !== place.description) problems.push(tour.tourId + ': description of ' + place.placeId + ' differs');
        if (served.audioVersion !== tour.audioVersions[place.placeId]) problems.push(tour.tourId + ': audio version of ' + place.placeId + ' differs');
      }
    }
  }
  const extra = Object.keys(api).filter(id => api[id] && !manifest.tours.some(t => t.tourId === id));
  for (const id of extra) problems.push(id + ': served by the API but missing from the snapshot');
  return problems;
}
