import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { audioDisclosure, audioIdentity, rendererKeyOf } from '../AudioProvenance';
import { TourAudioService } from '../TourAudioService';
import { assertSameVoice, checkRendered, cueDefinitions, cueKey, planRenderJobs, renderInput, sourceHashOf, tourPieces, tourRows, type ManifestTour, type Piece, type Rendered } from './plan';

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const identity = audioIdentity(Buffer.from('{"modelId":"openbmb/VoxCPM2","modelRevision":"' + 'a'.repeat(40) + '"}'), Buffer.from('wav'));
const places = [{ placeId: '22222222-2222-4222-8222-222222222222', position: 1, name: 'Plaza de la Virgen', description: 'B', latitude: 1, longitude: 1, metadata: {} },
  { placeId: '11111111-1111-4111-8111-111111111111', position: 0, name: 'Torres de Serranos', nameInTourLanguage: 'Torres de Serranos', description: 'A', latitude: 1, longitude: 1, metadata: {} }];
const tour: ManifestTour = { tourId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', language: 'es', city: 'Valencia', countryCode: 'ES', theme: 'history', baseKey: 'k', fingerprint: 'f',
  rendererKey: rendererKeyOf(identity), introduction: 'Intro 1248', audioVersions: {}, metadata: {}, places };
const spoken = { introductionSpokenText: 'Intro mil doscientos cuarenta y ocho', places: { [places[0].placeId]: 'Cuerpo dos', [places[1].placeId]: 'Cuerpo uno' },
  cues: { ['first:' + places[0].placeId]: 'Primera parada: Plaza de la Virgen.', ['first:' + places[1].placeId]: 'Primera parada: Torres de Serranos.',
    ['next:' + places[0].placeId]: 'Siguiente parada: Plaza de la Virgen.', ['next:' + places[1].placeId]: 'Siguiente parada: Torres de Serranos.', finish: 'Aquí termina el paseo. Gracias por caminar con nosotros.' } };
const bodies = { introduction: 'Intro 1248', places: { [places[0].placeId]: 'Cuerpo 2', [places[1].placeId]: 'Cuerpo 1' } };

describe('pieces of a tour', () => {
  const pieces = tourPieces('run', tour, bodies, spoken);

  it('are the introduction, every stop in route order and the 2N+1 clips', () => {
    expect(pieces.map(p => p.kind)).toEqual(['introduction', 'stop', 'stop', 'cue:first', 'cue:first', 'cue:next', 'cue:next', 'cue:finish']);
    expect(pieces.filter(p => p.kind === 'stop').map(p => p.pieceId)).toEqual([places[1].placeId, places[0].placeId]);   // by position, not by row order
    expect(cueDefinitions(tour).map(cueKey)).toEqual(['first:' + places[1].placeId, 'first:' + places[0].placeId, 'next:' + places[1].placeId, 'next:' + places[0].placeId, 'finish']);
    for (const p of pieces) expect(p.audioId).toMatch(UUID);
    expect(new Set(pieces.map(p => p.audioId)).size).toBe(pieces.length);
  });

  it('the introduction is spoken with the AI-voice notice first, and the screen text keeps the digits', () => {
    const intro = pieces[0];
    expect(intro.spokenText).toBe(audioDisclosure('es') + '\n\nIntro mil doscientos cuarenta y ocho');
    expect(intro.text).toBe(audioDisclosure('es') + '\n\nIntro 1248');
    expect(pieces[1]).toMatchObject({ text: 'Cuerpo 1', spokenText: 'Cuerpo uno' });
  });

  it('a missing text or spoken text is an error, never an empty file', () => {
    expect(() => tourPieces('run', tour, bodies, { ...spoken, cues: { finish: 'x' } })).toThrow('Missing spoken text for link clip');
    expect(() => tourPieces('run', tour, bodies, { ...spoken, places: {} })).toThrow('Missing text for stop');
  });

  it('ids depend on the spoken text only through the piece itself', () => {
    const changed = tourPieces('run', tour, bodies, { ...spoken, places: { ...spoken.places, [places[0].placeId]: 'Cuerpo dos, corregido' } });
    const diff = changed.filter((p, i) => p.audioId !== pieces[i].audioId);
    expect(diff.map(p => p.pieceId)).toEqual([places[0].placeId]);
  });
});

