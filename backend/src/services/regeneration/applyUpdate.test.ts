import { applyTourUpdate, mergeMetadata, rollbackTourUpdate, type UpdateClient, type UpdateTx } from './applyUpdate';
import type { PackageTour } from './types';

/** In-memory stand-in for the database. $transaction really rolls back, which is what the importer relies on. */
function fakeDb(initial: { tours: Record<string, any>; places: Record<string, any> }) {
  const db = { tours: structuredClone(initial.tours), places: structuredClone(initial.places), audioAssets: [] as any[], intros: [] as any[], cues: [] as any[], legs: {} as Record<string, any>, failAt: '' };
  const make = (): UpdateTx => ({
    tour: { findUnique: async ({ where }) => db.tours[where.id] ? structuredClone(db.tours[where.id]) : null, update: async ({ where, data }) => { Object.assign(db.tours[where.id], structuredClone(data)); } },
    place: { findMany: async ({ where }) => Object.values(db.places).filter((p: any) => p.tourId === where.tourId).map((p: any) => structuredClone(p)),
      update: async ({ where, data }) => { if (db.failAt === where.id) throw new Error('boom ' + where.id); Object.assign(db.places[where.id], structuredClone(data)); } },
    audioAsset: { createMany: async ({ data, skipDuplicates }) => { for (const row of data) if (!(skipDuplicates && db.audioAssets.some(a => a.id === row.id))) db.audioAssets.push(row); },
      deleteMany: async ({ where }) => { db.audioAssets = db.audioAssets.filter(a => !where.id.in.includes(a.id)); } },
    tourIntroductionAudio: { createMany: async ({ data }) => { db.intros.push(...data); }, deleteMany: async ({ where }) => { db.intros = db.intros.filter(a => !(a.id === where.id && a.tourId === where.tourId)); } },
    tourCueAudio: { createMany: async ({ data }) => { db.cues.push(...data); }, deleteMany: async ({ where }) => { db.cues = db.cues.filter(a => !(where.id.in.includes(a.id) && a.tourId === where.tourId)); } },
    tourWalkingLegs: { upsert: async ({ where, create }) => { db.legs[where.tourId] = create; }, deleteMany: async ({ where }) => { delete db.legs[where.tourId]; } },
  });
  const client: UpdateClient = { ...make(), $transaction: async fn => {
    const snapshot = structuredClone({ tours: db.tours, places: db.places, audioAssets: db.audioAssets, intros: db.intros, cues: db.cues, legs: db.legs });
    try { return await fn(make()); } catch (error) { Object.assign(db, snapshot); throw error; }
  } };
  return { db, client };
}

const OLD = 'old-fingerprint', NEW = 'new-fingerprint';
const base = { tours: { t1: { id: 't1', introduction: 'Intro 1248', introductionSpokenText: null, metadata: { codexAuthor: { x: 1 }, catalogTitle: 'Valencia esencial', pilotWalkingRoute: { d: 1 }, pilotRelease: { fingerprint: OLD, changes: 'old' } } } },
  places: { p1: { id: 'p1', tourId: 't1', description: 'Texto 1', spokenText: null, metadata: { sourceCredits: { v: 1 }, tourImages: { version: 1, sourceText: 'Texto 1', status: 'ready', images: [] } } },
    p2: { id: 'p2', tourId: 't1', description: 'Texto 2', spokenText: null, metadata: { sourceCredits: { v: 2 } } } } };

