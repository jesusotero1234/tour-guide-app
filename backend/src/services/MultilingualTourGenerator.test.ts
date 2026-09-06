import { MultilingualTourGenerator } from './MultilingualTourGenerator';
import { Tour } from '../domain/entities/Tour';
import { blueprintFixture, madridDestination, narratedFixture } from './TourBlueprint.test-support';
import { TourGenerationAttemptError, TourPhaseInput } from './CodexTourProcess';
import { TourBlueprint, TourBlueprintRepository } from './TourBlueprint';
import { TourRequest } from '../types/api';

function setup(ready = false, destination = madridDestination) {
  const snapshot = blueprintFixture(destination);
  let current = true;
  const base: TourBlueprint = { id: 'base-1', baseKey: 'key', revision: 1, status: ready ? 'ready' : 'preparing',
    snapshot: ready ? snapshot : null, revalidateAfter: new Date(Date.now() + 100000), leaseOwner: null, leaseExpiresAt: null,
    attemptCount: 1, accountedSpendUsd: 1.5, spendLimitUsd: 1.5 };
  const bases: TourBlueprintRepository = {
    revisionForRequest: jest.fn(async () => 1),
    acquire: jest.fn(async () => ({kind: base.status === 'ready' ? 'ready' as const : 'claimed' as const, blueprint: base, allowanceUsd: 1.5})),
    renew: jest.fn(async () => true),
    complete: jest.fn(async (_id,_owner,s) => { base.status = 'ready'; base.snapshot = s; return true; }),
    fail: jest.fn(async () => undefined),
    findById: jest.fn(async () => base),
    isCurrent: jest.fn(async () => current),
  };
  const tours = { save: jest.fn(async (t: any) => ({ ...t, id:'tour-' + t.language })) };
  const run = jest.fn(async (i: TourPhaseInput) => i.mode === 'prepare'
    ? { snapshot, costUsd: 0.4 }
    : { ...narratedFixture(snapshot, i.request, i.runId), costUsd: 0.1 });
  const resolver = jest.fn(async () => destination);
  const generator = new MultilingualTourGenerator(tours as any, bases, run, resolver);
  const request: TourRequest = { city:destination.city,country:destination.country,countryCode:destination.countryCode,theme:'history',language:'fr',durationMinutes:120 };
  return { snapshot,base,bases,tours,run,resolver,generator,request,invalidate:()=>{current=false;} };
}
describe('multilingual generation from shared evidence', () => {
  it('prepares once and creates a French draft with an independently audited language', async () => {
    const s=setup();
    const request=await s.generator.prepareRequest(s.request);
    const result=await s.generator.generateTextTour(request, undefined, undefined, {limitUsd:2});
    expect(s.run.mock.calls.map(([i])=>i.mode)).toEqual(['prepare','narrate']);
    expect(result).toEqual({id:'tour-fr',reviewRequired:true,accountedUsd:0.5});
    expect(s.tours.save.mock.calls[0][0]).toMatchObject({status:'review',language:'fr',blueprintId:'base-1'});
    expect(s.tours.save.mock.calls[0][0].introduction).toContain('En attente de révision');
  });
  it('reuses an existing Spanish base without researching or changing the route', async () => {
    const s=setup(true); const original=JSON.stringify(s.snapshot);
    await s.generator.generateTextTour(await s.generator.prepareRequest(s.request));
    expect(s.run.mock.calls.map(([i])=>i.mode)).toEqual(['narrate']);
    expect(JSON.stringify(s.snapshot)).toBe(original);
    expect(s.tours.save.mock.calls[0][0].places.map((p:any)=>p.metadata.sourcePoi.wikidata)).toEqual(['Q1','Q2']);
  });
  it('uses Japanese research context for another country and writes French', async () => {
    const s=setup(true,{...madridDestination,qid:'Q34600',city:'Kyoto',country:'Japan',countryCode:'JP',researchLanguages:['ja','en']});
    await s.generator.generateTextTour(await s.generator.prepareRequest(s.request));
    expect(s.run.mock.calls[0][0]).toMatchObject({request:{language:'fr',countryCode:'JP'},snapshot:{checkpoint:{route:{language:'ja'}}}});
  });
  it('keeps prepared evidence after narration fails and retries only narration', async () => {
    const s=setup();
    const normal=s.run.getMockImplementation()!;
    s.run.mockImplementation(async i=>{if(i.mode==='narrate')throw new TourGenerationAttemptError('provider failure',0.2);return normal(i);});
    const request=await s.generator.prepareRequest(s.request);
    const error = await s.generator.generateTextTour(request).catch(e => e);
    expect(error.accountedUsd).toBeCloseTo(0.6);
    expect(s.base.status).toBe('ready');
    expect(s.bases.fail).not.toHaveBeenCalled();
    s.run.mockClear();s.run.mockImplementation(normal);
    await s.generator.generateTextTour(request);
    expect(s.run.mock.calls.map(([i])=>i.mode)).toEqual(['narrate']);
  });
  it('does not save a narration if its base was invalidated while writing',async()=>{
    const s=setup(true); const normal=s.run.getMockImplementation()!;
    s.run.mockImplementation(async i=>{const r=await normal(i);s.invalidate();return r;});
    await expect(s.generator.generateTextTour(await s.generator.prepareRequest(s.request))).rejects.toThrow('INVALIDATED');
    expect(s.tours.save).not.toHaveBeenCalled();
  });
  it('rejects a wrong language or mismatched evidence result',async()=>{
    const s=setup(true);
    s.run.mockImplementation(async i=>{
      const r=narratedFixture(s.snapshot,i.request,i.runId);
      r.author.stops[0].audit.value.languageReview.matchesRequestedLanguage=false;
      return {...r,costUsd:0.1};
    });
    await expect(s.generator.generateTextTour(await s.generator.prepareRequest(s.request))).rejects.toThrow('matchesRequestedLanguage');
    expect(s.tours.save).not.toHaveBeenCalled();
  });
  it('rejects route changes even when the worker repeats the base fingerprint', async () => {
    const s = setup(true);
    s.run.mockImplementation(async i => {
      const r = JSON.parse(JSON.stringify(narratedFixture(s.snapshot, i.request, i.runId)));
      r.review.route.stops[0].coordinates.lat += 1;
      return { ...r, costUsd: 0.1 };
    });
    await expect(s.generator.generateTextTour(await s.generator.prepareRequest(s.request))).rejects.toThrow('changed the prepared route');
    expect(s.tours.save).not.toHaveBeenCalled();
  });
  it('does not trust a destination supplied by the caller',async()=>{
    const s=setup();
    const r=await s.generator.prepareRequest({...s.request,destination:{...madridDestination,qid:'Q99'},blueprintRevision:99});
    expect(s.resolver).toHaveBeenCalledTimes(1);
    expect(r.destination?.qid).toBe('Q2807');expect(r.blueprintRevision).toBe(1);
  });
  it('does not reuse legacy text without an evidence base',async()=>{
    const s=setup(true);
    expect(await s.generator.isReusableTour({metadata:{generationPipeline:s.generator.pipelineVersion}} as any)).toBe(false);
    const tour:any={blueprintId:'base-1',metadata:{generationPipeline:s.generator.pipelineVersion,codexAuthor:{blueprintFingerprint:s.snapshot.fingerprint}}};
    expect(await s.generator.isReusableTour(tour)).toBe(true);
    s.invalidate();expect(await s.generator.isReusableTour(tour)).toBe(false);
  });
});