describe('render jobs', () => {
  const many = (n: number, language = 'es', offset = 0): Piece[] => Array.from({ length: n }, (_, i) => ({ tourId: 't', language, kind: 'stop' as const, pieceId: 'p' + (i + offset), text: 'x', spokenText: 'x' + (i + offset), audioId: 'id' + language + (i + offset) }));
  it('hold at most 40 pieces, one language each, and render identical files once', () => {
    const jobs = planRenderJobs('run', 'es', [...many(100), ...many(30, 'fr'), ...many(100).slice(0, 10)]);
    expect(jobs.map(j => j.pieces.length)).toEqual([40, 40, 20]);
    expect(jobs.every(j => j.jobId.match(UUID) && j.language === 'es')).toBe(true);
    expect(new Set(jobs.map(j => j.jobId)).size).toBe(3);
    expect(planRenderJobs('run', 'fr', many(30, 'fr')).length).toBe(1);
    expect(planRenderJobs('run', 'de', many(5))).toEqual([]);
  });
  it('the render input carries both texts and the speech version', () => {
    const input = renderInput(planRenderJobs('run', 'es', many(2))[0], identity, 'speech-1');
    expect(input).toMatchObject({ language: 'es', speechVersion: 'speech-1', identity });
    expect(input.stops[0]).toEqual({ id: 'ides0', text: 'x', spokenText: 'x0' });
  });
});

describe('checks on a rendered file', () => {
  const stop: Piece = { tourId: 't', language: 'es', kind: 'stop', pieceId: 'p', text: 'x', spokenText: 'Texto hablado.', audioId: 'a' };
  const clip: Piece = { ...stop, kind: 'cue:next', cue: { kind: 'next', placeId: 'p' } };
  const good = { durationSeconds: 120, sidecarSpokenText: 'Texto   hablado.', fileSha256: 'h', expectedSha256: 'h' };
  it('accepts a good file and rejects each kind of problem', () => {
    expect(checkRendered(stop, good).ok).toBe(true);
    expect(checkRendered(stop, { ...good, durationSeconds: 0 }).problems[0]).toContain('duration');
    expect(checkRendered(stop, { ...good, sidecarSpokenText: 'Otro texto.' }).problems[0]).toContain('sidecar spoken text differs');
    expect(checkRendered(stop, { ...good, sidecarSpokenText: undefined }).problems[0]).toContain('no spokenText');
    expect(checkRendered(stop, { ...good, expectedSha256: 'other' }).problems[0]).toContain('hash');
  });
  it('a link clip must last between 0.8 and 10 seconds', () => {
    expect(checkRendered(clip, { ...good, durationSeconds: 2.5 }).ok).toBe(true);
    expect(checkRendered(clip, { ...good, durationSeconds: 0.5 }).ok).toBe(false);
    expect(checkRendered(clip, { ...good, durationSeconds: 12 }).ok).toBe(false);
  });
});

