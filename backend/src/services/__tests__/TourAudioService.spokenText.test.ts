import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { audioDisclosure } from '../AudioProvenance';
import { activeIntroduction } from '../IntroductionAudio';
import { TourAudioService } from '../TourAudioService';

jest.mock('../IntroductionAudio', () => ({ ...jest.requireActual('../IntroductionAudio'), activeIntroduction: jest.fn(async () => null) }));

const tourId = '11111111-1111-4111-8111-111111111111';
const [first, second] = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('spoken text decides what is hashed and rendered; the screen text stays what the API shows', () => {
  let directory: string;
  let tour: Record<string, unknown> & { places: Array<Record<string, unknown>> };
  let service: TourAudioService;
  let rendererKey: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tour-audio-spoken-'));
    await writeFile(join(directory, 'reference.wav'), 'voice fixture');
    await writeFile(join(directory, 'preset.json'), JSON.stringify({ reference: 'reference.wav' }));
    process.env.VOXCPM_PRESET_PATH = join(directory, 'preset.json');
    (activeIntroduction as jest.Mock).mockClear();
    tour = { id: tourId, status: 'published', language: 'es', metadata: {},
      places: [{ id: first, position: 0, description: 'Primera parada, en 1398.' }, { id: second, position: 1, description: 'Segunda parada, siglo XIV.' }] };
    const client = { tour: { findUnique: jest.fn(async () => tour) }, audioAsset: { findMany: jest.fn(async () => []) },
      generationJob: { count: jest.fn(async () => 0) } } as unknown as PrismaClient;
    service = new TourAudioService(client, jest.fn(), { storageDir: join(directory, 'audio'), jobsDir: join(directory, 'jobs') });
    rendererKey = (await service.snapshot(tourId)).rendererKey;
    tour.introduction = undefined;
  });

  afterEach(async () => { delete process.env.VOXCPM_PRESET_PATH; await rm(directory, { recursive: true, force: true }); });

  const hashOf = (text: string) => sha('es' + rendererKey + text);

  it('legacy tours: hashes and render input are exactly what they were before spokenText existed', async () => {
    const snapshot = await service.snapshot(tourId, true);
    expect(snapshot.hashes).toEqual({ [first]: hashOf('Primera parada, en 1398.'), [second]: hashOf('Segunda parada, siglo XIV.') });
    // The key is absent, not undefined: a resumed render compares its saved input.json deeply.
    expect(snapshot.stops).toStrictEqual([{ id: first, text: 'Primera parada, en 1398.' }, { id: second, text: 'Segunda parada, siglo XIV.' }]);
  });

  it('stops with spokenText hash and render the spoken text and keep the screen text for transcripts', async () => {
    tour.places[0].spokenText = 'Primera parada, en mil trescientos noventa y ocho.';
    const snapshot = await service.snapshot(tourId, true);
    expect(snapshot.hashes[first]).toBe(hashOf('Primera parada, en mil trescientos noventa y ocho.'));
    expect(snapshot.hashes[second]).toBe(hashOf('Segunda parada, siglo XIV.'));        // not normalised: legacy hash
    expect(snapshot.stops[0]).toStrictEqual({ id: first, text: 'Primera parada, en 1398.', spokenText: 'Primera parada, en mil trescientos noventa y ocho.' });
    const state = await service.get(tourId);
    expect(state.transcripts![second]).toBe('Segunda parada, siglo XIV.');
    expect(state.transcripts![first]).toContain('Primera parada, en 1398.');
    expect(state.transcripts![first]).not.toContain('mil trescientos');                // the spoken text never reaches the API
  });

  it('the introduction hash uses its spoken text, the public introduction text does not', async () => {
    tour.introduction = 'Valencia fue fundada en 138 a. C.';
    expect((await service.snapshot(tourId)).introductionHash).toBe(hashOf(audioDisclosure('es') + '\n\nValencia fue fundada en 138 a. C.'));
    tour.introductionSpokenText = 'Valencia fue fundada en ciento treinta y ocho antes de Cristo.';
    const snapshot = await service.snapshot(tourId);
    expect(snapshot.introductionHash).toBe(hashOf(audioDisclosure('es') + '\n\nValencia fue fundada en ciento treinta y ocho antes de Cristo.'));
    expect(snapshot.introductionText).toBe(audioDisclosure('es') + '\n\nValencia fue fundada en 138 a. C.');
  });

  it('firstHash, which ties the introduction to the first stop, is computed on the first stop spoken text', async () => {
    tour.introduction = 'Valencia fue fundada en 138 a. C.';
    await service.snapshot(tourId);
    expect((activeIntroduction as jest.Mock).mock.calls.at(-1)![3].firstHash).toBe(hashOf('Primera parada, en 1398.'));
    tour.places[0].spokenText = 'Primera parada, en mil trescientos noventa y ocho.';
    tour.introductionSpokenText = 'Valencia fue fundada.';
    const snapshot = await service.snapshot(tourId);
    const expected = (activeIntroduction as jest.Mock).mock.calls.at(-1)![3];
    expect(expected.firstHash).toBe(hashOf('Primera parada, en mil trescientos noventa y ocho.'));
    expect(expected.sourceHash).toBe(snapshot.introductionHash);
  });

  it('without a separate introduction the first chapter is spoken only if every piece of it has spokenText', async () => {
    tour.introduction = 'Valencia fue fundada en 138 a. C.';
    tour.places[0].spokenText = 'Primera parada hablada.';
    let snapshot = await service.snapshot(tourId);                                    // introduction has no spokenText
    expect(snapshot.stops[0].spokenText).toBeUndefined();
    expect(snapshot.hashes[first]).toBe(hashOf(snapshot.stops[0].text));
    tour.introductionSpokenText = 'Introducción hablada.';
    snapshot = await service.snapshot(tourId);
    expect(snapshot.stops[0].spokenText).toBe([audioDisclosure('es'), 'Introducción hablada.', 'Primera parada hablada.'].join('\n\n'));
    expect(snapshot.stops[0].text).toBe([audioDisclosure('es'), 'Valencia fue fundada en 138 a. C.', 'Primera parada, en 1398.'].join('\n\n'));
    expect(snapshot.hashes[first]).toBe(hashOf(snapshot.stops[0].spokenText!));
  });

  it('blank spokenText is ignored', async () => {
    tour.places[0].spokenText = '   ';
    tour.introductionSpokenText = '';
    const snapshot = await service.snapshot(tourId, true);
    expect(snapshot.hashes[first]).toBe(hashOf('Primera parada, en 1398.'));
    expect(snapshot.stops[0]).toStrictEqual({ id: first, text: 'Primera parada, en 1398.' });
  });
});
