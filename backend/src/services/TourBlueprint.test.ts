import { parseTourBlueprintSnapshot, tourBaseKey } from './TourBlueprint';
import { blueprintFixture, madridDestination } from './TourBlueprint.test-support';
import { narrativeFingerprintV6 } from './poi/NarrativeContractsV6';
const rehash = (s: any) => { const { fingerprint, ...data } = s; s.fingerprint = narrativeFingerprintV6(data); return s; };
describe('durable tour evidence', () => {
  it('roundtrips evidence and strips diagnostic logs', () => {
    const s = blueprintFixture();
    expect(parseTourBlueprintSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(s.checkpoint.research.every(r => r.result.captureLog.length === 0)).toBe(true);
    expect(s.checkpoint.research[0].result).toHaveProperty('dossier.sources.0.sourceLanguage', 'es');
  });
  it('preserves referenceProvenance through snapshot serialization', () => {
    const s = blueprintFixture();
    const roundtripped = parseTourBlueprintSnapshot(JSON.parse(JSON.stringify(s)));
    expect(roundtripped.checkpoint.research[0].result.captures[0]).toHaveProperty('referenceProvenance');
    expect(roundtripped.checkpoint.research[0].result.captures[0].referenceProvenance).toEqual(s.checkpoint.research[0].result.captures[0].referenceProvenance);
  });
  it('rejects tampering even when only the outer digest is recomputed', () => {
    const s: any = blueprintFixture();
    s.checkpoint.research[0].result.dossier.passages[0].quote = 'Invented history';
    expect(() => parseTourBlueprintSnapshot(s)).toThrow('fingerprint');
    expect(() => parseTourBlueprintSnapshot(rehash(s))).toThrow('evidence boundary');
  });
  it.each([
    ['order', (s: any) => { s.checkpoint.route.stops[0].position = 1; }],
    ['coordinates', (s: any) => { s.checkpoint.route.stops[0].coordinates.lat = 300; }],
    ['target', (s: any) => { s.checkpoint.narrationTargets.pop(); }],
    ['destination', (s: any) => { s.destination.country = 'France'; }],
    ['leg', (s: any) => { s.geometry.legs[0].toStopId = 'Q99'; }],
  ])('rejects inconsistent %s', (_name, mutate) => {
    const s: any = blueprintFixture(); mutate(s);
    const { fingerprint, ...route } = s.checkpoint.route;
    s.checkpoint.route.fingerprint = narrativeFingerprintV6(route);
    expect(() => parseTourBlueprintSnapshot(rehash(s))).toThrow();
  });
  it('keys the destination and requested route, independently of visitor language and city alias', () => {
    const r = { theme: 'history', durationMinutes: 120 };
    const key = tourBaseKey(madridDestination, r);
    expect(tourBaseKey({ ...madridDestination, city: 'Madrid alias' }, r)).toBe(key);
    expect(tourBaseKey({ ...madridDestination, qid: 'Q34600', countryCode: 'JP' }, r)).not.toBe(key);
    expect(tourBaseKey(madridDestination, { ...r, durationMinutes: 60 })).not.toBe(key);
    expect(tourBaseKey(madridDestination, { ...r, theme: 'art' })).not.toBe(key);
  });
  it('does not relabel original Spanish sources when research uses Japanese', () => {
    const s = blueprintFixture({ ...madridDestination, qid: 'Q34600', city: 'Kyoto', country: 'Japan', countryCode: 'JP', researchLanguages: ['ja', 'en'] });
    expect(s.checkpoint.route.language).toBe('ja');
    expect(s.checkpoint.research[0].result).toHaveProperty('dossier.language', 'ja');
    expect(s.checkpoint.research[0].result).toHaveProperty('dossier.sources.0.sourceLanguage', 'es');
  });
});
