import { mkdtemp, rm } from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { audioIdentity, rendererKeyOf } from '../AudioProvenance';
import { assembleTour, withFingerprint } from './assemble';
import { locksFor, parseArgs, status } from './cli';
import { assertDisposableDatabase } from './guard';
import { crossCheck, manifestFromDump, manifestSha256, type CatalogDump } from './manifest';
import { cueDefinitions, cueKey, tourPieces, type Rendered, type TourRendered } from './plan';
import { diffHtml, escapeHtml, wordDiff } from './phases/review';
import { Stage } from './stage';
import type { WalkingLegs } from '../WalkingLegs';

const identity = audioIdentity(Buffer.from('{"modelId":"openbmb/VoxCPM2","modelRevision":"' + 'a'.repeat(40) + '"}'), Buffer.from('wav'));
const key = rendererKeyOf(identity);
const P1 = '11111111-1111-4111-8111-111111111111', P2 = '22222222-2222-4222-8222-222222222222';

const dump = (): CatalogDump => ({ version: 1, createdAt: '2026-10-01T00:00:00Z', source: 'test', notAdmitted: [], tours: [{
  tour: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', language: 'es', city: 'Valencia', country: 'España', countryCode: 'ES', theme: 'history', introduction: 'Intro 1248', introductionSpokenText: null,
    metadata: { introductionAudioId: 'ia-old', catalogTitle: 'Valencia', pilotRelease: { fingerprint: 'fp-old' }, codexAuthor: { x: 1 } } },
  places: [{ id: P2, position: 1, name: 'Plaza', description: 'Texto 2', spokenText: null, latitude: 39.47, longitude: -0.37, metadata: { tourImages: { version: 1, sourceText: 'Texto 2', status: 'ready', images: [] } } },
    { id: P1, position: 0, name: 'Torres', description: 'Texto 1', spokenText: null, latitude: 39.48, longitude: -0.38, metadata: { nameInTourLanguage: 'Torres de Serranos' } }],
  rendererKey: key, audioVersions: { [P1]: 'v1', [P2]: 'v2' }, storedFingerprint: 'fp-old', admitted: true }] });

describe('the manifest', () => {
  it('orders the stops by position, takes the voice from the snapshot and is closed by its hash', () => {
    const m = manifestFromDump(dump(), 'run', 'local', new Date('2026-10-01T00:00:00Z'));
    expect(m.tours[0].places.map(p => p.placeId)).toEqual([P1, P2]);
    expect(m.tours[0]).toMatchObject({ rendererKey: key, fingerprint: 'fp-old', introductionAudioId: 'ia-old' });
    expect(m.tours[0].places[0].nameInTourLanguage).toBe('Torres de Serranos');
    expect(manifestSha256(m)).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestSha256(manifestFromDump(dump(), 'run', 'local', new Date('2026-10-01T00:00:00Z')))).toBe(manifestSha256(m));
  });
  it('refuses a snapshot without a voice, a fingerprint, an introduction or duplicate tours', () => {
    const noKey = dump(); noKey.tours[0].rendererKey = '';
    expect(() => manifestFromDump(noKey, 'r', 'local')).toThrow('lacks the voice');
    const noIntro = dump(); noIntro.tours[0].tour.introduction = ' ';
    expect(() => manifestFromDump(noIntro, 'r', 'local')).toThrow('incomplete');
    const twice = dump(); twice.tours.push(twice.tours[0]);
    expect(() => manifestFromDump(twice, 'r', 'local')).toThrow('Duplicate');
  });
  it('the cross-check compares the snapshot with what the public API serves', () => {
    const m = manifestFromDump(dump(), 'run', 'local');
    const served = { id: m.tours[0].tourId, introduction: 'Intro 1248', pilot: { version: 'fp-old' }, places: [{ id: P1, description: 'Texto 1', audioVersion: 'v1' }, { id: P2, description: 'Texto 2', audioVersion: 'v2' }] };
    expect(crossCheck(m, { [served.id]: served })).toEqual([]);
    expect(crossCheck(m, { [served.id]: { ...served, pilot: { version: 'other' }, places: [{ ...served.places[0], audioVersion: 'x' }, served.places[1]] } }).sort())
      .toEqual([served.id + ': audio version of ' + P1 + ' differs', served.id + ': fingerprint differs']);
    expect(crossCheck(m, {})[0]).toContain('not served');
    expect(crossCheck(m, { [served.id]: served, 'extra-tour': { ...served, id: 'extra-tour' } })[0]).toContain('missing from the snapshot');
  });
});