const entry = (): PackageTour => ({ tourId: 't1', expectedCurrentFingerprint: OLD,
  update: { introduction: 'Intro neutra 1248', introductionSpokenText: 'Intro neutra mil doscientos cuarenta y ocho',
    metadata: { orderFlexible: true, introductionAudioId: 'ia', cueManifest: [{ kind: 'finish', text: 'Fin.', version: 'a.b' }], walkingLegsSha256: 'f'.repeat(64), pilotRelease: { fingerprint: NEW, changes: 'new' } as any },
    walkingLegs: { data: { version: 1 } as any, sha256: 'f'.repeat(64) },
    places: [{ placeId: 'p1', description: 'Cuerpo 1', spokenText: 'Cuerpo uno', tourImages: { version: 1, sourceText: 'Cuerpo 1', status: 'ready', images: [] } }, { placeId: 'p2', description: 'Cuerpo 2', spokenText: 'Cuerpo dos' }],
    audioAssets: [{ id: 'a1', placeId: 'p1', language: 'es', storagePath: 'voxcpm2/j/a1.mp3', durationSeconds: 10.4, metadata: {} }],
    introductionAudio: { id: 'ia', language: 'es', storagePath: 'voxcpm2/j/ia.mp3', durationSeconds: 5, metadata: {} },
    cues: [{ id: 'c1', kind: 'finish', language: 'es', text: 'Fin.', spokenText: 'Fin.', storagePath: 'voxcpm2/j/c1.mp3', durationSeconds: 2, metadata: {} }] },
  previous: { introduction: 'Intro 1248', introductionSpokenText: null,
    metadata: { orderFlexible: null, introductionAudioId: null, cueManifest: null, walkingLegsSha256: null, catalogTitle: 'Valencia esencial', pilotRelease: { fingerprint: OLD, changes: 'old' } },
    places: [{ placeId: 'p1', description: 'Texto 1', spokenText: null, tourImages: { version: 1, sourceText: 'Texto 1', status: 'ready', images: [] } as any }, { placeId: 'p2', description: 'Texto 2', spokenText: null, tourImages: null }] } });

const admitted = (fingerprint: string) => async () => ({ admitted: true, fingerprint });