describe('rows for the importer use exactly the hashes the backend computes', () => {
  const pieces = tourPieces('run', tour, bodies, spoken);
  const rendered: Rendered = { audioId: '', jobId: 'job', storagePath: '', durationSeconds: 3, fileSha256: '' };
  const make = (p: Piece, n: number): Rendered => ({ ...rendered, audioId: p.audioId, storagePath: `voxcpm2/job/${p.audioId}.mp3`, fileSha256: sha('file' + n) });
  const all: Record<string, Rendered> = Object.fromEntries(pieces.map((p, i) => [p.audioId, make(p, i)]));
  const by = (kind: string, id?: string) => all[pieces.find(p => p.kind === kind && (!id || p.pieceId === id))!.audioId];
  const rows = tourRows(tour, pieces, { introduction: by('introduction'), places: Object.fromEntries(places.map(p => [p.placeId, by('stop', p.placeId)])),
    cues: Object.fromEntries(cueDefinitions(tour).map(d => [cueKey(d), by('cue:' + d.kind, d.placeId ?? 'finish')])) }, identity, 'speech-1');

  it('the introduction row is tied to the first stop and hashes the disclosure plus the spoken introduction', () => {
    expect(rows.introductionAudio.metadata.firstAudioAssetId).toBe(rows.audioAssets[0].id);
    expect(rows.introductionAudio.metadata.sourceHash).toBe(sha('es' + tour.rendererKey + audioDisclosure('es') + '\n\nIntro mil doscientos cuarenta y ocho'));
    expect(rows.introductionSourceHash).toBe(rows.introductionAudio.metadata.sourceHash);
  });

  it('stop and clip rows carry sourceHash = sha(language + rendererKey + spoken text)', () => {
    expect(rows.audioAssets.map(a => a.metadata.sourceHash)).toEqual([sourceHashOf('es', tour.rendererKey, 'Cuerpo uno'), sourceHashOf('es', tour.rendererKey, 'Cuerpo dos')]);
    expect(rows.cues.find(c => c.kind === 'finish')!.metadata.sourceHash).toBe(sourceHashOf('es', tour.rendererKey, spoken.cues.finish));
    expect(rows.audioAssets[0].metadata).toMatchObject({ provider: 'VoxCPM2', voice: 'A', rendererKey: tour.rendererKey, speechVersion: 'speech-1', audioJobId: 'job' });
  });

  it('the cue manifest lists every clip, in the canonical order the fingerprint uses, with version = sourceHash.fileSha256', () => {
    expect(rows.cueManifest.length).toBe(5);
    expect(rows.cueManifest).toEqual([...rows.cueManifest].sort((a, b) => (a.kind + (a.placeId ?? '')).localeCompare(b.kind + (b.placeId ?? ''))));
    for (const entry of rows.cueManifest) expect(entry.version).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/);
    expect(rows.cueManifest.find(e => e.kind === 'finish')).toMatchObject({ text: 'Aquí termina el paseo. Gracias por caminar con nosotros.' });
    expect('placeId' in rows.cueManifest.find(e => e.kind === 'finish')!).toBe(false);
  });

  it('refuses to render with a voice other than the one that made the published audio', () => {
    expect(() => assertSameVoice(tour, identity)).not.toThrow();
    expect(() => assertSameVoice({ ...tour, rendererKey: 'other' }, identity)).toThrow('rendererKey mismatch');
    expect(() => tourRows({ ...tour, rendererKey: 'other' }, pieces, {} as never, identity, 'speech-1')).toThrow('rendererKey mismatch');
  });
});

describe('the hashes agree with TourAudioService.snapshot', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'plan-')); });
  afterEach(async () => { delete process.env.VOXCPM_PRESET_PATH; await rm(directory, { recursive: true, force: true }); });

  it('for stops and for the introduction, with a separate introduction', async () => {
    await writeFile(join(directory, 'reference.wav'), 'wav');
    await writeFile(join(directory, 'preset.json'), JSON.stringify({ reference: 'reference.wav' }));
    process.env.VOXCPM_PRESET_PATH = join(directory, 'preset.json');
    const dbTour = { id: tour.tourId, status: 'published', language: 'es', metadata: {}, introduction: 'Intro 1248', introductionSpokenText: spoken.introductionSpokenText,
      places: [{ id: places[1].placeId, description: 'Cuerpo 1', spokenText: 'Cuerpo uno' }, { id: places[0].placeId, description: 'Cuerpo 2', spokenText: 'Cuerpo dos' }] };
    const service = new TourAudioService({ tour: { findUnique: async () => dbTour }, audioAsset: { findMany: async () => [] }, generationJob: { count: async () => 0 } } as unknown as PrismaClient,
      jest.fn(), { storageDir: join(directory, 'audio'), jobsDir: join(directory, 'jobs') });
    const snapshot = await service.snapshot(tour.tourId, true);
    expect(snapshot.hashes[places[1].placeId]).toBe(sourceHashOf('es', snapshot.rendererKey, 'Cuerpo uno'));
    expect(snapshot.hashes[places[0].placeId]).toBe(sourceHashOf('es', snapshot.rendererKey, 'Cuerpo dos'));
    expect(snapshot.introductionHash).toBe(sourceHashOf('es', snapshot.rendererKey, audioDisclosure('es') + '\n\n' + spoken.introductionSpokenText));
  });
});
