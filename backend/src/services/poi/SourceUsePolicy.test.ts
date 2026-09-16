import { FirecrawlNarrativeCaptureProviderV7 } from './NarrativeSourcesV7';
import { sourceUse, assertWebCaptureAllowed, SOURCE_POLICY_VERSION } from './SourceUsePolicy';

describe('source use policy', () => {
  const previous = process.env.PILOT_MODE;
  afterEach(() => { if (previous === undefined) delete process.env.PILOT_MODE; else process.env.PILOT_MODE = previous; });
  it('recognizes canonical sources without trusting similar hosts or credentials', () => {
    expect(sourceUse('https://es.wikipedia.org/wiki/Giralda').license).toBe('CC BY-SA 4.0');
    expect(sourceUse('https://www.wikidata.org/wiki/Q123').license).toBe('CC0 1.0');
    for (const url of ['https://es.wikipedia.org.evil.test/wiki/X', 'https://user@es.wikipedia.org/wiki/X', 'javascript:alert(1)', 'http://es.wikipedia.org/wiki/X']) {
      expect(sourceUse(url).status).not.toBe('permitted');
    }
    expect(SOURCE_POLICY_VERSION).toBeTruthy();
  });
  it('blocks restricted sites even outside the pilot', () => {
    process.env.PILOT_MODE = 'false';
    for (const url of ['https://www.catedraldesevilla.es/a', 'https://alcazarsevilla.org/', 'https://www.alcazarsevilla.org/']) {
      expect(() => assertWebCaptureAllowed(url)).toThrow('SOURCE_USE_RESTRICTED');
    }
  });
  it('blocks both map and reference capture before any Firecrawl HTTP request', async () => {
    process.env.PILOT_MODE = 'true';
    const post = jest.fn(async () => ({ data: {} }));
    const provider = new FirecrawlNarrativeCaptureProviderV7({post, lookup: async () => [{address:'93.184.216.34',family:4}]});
    await expect(provider.mapOfficialSite({origin:'example.org',search:'history',limit:1})).rejects.toThrow('GENERIC_WEB_CAPTURE_DISABLED');
    await expect(provider.capture('https://example.org/reference')).rejects.toThrow('GENERIC_WEB_CAPTURE_DISABLED');
    await expect(provider.capture('https://www.catedraldesevilla.es/')).rejects.toThrow('SOURCE_USE_RESTRICTED');
    expect(post).not.toHaveBeenCalled();
  });
  it('does not send generic captures, including open-site redirects, in the pilot', () => {
    process.env.PILOT_MODE = 'true';
    for (const url of ['https://example.org/', 'https://es.wikipedia.org/wiki/X']) {
      expect(() => assertWebCaptureAllowed(url)).toThrow('GENERIC_WEB_CAPTURE_DISABLED');
    }
  });
});