describe('mergeMetadata', () => {
  it('assigns the given keys, keeps the rest, deletes on null and ignores undefined', () => {
    expect(mergeMetadata({ a: 1, b: 2, c: 3 }, { b: 20, c: null, d: undefined, e: 5 })).toEqual({ a: 1, b: 20, e: 5 });
    expect(mergeMetadata(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeMetadata([1], { a: 1 })).toEqual({ a: 1 });
  });
});

describe('applyTourUpdate', () => {
  it('updates the tour, keeps the metadata it does not own and writes every new row once', async () => {
    const { db, client } = fakeDb(base);
    expect(await applyTourUpdate(client, entry(), admitted(NEW))).toEqual({ tourId: 't1', status: 'updated' });
    expect(db.tours.t1.introduction).toBe('Intro neutra 1248');
    expect(db.tours.t1.introductionSpokenText).toBe('Intro neutra mil doscientos cuarenta y ocho');
    expect(db.tours.t1.metadata).toMatchObject({ codexAuthor: { x: 1 }, catalogTitle: 'Valencia esencial', pilotWalkingRoute: { d: 1 }, orderFlexible: true, introductionAudioId: 'ia', walkingLegsSha256: 'f'.repeat(64), pilotRelease: { fingerprint: NEW } });
    expect(db.places.p1).toMatchObject({ description: 'Cuerpo 1', spokenText: 'Cuerpo uno' });
    expect(db.places.p1.metadata).toMatchObject({ sourceCredits: { v: 1 }, tourImages: { sourceText: 'Cuerpo 1' } });
    expect(db.places.p2.metadata).toEqual({ sourceCredits: { v: 2 } });
    expect([db.audioAssets.length, db.intros.length, db.cues.length, Object.keys(db.legs).length]).toEqual([1, 1, 1, 1]);
    expect(db.audioAssets[0].durationSeconds).toBe(10);
    expect(db.cues[0]).toMatchObject({ tourId: 't1', placeId: null, kind: 'finish' });
  });

  it('skips, without writing, a tour that changed since the snapshot and one that is already updated', async () => {
    const { db, client } = fakeDb(base);
    db.tours.t1.metadata.pilotRelease.fingerprint = 'someone-else';
    expect(await applyTourUpdate(client, entry(), admitted(NEW))).toEqual({ tourId: 't1', status: 'skipped', reason: 'CHANGED_SINCE_SNAPSHOT' });
    expect(db.audioAssets).toEqual([]);
    expect(db.tours.t1.introduction).toBe('Intro 1248');
    db.tours.t1.metadata.pilotRelease.fingerprint = NEW;
    expect((await applyTourUpdate(client, entry(), admitted(NEW))).reason).toBe('ALREADY_APPLIED');
    expect((await applyTourUpdate(client, { ...entry(), tourId: 'nope' }, admitted(NEW))).reason).toBe('NOT_FOUND');
  });

  it('a failure in the middle rolls the whole tour back', async () => {
    const { db, client } = fakeDb(base);
    db.failAt = 'p2';
    const outcome = await applyTourUpdate(client, entry(), admitted(NEW));
    expect(outcome).toMatchObject({ status: 'failed', reason: 'boom p2' });
    expect(db.tours.t1).toEqual(base.tours.t1);
    expect(db.places.p1).toEqual(base.places.p1);
    expect([db.audioAssets.length, db.cues.length, Object.keys(db.legs).length]).toEqual([0, 0, 0]);
  });

  it('a tour that is not admitted after the commit is compensated on the spot', async () => {
    const { db, client } = fakeDb(base);
    const outcome = await applyTourUpdate(client, entry(), async () => ({ admitted: false, fingerprint: 'wrong' }));
    expect(outcome.status).toBe('compensated');
    expect(db.tours.t1).toEqual(base.tours.t1);
    expect(db.places.p1).toEqual(base.places.p1);
    expect(db.places.p2).toEqual(base.places.p2);
    expect([db.audioAssets.length, db.intros.length, db.cues.length, Object.keys(db.legs).length]).toEqual([0, 0, 0, 0]);   // the rows go, the files stay on disk
    const thrown = await applyTourUpdate(fakeDb(base).client, entry(), async () => { throw new Error('db down'); });
    expect(thrown.status).toBe('compensated');
    expect(thrown.reason).toContain('verify failed: db down');
  });

  it('applying twice is harmless', async () => {
    const { db, client } = fakeDb(base);
    await applyTourUpdate(client, entry(), admitted(NEW));
    expect((await applyTourUpdate(client, entry(), admitted(NEW))).status).toBe('skipped');
    expect(db.audioAssets.length).toBe(1);
  });
});

describe('rollbackTourUpdate', () => {
  it('restores text, metadata keys (removing the ones that did not exist) and photos', async () => {
    const { db, client } = fakeDb(base);
    await applyTourUpdate(client, entry(), admitted(NEW));
    expect(await rollbackTourUpdate(client, entry())).toMatchObject({ status: 'updated', reason: 'restored' });
    expect(db.tours.t1).toEqual(base.tours.t1);
    expect(db.places.p1).toEqual(base.places.p1);
    expect(db.places.p2).toEqual(base.places.p2);
    expect('orderFlexible' in db.tours.t1.metadata).toBe(false);
  });

  it('removes the rows it created and nothing else, so an old file with the same text hash is the one served again', async () => {
    const { db, client } = fakeDb(base);
    db.audioAssets.push({ id: 'old-a', placeId: 'p1', language: 'es', metadata: { sourceHash: 'same-text' } });
    db.intros.push({ id: 'old-i', tourId: 't1' });
    await applyTourUpdate(client, entry(), admitted(NEW));
    expect(db.audioAssets.map(a => a.id)).toEqual(['old-a', 'a1']);
    await rollbackTourUpdate(client, entry());
    expect(db.audioAssets.map(a => a.id)).toEqual(['old-a']);
    expect(db.intros.map(a => a.id)).toEqual(['old-i']);
  });

  it('refuses to undo what somebody else changed afterwards, and is idempotent', async () => {
    const { db, client } = fakeDb(base);
    await applyTourUpdate(client, entry(), admitted(NEW));
    db.tours.t1.metadata.pilotRelease.fingerprint = 'edited-later';
    expect((await rollbackTourUpdate(client, entry())).reason).toBe('CHANGED_AFTER_PUBLISH');
    db.tours.t1.metadata.pilotRelease.fingerprint = NEW;
    await rollbackTourUpdate(client, entry());
    expect((await rollbackTourUpdate(client, entry())).reason).toBe('ALREADY_RESTORED');
  });
});
