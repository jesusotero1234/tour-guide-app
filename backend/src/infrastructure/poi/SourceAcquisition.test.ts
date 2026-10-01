import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import axios from 'axios';
import { fetchCanonicalWikidataPois } from './WikidataCanonicalPoiFetcher';
const city = {osmType:'relation' as const,osmId:62782,wikidataId:null,displayName:'Hamburg',lat:53.55,lng:10,
  boundingBox:{minLat:53.3,maxLat:54,minLng:8,maxLng:10.4}};
describe('Optional canonical discovery provenance',()=>{
 let dir:string;
 beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'source-status-'));process.env.SOURCE_ACQUISITION_DIR=dir;jest.spyOn(console,'warn').mockImplementation(()=>undefined);});
 afterEach(()=>{delete process.env.SOURCE_ACQUISITION_DIR;jest.restoreAllMocks();rmSync(dir,{recursive:true,force:true});});
 it('distinguishes a valid empty result from an unavailable query',async()=>{
  const get=jest.spyOn(axios,'get').mockResolvedValueOnce({status:200,data:{results:{bindings:[]}}});
  expect(await fetchCanonicalWikidataPois(city,'history')).toEqual([]);
  let result=JSON.parse(readFileSync(join(dir,'canonical-wikidata.json'),'utf8'));
  expect(result.status).toBe('valid_empty');expect(result.optional).toBe(true);expect(result.queryHash).toHaveLength(64);
  get.mockRejectedValueOnce(new Error('timeout'));
  expect(await fetchCanonicalWikidataPois(city,'history')).toEqual([]);
  result=JSON.parse(readFileSync(join(dir,'canonical-wikidata.json'),'utf8'));
  expect(result.status).toBe('unavailable');expect(result.message).toBe('timeout');expect(result.count).toBeUndefined();
 });
 it('rejects HTTP 200 without bindings as unavailable',async()=>{
  jest.spyOn(axios,'get').mockResolvedValue({status:200,data:{results:{}}});
  await fetchCanonicalWikidataPois(city,'history');
  expect(JSON.parse(readFileSync(join(dir,'canonical-wikidata.json'),'utf8')).status).toBe('unavailable');
 });
});
