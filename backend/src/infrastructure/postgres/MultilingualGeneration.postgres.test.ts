import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PostgresTourBlueprintRepository } from './PostgresTourBlueprintRepository';
import { PostgresTourRepository } from './PostgresTourRepository';
import { PostgresGenerationJobRepository } from './PostgresGenerationJobRepository';
import { MultilingualTourGenerator } from '../../services/MultilingualTourGenerator';
import { GenerationJobService } from '../../services/GenerationJobService';
import { TourGenerationAttemptError, TourPhaseInput } from '../../services/CodexTourProcess';
import { blueprintFixture, madridDestination, narratedFixture } from '../../services/TourBlueprint.test-support';

const suite = process.env.RUN_POSTGRES_TESTS === 'true' ? describe : describe.skip;
suite('multilingual persistence and concurrency on real PostgreSQL', () => {
  const schema = 'test_multilingual_' + randomUUID().replace(/-/g,'');
  let root: PrismaClient, db: PrismaClient, bases: PostgresTourBlueprintRepository;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('schema',schema);
    root = new PrismaClient(); await root.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
    execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','push','--skip-generate'],{
      env:{...process.env,DATABASE_URL:url.toString()},stdio:'pipe',timeout:30000,
    });
    db = new PrismaClient({datasources:{db:{url:url.toString()}}});
    bases = new PostgresTourBlueprintRepository(db);
  },40000);
  afterAll(async () => {
    await db?.$disconnect();
    if(root){await root.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');await root.$disconnect();}
  });
  beforeEach(async()=>{ await db.generationJob.deleteMany();await db.tour.deleteMany();await db.tourBlueprint.deleteMany(); });
  it('claims a base once across independent owners and rejects stale completion',async()=>{
    const claims=await Promise.all(Array.from({length:8},(_,i)=>bases.acquire('shared','owner'+i,1.5)));
    expect(claims.filter(c=>c.kind==='claimed')).toHaveLength(1);
    expect(claims.filter(c=>c.kind==='waiting')).toHaveLength(7);
    const winner=claims.find(c=>c.kind==='claimed')!;
    expect(await bases.complete(winner.blueprint.id,'not-owner',blueprintFixture(),0.3)).toBe(false);
    expect(await bases.renew(winner.blueprint.id,winner.blueprint.leaseOwner!)).toBe(true);
    expect(await bases.complete(winner.blueprint.id,winner.blueprint.leaseOwner!,blueprintFixture(),0.3)).toBe(true);
    expect((await bases.acquire('shared','other',1.5)).kind).toBe('ready');
    expect(await bases.complete(winner.blueprint.id,winner.blueprint.leaseOwner!,blueprintFixture(),0)).toBe(false);
  });
  it('keeps previous ready evidence immutable when creating an expired-base revision',async()=>{
    const c=await bases.acquire('expired','one',1.5);
    await bases.complete(c.blueprint.id,'one',blueprintFixture(),0.2);
    await db.tourBlueprint.update({where:{id:c.blueprint.id},data:{revalidateAfter:new Date(0)}});
    expect(await bases.revisionForRequest('expired')).toBe(2);
    const second=await bases.acquire('expired','two',1.5);
    expect(second.blueprint.revision).toBe(2);
    expect(await bases.isCurrent(c.blueprint.id)).toBe(false);
    expect((await bases.findById(c.blueprint.id))?.snapshot?.fingerprint).toBe(blueprintFixture().fingerprint);
  });
  it('retains unknown spend on lease expiry and refuses unbounded retry',async()=>{
    const c=await bases.acquire('lost','one',1);
    await db.tourBlueprint.update({where:{id:c.blueprint.id},data:{leaseExpiresAt:new Date(0)}});
    expect(await bases.renew(c.blueprint.id,'one')).toBe(false);
    expect(await bases.complete(c.blueprint.id,'one',blueprintFixture(),0)).toBe(false);
    await expect(bases.acquire('lost','two',1)).rejects.toThrow('BLUEPRINT_BUDGET_EXHAUSTED');
  });
  async function waitJob(service:GenerationJobService,id:string){
    for(let i=0;i<100;i++){const job=await service.get(id);if(job?.status==='completed'||job?.status==='failed')return job;await new Promise(r=>setTimeout(r,40));}
    throw new Error('job timeout');
  }
  it('shares one preparation between Spanish and French and reuses the completed French job',async()=>{
    const snapshot=blueprintFixture();
    const run=jest.fn(async(i:TourPhaseInput)=>{
      if(i.mode==='prepare'){await new Promise(r=>setTimeout(r,100));return {snapshot,costUsd:0.25};}
      return {...narratedFixture(snapshot,i.request,i.runId),costUsd:0.1};
    });
    const tours=new PostgresTourRepository(db), jobs=new PostgresGenerationJobRepository(db);
    const makeService=()=>new GenerationJobService(jobs,tours,new MultilingualTourGenerator(tours,bases,run,async()=>madridDestination));
    const a=makeService(),b=makeService();
    const request={city:'Madrid',country:'Spain',countryCode:'ES',theme:'history',language:'es',durationMinutes:120};
    const [es,fr]=await Promise.all([a.create(request),b.create({...request,language:'fr'})]);
    const completed=await Promise.all([waitJob(a,es.id),waitJob(b,fr.id)]);
    expect(completed.map(j=>j?.status)).toEqual(['completed','completed']);
    expect(run.mock.calls.filter(([i])=>i.mode==='prepare')).toHaveLength(1);
    expect(run.mock.calls.filter(([i])=>i.mode==='narrate')).toHaveLength(2);
    const stored=await db.tour.findMany();
    expect(stored).toHaveLength(2);expect(new Set(stored.map(t=>t.blueprintId)).size).toBe(1);
    expect(stored.every(t=>t.status==='review')).toBe(true);
    const calls=run.mock.calls.length;
    const reused=await a.create({...request,city:'Madrid alias',language:'fr-FR'});
    expect(reused.id).toBe(fr.id);expect(reused.status).toBe('completed');expect(run).toHaveBeenCalledTimes(calls);
    expect((await db.generationJob.findUniqueOrThrow({where:{id:fr.id}})).accountedSpendUsd).toBeGreaterThanOrEqual(0.1);
  },12000);
  it('persists failure cost and retries narration without preparing again',async()=>{
    const snapshot=blueprintFixture();let fail=true;
    const run=jest.fn(async(i:TourPhaseInput)=>{
      if(i.mode==='prepare')return {snapshot,costUsd:0.3};
      if(fail)throw new TourGenerationAttemptError('test provider failed',0.1);
      return {...narratedFixture(snapshot,i.request,i.runId),costUsd:0.15};
    });
    const tours=new PostgresTourRepository(db), jobs=new PostgresGenerationJobRepository(db);
    const service=new GenerationJobService(jobs,tours,new MultilingualTourGenerator(tours,bases,run,async()=>madridDestination));
    const request={city:'Madrid',country:'Spain',countryCode:'ES',theme:'history',language:'fr',durationMinutes:120};
    const first=await service.create(request);expect((await waitJob(service,first.id))?.status).toBe('failed');
    expect((await jobs.findById(first.id))?.accountedSpendUsd).toBeCloseTo(0.4);
    fail=false;await service.create(request);
    expect((await waitJob(service,first.id))?.status).toBe('completed');
    expect(run.mock.calls.filter(([i])=>i.mode==='prepare')).toHaveLength(1);
    expect((await jobs.findById(first.id))?.attemptCount).toBe(2);
    expect((await jobs.findById(first.id))?.accountedSpendUsd).toBeCloseTo(0.55);
  },12000);
});
