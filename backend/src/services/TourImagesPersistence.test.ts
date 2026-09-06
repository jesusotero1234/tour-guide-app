import { PrismaClient } from '@prisma/client';
import { PostgresTourRepository } from '../infrastructure/postgres/PostgresTourRepository';
import { Tour } from '../domain/entities/Tour';
it('round-trips image metadata through the existing JSON persistence without a migration', async () => {
  const now = new Date('2026-09-06T00:00:00Z');
  const image = {id:'image',role:'primary',paragraphIndex:0,paragraphText:'Mira el palacio.',author:'Ana',
    attribution:'Ana',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'};
  const metadata = { sourcePoi:{wikidata:'Q123'}, tourImages:{version:1,sourceText:'Mira el palacio.',status:'ready',images:[image]} };
  const tx = {
    tour:{create:jest.fn(async ({data})=>({...data,id:'tour',createdAt:now,updatedAt:now}))},
    place:{create:jest.fn(async ({data})=>({...data,id:'place',createdAt:now,updatedAt:now}))},
  };
  const client = {$transaction:jest.fn(async callback=>callback(tx))};
  const repo = new PostgresTourRepository(client as unknown as PrismaClient);
  const input = {id:'',city:'Madrid',country:'España',countryCode:'ES',language:'es',theme:'history',durationMinutes:60,
    createdAt:now.toISOString(),places:[{id:'',tourId:'',name:'Palacio',description:'Mira el palacio.',latitude:1,longitude:2,position:0,metadata}]} as unknown as Tour;
  const saved = await repo.save(input);
  expect(saved.places[0].metadata).toEqual(metadata);
  expect(saved.places[0].description).toBe(metadata.tourImages.sourceText);
});
