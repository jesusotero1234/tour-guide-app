import { enrichTourImages } from './enrichTourImages';
import { createImageModel } from './TourImageModel';
import { ContextualTourImages } from './ContextualTourImages';
import { CommonsImageCandidates } from './CommonsImageCandidates';
import { Place } from '../domain/entities/Place';
jest.mock('./TourImageModel');
const create = createImageModel as jest.Mock;
const place: Place = { id:'p',tourId:'t',name:'Palacio',description:'Mira el palacio.',position:0,latitude:1,longitude:1 };
beforeEach(() => jest.restoreAllMocks());
it('disabled configuration performs no requests and keeps tour text', async () => {
  create.mockReturnValue(null);
  const network = jest.spyOn(CommonsImageCandidates.prototype, 'find');
  const result = await enrichTourImages({ language:'es', places:[place], id:'tour' });
  expect(result.id).toBe('tour');
  expect(result.places[0].metadata?.tourImages?.reason).toBe('model-not-configured');
  expect(result.places[0].description).toBe(place.description);
  expect(network).not.toHaveBeenCalled();
});
it('invalid configuration preserves tour with a diagnostic', async () => {
  create.mockImplementation(() => { throw new Error('private config'); });
  const result = await enrichTourImages({ language:'es',places:[place] });
  expect(result.places[0].metadata?.tourImages?.reason).toBe('invalid-model-config');
});
it('limits image work to 12 stops and isolates stop failures', async () => {
  create.mockReturnValue({ complete:jest.fn() });
  const enrich = jest.spyOn(ContextualTourImages.prototype, 'enrich')
    .mockRejectedValueOnce(new Error('failure')).mockImplementation(async p => p);
  const result = await enrichTourImages({ language:'es', places:Array.from({length:14},()=>({...place})) });
  expect(enrich).toHaveBeenCalledTimes(12);
  expect(result.places[0].metadata?.tourImages?.reason).toBe('image-selection-failed');
  expect(result.places[12].metadata?.tourImages?.reason).toBe('place-limit');
});
it('propagates cancellation instead of saving after lease loss', async () => {
  create.mockReturnValue({ complete:jest.fn() });
  const controller = new AbortController();
  jest.spyOn(ContextualTourImages.prototype, 'enrich').mockImplementation(async p => { controller.abort(); return p; });
  await expect(enrichTourImages({language:'es',places:[place]},controller.signal)).rejects.toThrow();
});