describe('assembling an update', () => {
  const m = manifestFromDump(dump(), 'run', 'local');
  const tour = m.tours[0];
  const bodies = { introduction: 'Intro nueva 1248', places: { [P1]: 'Cuerpo 1', [P2]: 'Cuerpo 2' } };
  const spoken = { introductionSpokenText: 'Intro nueva mil doscientos cuarenta y ocho', places: { [P1]: 'Cuerpo uno', [P2]: 'Cuerpo dos' },
    cues: Object.fromEntries(cueDefinitions(tour).map(c => [cueKey(c), c.text])) };
  const pieces = tourPieces('run', tour, bodies, spoken);
  const file = (p: { audioId: string }, n: number): Rendered => ({ audioId: p.audioId, jobId: 'job', storagePath: `voxcpm2/job/${p.audioId}.mp3`, durationSeconds: 3, fileSha256: n.toString(16).padStart(64, '0') });
  const rendered: TourRendered = { introduction: file(pieces[0], 1), places: {}, cues: {} };
  pieces.forEach((p, i) => { if (p.kind === 'stop') rendered.places[p.pieceId] = file(p, i + 10); else if (p.cue) rendered.cues[cueKey(p.cue)] = file(p, i + 10); });
  const legs: WalkingLegs = { version: 1, provider: 'p', computedAt: 'x', stopIds: [P1, P2], durationsSeconds: [[0, 5], [5, 0]], distancesMeters: [[0, 6], [6, 0]], geometries: { [P1 + '|' + P2]: '_p~iF~ps|U_ulLnnqC' } };
  const release = { authorizationReference: 'Pedro: "publica el lote"', reviewedAt: '2026-10-02T00:00:00Z' };
  const build = () => assembleTour({ tour, bodies, spokenIntroduction: spoken.introductionSpokenText, spokenPlaces: spoken.places, pieces, rendered, identity, speechVersion: 'speech-1', legs, release });

  it('writes the new content, and the previous block holds exactly the keys that change', () => {
    const { entry } = build();
    expect(entry.expectedCurrentFingerprint).toBe('fp-old');
    expect(entry.update.metadata.pilotRelease).toMatchObject({ approvalMode: 'owner-authorized', authorizationReference: 'Pedro: "publica el lote"', fingerprint: '', status: 'approved' });
    expect(entry.update.metadata.introductionAudioId).toBe(entry.update.introductionAudio.id);
    expect(entry.update.metadata.cueManifest.length).toBe(5);
    expect(entry.update.places.map(p => p.placeId)).toEqual([P1, P2]);
    expect(entry.update.places[1].tourImages?.sourceText).toBe('Cuerpo 2');           // photos follow the new description
    expect(entry.previous.introduction).toBe('Intro 1248');
    expect(entry.previous.metadata).toEqual({ orderFlexible: null, introductionAudioId: 'ia-old', cueManifest: null, walkingLegsSha256: null, pilotRelease: { fingerprint: 'fp-old' } });
    expect(entry.previous.places[1].tourImages).toMatchObject({ sourceText: 'Texto 2' });
    expect(entry.previous.places[0].tourImages).toBeNull();
  });

  it('keeps catalogTitle out of the update unless one is given, so it can never be deleted', () => {
    expect('catalogTitle' in build().entry.update.metadata).toBe(false);
    expect('catalogTitle' in build().entry.previous.metadata).toBe(false);
    const titled = assembleTour({ tour, bodies, spokenIntroduction: spoken.introductionSpokenText, spokenPlaces: spoken.places, pieces, rendered, identity, speechVersion: 'speech-1', legs, release, catalogTitle: 'Nuevo' });
    expect(titled.entry.previous.metadata.catalogTitle).toBe('Valencia');
  });

  it('refuses to assemble without the literal reference of the user, and sets the fingerprint without touching the rest', () => {
    expect(() => assembleTour({ tour, bodies, spokenIntroduction: '', spokenPlaces: spoken.places, pieces, rendered, identity, speechVersion: 's', legs, release: { ...release, authorizationReference: ' ' } })).toThrow('authorizationReference');
    const entry = build().entry, done = withFingerprint(entry, 'a'.repeat(64));
    expect(done.update.metadata.pilotRelease.fingerprint).toBe('a'.repeat(64));
    expect(entry.update.metadata.pilotRelease.fingerprint).toBe('');
    expect(done.update.cues).toBe(entry.update.cues);
  });
});

