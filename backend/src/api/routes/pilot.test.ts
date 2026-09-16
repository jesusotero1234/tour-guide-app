import express from 'express';
import type { Server } from 'node:http';
let server: Server | undefined;
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPilotRouter } from './pilot';
import { pilotFingerprint } from '../../services/PilotRelease';
import { buildSourceCredits } from '../../services/SourceCredits';
import { SOURCE_POLICY_VERSION } from '../../services/poi/SourceUsePolicy';
import type { Tour } from '../../domain/entities/Tour';
import type { TourAudioState } from '../../services/TourAudioService';
import type { TourBlueprintSnapshot, TourBlueprintRepository } from '../../services/TourBlueprint';
import type { TourRepository } from '../../domain/repositories/TourRepository';
const key = 'pilot-test-key-is-at-least-32-characters';
const id = '11111111-1111-4111-8111-111111111111';
const stopIds = ['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'pilot-http-')); await writeFile(join(dir,'test.mp3'), '0123456789'); });
afterAll(async () => { await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); await rm(dir, { recursive: true, force: true }); });
test('private HTTP delivery, ranges, withdrawals and version invalidation use the same admission gate', async () => {
  const old = process.env.PILOT_API_KEY; process.env.PILOT_API_KEY = key;
  try {
    const snapshot = { fingerprint: 'base-v1', checkpoint: { research: stopIds.map((_,i) => ({
      routeStopId: 'Q' + (i+1), result: { status: 'sufficient', dossier: { sources: [{ sourceId: 'a' }] },
        captures: [{ sourceId: 'a', requestedUrl: 'https://es.wikipedia.org/wiki/Giralda', finalUrl: 'https://es.wikipedia.org/wiki/Giralda',
          title: 'Giralda', capturedAt: '2026-01-01T00:00:00Z', content: 'PRIVATE CAPTURE' }] }
    })) } } as unknown as TourBlueprintSnapshot;
    const tour = { id, blueprintId: id, city:'Sevilla',country:'España',countryCode:'ES',theme:'history',language:'es',
      durationMinutes:60,status:'published',introduction:'Introducción',createdAt:'2026-01-01',updatedAt:'2026-01-01',
      places: stopIds.map((stop,i) => ({ id:stop,tourId:id,name:'Parada',description:'Texto',position:i,latitude:37,longitude:-5,
        metadata:{ sourcePoi:{wikidata:'Q'+(i+1)},sourceCredits:buildSourceCredits(snapshot,'Q'+(i+1)) } })),
      metadata:{ codexAuthor:{blueprintFingerprint:'base-v1',legs:[]},pilotWalkingRoute:{provider:'fossgis-osrm-foot',
        geometry:{type:'LineString',coordinates:[[-5,37],[-5.01,37.01]]},distanceMeters:100,durationSeconds:120} }
    } as unknown as Tour;
    const state: TourAudioState = {tourId:id,status:'completed',phase:'completed',completedStops:2,totalStops:2,
      audioUrls:Object.fromEntries(stopIds.map(s=>[s,'/api/backend/tours/'+id+'/audio/'+s])),
      audioVersions:Object.fromEntries(stopIds.map(s=>[s,'v1'])),transcripts:Object.fromEntries(stopIds.map(s=>[s,'Texto']))};
    tour.metadata!.pilotRelease = {version:1,status:'approved',reviewedBy:'PRIVATE REVIEWER',reviewedAt:'2026-01-01',
      fingerprint:pilotFingerprint(tour,state),sourcePolicy:SOURCE_POLICY_VERSION,scriptLicense:'CC BY-SA 4.0',changes:'Adaptación',
      checks:{text:true,audio:true,route:true,rights:true}};
    let open = true, current = true;
    const audioFile = jest.fn(async () => join(dir,'test.mp3'));
    const app = express().use(createPilotRouter(
      {findById:async()=>tour,list:async()=>[tour]} as unknown as TourRepository,
      {isCurrent:async()=>current,findById:async()=>({snapshot})} as unknown as TourBlueprintRepository,
      {get:async()=>state,audioFile}, async()=>open));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const port = (server.address() as {port:number}).port;
    const hit = async (path: string, auth = true, range = false, method = 'GET') => {
      const res = await fetch('http://127.0.0.1:' + port + path, { method, headers: { ...(auth ? {'X-API-Key':key} : {}), ...(range ? {Range:'bytes=0-3'} : {}) } });
      const text = await res.text(); let body; try { body = JSON.parse(text); } catch {}
      return { status:res.status, headers:Object.fromEntries(res.headers), text, body };
    };
    const paths=['/tours','/tours/'+id,'/tours/'+id+'/walking-route','/tours/'+id+'/audio','/tours/'+id+'/provenance','/tours/'+id+'/audio/'+stopIds[0]];
    for(const path of paths) expect((await hit(path,false)).status).toBe(401);
    expect((await hit('/tours/'+id+'/audio',true,false,'POST')).status).toBe(405);
    for(const path of paths) {
      const response=await hit(path);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.text ?? '').not.toMatch(/PRIVATE REVIEWER|PRIVATE CAPTURE/);
    }
    const range=await hit(paths[5],true,true);
    expect(range.status).toBe(206); expect(range.headers['content-range']).toBe('bytes 0-3/10');
    expect(range.headers.link).toContain('/provenance');
    for(const change of ['withdraw','text','audio','base','closed']) {
      const fingerprint=tour.metadata!.pilotRelease!.fingerprint;
      if(change==='withdraw') tour.metadata!.pilotRelease!.status='withdrawn';
      if(change==='text') tour.places[0].description+=' changed';
      if(change==='audio') state.audioVersions![stopIds[0]]='v2';
      if(change==='base') current=false;
      if(change==='closed') open=false;
      const calls=audioFile.mock.calls.length;
      for(const path of paths.slice(1)) expect((await hit(path,true,true)).status).toBe(change==='closed'?503:404);
      expect(audioFile.mock.calls.length).toBe(calls);
      const list=await hit('/tours');
      if(change!=='closed') expect(list.body.data.total).toBe(0);
      tour.metadata!.pilotRelease!.status='approved';tour.metadata!.pilotRelease!.fingerprint=fingerprint;
      tour.places[0].description='Texto';state.audioVersions![stopIds[0]]='v1';current=true;open=true;
    }
  } finally { if(old===undefined) delete process.env.PILOT_API_KEY; else process.env.PILOT_API_KEY=old; }
});
