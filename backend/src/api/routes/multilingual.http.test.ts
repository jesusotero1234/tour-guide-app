jest.mock('../../services/generationJobServiceInstance', () => ({
  generationJobService: { create: jest.fn(), get: jest.fn() },
}));
jest.mock('../controllers/tours', () => ({
  generateTour: jest.fn(), generateTourFromConcept: jest.fn(), getTour: jest.fn(),
  getWalkingRoute: jest.fn(), listTours: jest.fn(),
}));
import express from 'express';
import { Server } from 'node:http';
import router from './tours';
import { generationJobService } from '../../services/generationJobServiceInstance';

let server: Server;
let origin: string;
const oldFlag = process.env.TOUR_FRENCH_ENABLED;
const request = { city:'Madrid', country:'Spain', countryCode:'ES', theme:'history', language:'fr-FR', durationMinutes:120 };
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use('/tours', router);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + (server.address() as {port:number}).port;
});
afterAll(async () => {
  if (oldFlag === undefined) delete process.env.TOUR_FRENCH_ENABLED; else process.env.TOUR_FRENCH_ENABLED = oldFlag;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => { jest.clearAllMocks(); process.env.TOUR_FRENCH_ENABLED = 'false'; });
const post = (body = request) => fetch(origin + '/tours/generation-jobs', {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
});
it('advertises all five languages even when the old French flag is disabled', async () => {
  expect(await (await fetch(origin + '/tours/generation-capabilities')).json()).toMatchObject({languages:['es','fr','en','de','it']});
});
it.each([['es-ES','es'], ['fr-FR','fr'], ['EN_gb','en'], ['de-DE','de'], ['it-IT','it']])('accepts %s, normalizes its locale and strips internal identities', async (input, language) => {
  (generationJobService.create as jest.Mock).mockResolvedValue({id:'job',status:'queued'});
  const response = await post({...request, language:input, destination:{qid:'Q999'}, blueprintRevision:99} as any);
  expect(response.status).toBe(202);
  expect(generationJobService.create).toHaveBeenCalledWith({...request,language});
});
it('returns a destination review error instead of starting an ambiguous tour', async () => {
  (generationJobService.create as jest.Mock).mockRejectedValue(new Error('DESTINATION_REVIEW_REQUIRED: ambiguous city'));
  expect((await post()).status).toBe(422);
});
it('returns completed review drafts without claiming publication', async () => {
  (generationJobService.create as jest.Mock).mockResolvedValue({id:'job',status:'completed',result:{tourId:'tour',reviewRequired:true}});
  const response = await post();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({result:{tourId:'tour',reviewRequired:true}});
});
it('rejects unsupported locales before creating work', async () => {
  expect((await post({...request,language:'ja'})).status).toBe(400);
  expect(generationJobService.create).not.toHaveBeenCalled();
});
