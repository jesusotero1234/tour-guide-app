import { ContextualTourImages } from './ContextualTourImages';
import { Place } from '../domain/entities/Place';
import { TourImageCandidate } from '../domain/entities/TourImage';
const place: Place = { id: 'p', tourId: 't', name: 'Palacio', description: 'Mira el palacio.\n\nFíjate en el escudo.',
  position: 0, latitude: 40, longitude: -3, metadata: { sourcePoi: { wikidata: 'Q123' }, nameInTourLanguage: 'Palace' } };
const candidate = (id: string): TourImageCandidate => ({ id, entityId: 'Q123', identityEvidence: 'wikidata-p18',
  title: id, description: 'Palacio', url: 'https://upload.wikimedia.org/' + id + '.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:' + id + '.jpg', author: 'Ana', attribution: 'Ana',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', width: 1000, height: 800 });
const reference = (role = 'primary', paragraphIndex = 0) => ({ role, paragraphIndex, entityId: 'Q123', subject: 'Palacio', caption: 'Palacio', alt: 'Vista del palacio' });
const selection = (role = 'primary', candidateId = 'a') => ({ role, candidateId, identityMatches: true, featureVisible: true, currentPhoto: true, unambiguous: true, reason: 'Visible and matches documented identity.' });
function setup(refs: unknown[] = [reference(), reference('detail', 1)], selections: unknown[] = [selection(), selection('detail', 'b')]) {
  const model = { complete: jest.fn().mockResolvedValueOnce({ references: refs }).mockResolvedValueOnce({ selections }) };
  const provider = { find: jest.fn().mockResolvedValue([candidate('a'), candidate('b')]) };
  return { model, provider, service: new ContextualTourImages(model, provider) };
}
it('anchors at separate paragraphs, keeps credits and preserves narration metadata', async () => {
  const { service, model, provider } = setup();
  const result = await service.enrich(place, 'es');
  expect(result.description).toBe(place.description);
  expect(result.metadata?.nameInTourLanguage).toBe('Palace');
  expect(result.metadata?.tourImages?.images).toEqual([
    expect.objectContaining({ role: 'primary', paragraphIndex: 0, paragraphText: 'Mira el palacio.', author: 'Ana' }),
    expect.objectContaining({ role: 'detail', paragraphIndex: 1, paragraphText: 'Fíjate en el escudo.' }),
  ]);
  expect(model.complete).toHaveBeenCalledTimes(2);
  expect(provider.find).toHaveBeenCalledWith('Q123', expect.any(AbortSignal));
});
it.each([
  [{ ...selection(), identityMatches: false }],
  [{ ...selection(), featureVisible: false }],
  [{ ...selection(), currentPhoto: false }],
  [{ ...selection(), unambiguous: 'true' }],
  [{ ...selection(), candidateId: 'invented' }],
  [selection('detail', 'b')],
])('omits uncertain/wrong/historical/orphan selection %#', async (...selections) => {
  const { service } = setup(undefined, selections);
  expect((await service.enrich(place, 'es')).metadata?.tourImages?.images).toEqual([]);
});
it('limits duplicate roles and forbids repeating primary image as detail', async () => {
  const { service } = setup([reference(), reference(), reference('detail', 1)], [selection(), selection(), selection('detail', 'a')]);
  expect((await service.enrich(place, 'es')).metadata?.tourImages?.images).toHaveLength(1);
});
it.each([
  [{ ...reference(), entityId: 'Q999' }],
  [{ ...reference(), paragraphIndex: 30 }],
  [{ ...reference(), paragraphIndex: 0.5 }],
  [{ ...reference(), caption: '' }],
  [reference('detail', 1)],
])('rejects invented entity/invalid paragraph/missing primary %#', async (...refs) => {
  const { service, provider } = setup(refs);
  expect((await service.enrich(place, 'es')).metadata?.tourImages?.images).toEqual([]);
  expect(provider.find).not.toHaveBeenCalled();
});
it('reuses ready exact text and invalidates changed narration', async () => {
  const { service, model } = setup();
  const first = await service.enrich(place, 'es');
  expect(await service.enrich(first, 'es')).toBe(first);
  expect(model.complete).toHaveBeenCalledTimes(2);
  const next = setup();
  const changed = await next.service.enrich({ ...first, description: 'Otro texto.' }, 'es');
  expect(next.model.complete).toHaveBeenCalled();
  expect(changed.metadata?.tourImages?.sourceText).toBe('Otro texto.');
});
it('does not fetch without configuration or identity', async () => {
  const { model, provider } = setup();
  const disabled = await new ContextualTourImages(null, provider).enrich(place, 'es');
  expect(disabled.metadata?.tourImages?.status).toBe('disabled');
  await new ContextualTourImages(model, provider).enrich({ ...place, metadata: {} }, 'es');
  expect(model.complete).not.toHaveBeenCalled(); expect(provider.find).not.toHaveBeenCalled();
});
it('turns provider/model failure into omission and propagates caller cancellation', async () => {
  const { model, service } = setup(); model.complete.mockReset().mockRejectedValue(new Error('secret provider detail'));
  const result = await service.enrich(place, 'es');
  expect(result.metadata?.tourImages?.reason).toBe('image-selection-failed');
  expect(JSON.stringify(result)).not.toContain('secret');
  const controller = new AbortController(); controller.abort();
  await expect(service.enrich(place, 'es', controller.signal)).rejects.toThrow();
});
it('omits on its deadline even when the model ignores cancellation', async () => {
  jest.useFakeTimers();
  try {
    const model = { complete: jest.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 61000)); return { references: [reference()] };
    }) };
    const provider = { find: jest.fn() };
    const running = new ContextualTourImages(model, provider).enrich(place, 'es');
    await jest.advanceTimersByTimeAsync(61000);
    expect((await running).metadata?.tourImages?.reason).toBe('deadline');
    expect(provider.find).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