describe('the stage', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'stage-')); });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('opens the manifest once and never overwrites it', () => {
    const stage = new Stage(directory);
    stage.writeOnce({ a: 1 }, 'manifest.json');
    expect(() => stage.writeOnce({ a: 2 }, 'manifest.json')).toThrow(/EEXIST/);
    expect(stage.read<{ a: number }>('manifest.json').a).toBe(1);
  });

  it('a receipt binds the bytes of its files and the receipts it was built on', () => {
    const stage = new Stage(directory);
    stage.write({ version: 1, manifestSha256: 'm', excluded: {} }, 'state.json');
    const a = stage.write({ x: 1 }, 'manifest.json');
    stage.writeReceipt('snapshot', [a]);
    expect(stage.receiptProblem('snapshot')).toBeNull();
    const n = stage.write({ n: 1 }, 'neutral', 't1.json');
    stage.writeReceipt('neutralize', stage.list('neutral'));
    expect(stage.receiptProblem('neutralize')).toBeNull();
    stage.require('cues');                                                      // needs only the snapshot
    writeFileSync(n, '{"n":2}\n');
    expect(stage.receiptProblem('neutralize')).toContain('changed after neutralize ran');
    expect(() => stage.require('speech')).toThrow('Cannot run speech');
    stage.writeReceipt('neutralize', stage.list('neutral'));
    stage.writeReceipt('cues', [a]);
    stage.writeReceipt('speech', [n]);
    writeFileSync(a, '{"x":2}\n');                                              // the snapshot changes: everything built on it is stale
    expect(stage.receiptProblem('speech')).toBeTruthy();
    expect(() => stage.require('render')).toThrow('Cannot run render');
  });

  it('knows excluded tours, and approvals only from what the user wrote', () => {
    const stage = new Stage(directory);
    stage.write({ version: 1, manifestSha256: 'm', excluded: {} }, 'state.json');
    expect(stage.approved('sample-valencia')).toBeUndefined();
    stage.exclude('t1', 'speech', 'unresolved');
    expect(stage.isExcluded('t1')).toBe(true);
    writeFileSync(join(directory, 'approvals.json'), JSON.stringify({ approvals: [
      { scope: 'sample-valencia', decision: 'changes-requested' }, { scope: 'full-catalog', decision: 'approved', tours: ['t9'] }, { scope: 'sample-valencia', decision: 'approved' }] }));
    expect(stage.approved('sample-valencia')?.decision).toBe('approved');
    expect(stage.approved('full-catalog', 't1')).toBeUndefined();
    expect(stage.approved('full-catalog', 't9')).toBeDefined();
    expect(stage.approved('publish')).toBeUndefined();
    expect(existsSync(join(directory, 'approvals.json'))).toBe(true);
    expect(status(new Stage(join(directory, 'nothing-here')))).toMatchObject({ started: false });
  });
});

describe('the review page', () => {
  it('shows removed and added words and escapes everything', () => {
    expect(diffHtml('Aquí vamos. Después seguimos hacia la Giralda.', 'Aquí vamos.')).toBe('Aquí vamos. <del>Después seguimos hacia la Giralda.</del>');
    expect(diffHtml('a b c', 'a x c')).toBe('a <del>b </del><ins>x </ins>c');
    expect(diffHtml('<script>alert(1)</script>', '<b>')).toBe('<del>&lt;script&gt;alert(1)&lt;/script&gt;</del><ins>&lt;b&gt;</ins>');
    expect(escapeHtml(`"&'<>`)).toBe('&quot;&amp;&#39;&lt;&gt;');
    expect(wordDiff('', '').length).toBe(0);
    expect(wordDiff('x y', 'x y').every(o => o.op === 'same')).toBe(true);
    const joined = wordDiff('uno dos tres', 'uno tres cuatro').filter(o => o.op !== 'del').map(o => o.text).join('');
    expect(joined).toBe('uno tres cuatro');
  });
});

describe('guards and arguments', () => {
  it('only a database named for a rehearsal or a stage copy may be written to', () => {
    expect(assertDisposableDatabase('postgresql://u:p@localhost:5432/tour_guide_local_rehearsal?schema=public')).toBe('tour_guide_local_rehearsal');
    expect(assertDisposableDatabase('postgres://u@h/nomuvia_stage')).toBe('nomuvia_stage');
    for (const bad of ['postgresql://u:p@localhost/tour_guide_local', 'postgres://u@h/nomuvia', 'postgres://u@h/rehearsal_prod', undefined, 'not a url'])
      expect(() => assertDisposableDatabase(bad)).toThrow();
  });
  it('parses subcommands, lists and flags, and refuses what it does not know', () => {
    expect(parseArgs(['render', '--execute', '--max-hours', '6', '--languages', 'es, fr', '--stage', '/x'])).toEqual({ command: 'render',
      flags: { execute: true, 'max-hours': '6', languages: 'es, fr', stage: '/x' }, selection: { tours: undefined, languages: ['es', 'fr'], cities: undefined } });
    expect(() => parseArgs(['render', 'oops'])).toThrow('Unexpected argument');
    expect(() => parseArgs(['render', '--stage'])).toThrow('needs a value');
    expect(parseArgs([]).command).toBe('help');
  });
  it('legs and images run beside the render (their own lock); everything else waits for both', () => {
    expect(locksFor('render')).toEqual(['run.lock']);
    expect(locksFor('legs')).toEqual(['side.lock']);
    expect(locksFor('images')).toEqual(['side.lock']);
    expect(locksFor('speech')).toEqual(['run.lock', 'side.lock']);
    expect(locksFor('stage-local')).toEqual(['run.lock', 'side.lock']);
  });
  it('reads back what the rest of the code wrote', () => { expect(readFileSync(__filename, 'utf8')).toContain('describe'); });
});
