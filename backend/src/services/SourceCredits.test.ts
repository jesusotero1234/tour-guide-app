import { buildSourceCredits, assertBlueprintSources } from './SourceCredits';
import type { TourBlueprintSnapshot } from './TourBlueprint';
const capture = { sourceId: 'a', requestedUrl: 'https://es.wikipedia.org/wiki/Giralda', finalUrl: 'https://es.wikipedia.org/wiki/Giralda',
  title: 'Giralda', capturedAt: '2026-09-08T12:00:00Z', fingerprint: 'abc', content: 'PRIVATE CAPTURE',
  wikimediaRevision: { revisionId: 42, timestamp: '2026-09-01T00:00:00Z' } };
const snapshot = (captures = [capture]) => ({ checkpoint: { research: [{
  routeStopId: 'Q1', result: { status: 'sufficient', dossier: { sources: [{ sourceId: 'a' }] }, captures },
}] } }) as unknown as TourBlueprintSnapshot;
test('projects selected sources and revision without private capture text', () => {
  const value = buildSourceCredits(snapshot(), 'Q1');
  expect(value.items).toHaveLength(1);
  expect(value.items[0].revisionUrl).toContain('oldid=42');
  expect(value.items[0].license).toBe('CC BY-SA 4.0');
  expect(JSON.stringify(value)).not.toContain('PRIVATE CAPTURE');
  expect(() => assertBlueprintSources(snapshot())).not.toThrow();
});
test('a missing selected capture or restricted cached capture cannot pass admission', () => {
  expect(() => buildSourceCredits(snapshot([]), 'Q1')).toThrow('SOURCE_CAPTURE_MISSING');
  expect(() => buildSourceCredits(snapshot(), 'Q999')).toThrow('SOURCE_STOP_MISSING');
  expect(() => assertBlueprintSources(snapshot([{...capture, finalUrl: 'https://www.catedraldesevilla.es/'}]))).toThrow('SOURCE_USE_PENDING');
});
