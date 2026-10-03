import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TourAudioService } from '../TourAudioService';

const tourId = '11111111-1111-4111-8111-111111111111';
const [a, b] = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('link clips are served only when the tour manifest, the current voice and the file all agree', () => {
  let directory: string;
  let rows: Array<Record<string, any>>;
  let tour: Record<string, any>;
  let service: TourAudioService;
  let rendererKey: string;
  let counter = 0;

  /** Writes the audio file and returns the row that describes it. */
  async function clip(kind: string, placeId: string | undefined, spokenText: string, overrides: Record<string, unknown> = {}) {
    const n = ++counter, job = uuid(n), id = uuid(1000 + n), body = Buffer.from('mp3 ' + n + spokenText);
    await mkdir(join(directory, 'audio/voxcpm2', job), { recursive: true });
    await writeFile(join(directory, 'audio/voxcpm2', job, id + '.mp3'), body);
    const sourceHash = sha('es' + rendererKey + spokenText), fileSha256 = sha(body);
    return { id, tourId, kind, placeId: placeId ?? null, language: 'es', text: spokenText, spokenText, format: 'mp3', storagePath: `voxcpm2/${job}/${id}.mp3`,
      durationSeconds: 2.5, createdAt: new Date(2026, 9, n), metadata: { rendererKey, sourceHash, fileSha256 }, ...overrides };
  }
  const entry = (row: Record<string, any>, text = row.text) => ({ kind: row.kind, ...(row.placeId ? { placeId: row.placeId } : {}), text, version: `${row.metadata.sourceHash}.${row.metadata.fileSha256}` });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cues-'));
    await writeFile(join(directory, 'reference.wav'), 'voice');
    await writeFile(join(directory, 'preset.json'), JSON.stringify({ reference: 'reference.wav' }));
    process.env.VOXCPM_PRESET_PATH = join(directory, 'preset.json');
    rows = [];
    tour = { id: tourId, status: 'published', language: 'es', metadata: {}, places: [{ id: a, description: 'A.' }, { id: b, description: 'B.' }] };
    const client = { tour: { findUnique: jest.fn(async () => tour) }, audioAsset: { findMany: jest.fn(async () => []) }, generationJob: { count: jest.fn(async () => 0) },
      tourCueAudio: { findMany: jest.fn(async () => [...rows].sort((x, y) => y.createdAt - x.createdAt)) } } as unknown as PrismaClient;
    service = new TourAudioService(client, jest.fn(), { storageDir: join(directory, 'audio'), jobsDir: join(directory, 'jobs') });
    rendererKey = (await service.snapshot(tourId)).rendererKey;
    counter = 0;
  });
  afterEach(async () => { delete process.env.VOXCPM_PRESET_PATH; await rm(directory, { recursive: true, force: true }); });

  async function fullTour() {
    const made = [await clip('first', a, 'Primera parada: A.'), await clip('first', b, 'Primera parada: B.'), await clip('next', a, 'Siguiente parada: A.'),
      await clip('next', b, 'Siguiente parada: B.'), await clip('finish', undefined, 'Aquí termina el paseo.')];
    rows.push(...made);
    tour.metadata = { cueManifest: made.map(row => entry(row)) };
    return made;
  }

  it('returns every clip with its version and URL', async () => {
    const made = await fullTour();
    const cues = await service.cues(tourId);
    expect(Object.keys(cues!.first)).toEqual([a, b]);
    expect(cues!.next[b].audioUrl).toBe(`/api/backend/tours/${tourId}/cue/next/${b}?v=${entry(made[3]).version}`);
    expect(cues!.finish).toMatchObject({ text: 'Aquí termina el paseo.', durationSeconds: 2.5, audioUrl: `/api/backend/tours/${tourId}/cue/finish?v=${entry(made[4]).version}` });
    expect(cues!.finish!.version).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/);
  });

  it('is null for a tour without a manifest and for an unknown id', async () => {
    expect(await service.cues(tourId)).toBeNull();
    expect(await service.cues('not-a-uuid')).toBeNull();
  });

  it.each([
    ['another voice', (row: Record<string, any>) => { row.metadata = { ...row.metadata, rendererKey: 'other' }; }],
    ['a changed spoken text', (row: Record<string, any>) => { row.spokenText = 'Otra cosa.'; }],
    ['a different file', (row: Record<string, any>) => { row.metadata = { ...row.metadata, fileSha256: sha('other') }; }],
    ['a storage path that is not a UUID path', (row: Record<string, any>) => { row.storagePath = '../../etc/passwd'; }],
    ['another language', (row: Record<string, any>) => { row.language = 'fr'; }],
  ])('one clip with %s means no clips at all', async (_name, damage) => {
    const made = await fullTour();
    damage(made[2]);
    if (_name === 'a different file') tour.metadata = { cueManifest: made.map(row => entry(row)) };
    expect(await service.cues(tourId)).toBeNull();
  });

  it('a missing file and a missing row are not served', async () => {
    const made = await fullTour();
    await rm(join(directory, 'audio', made[0].storagePath));
    expect(await service.cues(tourId)).toBeNull();
    rows.splice(1, 1);
    expect(await service.cues(tourId)).toBeNull();
  });

  it('uses the newest valid row and ignores a newer invalid one', async () => {
    const made = await fullTour();
    rows.push(await clip('finish', undefined, 'Aquí termina el paseo.', { metadata: { rendererKey: 'other', sourceHash: 'x', fileSha256: 'y' } }));
    const cues = await service.cues(tourId);
    expect(cues!.finish!.version).toBe(entry(made[4]).version);
  });

  it('cueFile returns the path, 409 on a stale version and 404 on a clip that is not in the manifest', async () => {
    const made = await fullTour();
    expect(await service.cueFile(tourId, 'next', b, entry(made[3]).version)).toBe(join(directory, 'audio', made[3].storagePath));
    expect(await service.cueFile(tourId, 'finish', undefined)).toBe(join(directory, 'audio', made[4].storagePath));
    await expect(service.cueFile(tourId, 'next', b, 'f'.repeat(64) + '.' + 'f'.repeat(64))).rejects.toMatchObject({ code: 'AUDIO_VERSION_CHANGED', status: 409 });
    await expect(service.cueFile(tourId, 'first', uuid(77))).rejects.toMatchObject({ code: 'AUDIO_NOT_FOUND', status: 404 });
  });
});
