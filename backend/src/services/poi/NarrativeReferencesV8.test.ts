import axios from 'axios';
import { extractWikipediaReferencesV8, associatedReferenceDocumentV8, rankReferencesV8, createNarrativeReferenceServicesV8,
  referenceUrlV8, independentReferencePublisherCountV8 } from './NarrativeReferencesV8';
import { NarrativeCapturedSourceV8, FirecrawlNarrativeCaptureProviderV7 } from './NarrativeSourcesV7';

describe('bounded Wikipedia reference discovery', () => {
  afterEach(() => jest.restoreAllMocks());
  it('caches captures and failures for the run without repeating transport attempts', async () => {
    const capture = jest.spyOn(FirecrawlNarrativeCaptureProviderV7.prototype, 'capture').mockRejectedValue(new Error('404'));
    const service = createNarrativeReferenceServicesV8({ firecrawlBaseUrl: 'http://127.0.0.1:3007/v2', searxngBaseUrl: 'http://127.0.0.1:18081' });
    const input = { url: 'https://museum.es/page', signal: new AbortController().signal };
    await expect(service.capture(input)).rejects.toThrow('404');
    await expect(service.capture({ ...input, url: input.url + '#other' })).rejects.toThrow('404');
    expect(capture).toHaveBeenCalledTimes(1);
  });
  it('loads only the saved revision, shares its result and rejects mismatched revisions', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: { parse: { revid: 123, text: 'same revision' } } });
    const service = createNarrativeReferenceServicesV8({ firecrawlBaseUrl: 'http://127.0.0.1:3007/v2', searxngBaseUrl: 'http://127.0.0.1:18081' });
    const capture = { finalUrl: 'https://es.wikipedia.org/wiki/Fadri', wikimediaRevision: { revisionId: 123, timestamp: '' } } as NarrativeCapturedSourceV8;
    const signal = new AbortController().signal;
    await expect(service.load({ capture, signal })).resolves.toBe('same revision');
    await expect(service.load({ capture, signal })).resolves.toBe('same revision');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('https://es.wikipedia.org/w/api.php', expect.objectContaining({ params: expect.objectContaining({ oldid: 123 }), signal }));
    await expect(service.load({ capture: { ...capture, wikimediaRevision: { revisionId: 124, timestamp: '' } }, signal })).rejects.toThrow('reference_revision_unavailable');
  });
  it('never switches reference searching to a public SearxNG deployment', () => {
    expect(() => createNarrativeReferenceServicesV8({ firecrawlBaseUrl: 'http://127.0.0.1:3007/v2', searxngBaseUrl: 'https://public.example.org' })).toThrow('self-hosted');
  });
  it('extracts full URLs from encoded MediaWiki footnotes, preserving query strings and deduplicating', () => {
    const refs = extractWikipediaReferencesV8('<a href="https://unrelated.org/">not a citation</a>\n'
      + '<li id="cite&#95;note-1"><a href="https://museum.es/fadri?a=1&amp;b=2">El Fadrí</a></li>'
      + '<li id="cite_note-2"><a href="https://museum.es/fadri?a=1&amp;b=2#note">Repeated</a></li>');
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe('https://museum.es/fadri?a=1&b=2');
  });
  it('supports wikitext, markdown references and unlinked bibliography without crawling article links', () => {
    expect(extractWikipediaReferencesV8('<ref>{{cite web|url=http://museum.es/fadri|title=History}}</ref>')[0].url).toBe('https://museum.es/fadri');
    const refs = extractWikipediaReferencesV8('https://ignore.es/\n## References\n[History](https://museum.es/fadri)\nA printed scholarly history of the municipal tower.\n## See also\nhttps://ignore.es/too');
    expect(refs.map(ref => ref.url)).toEqual(['https://museum.es/fadri', null]);
  });
  it('rejects credentials, non-HTTPS, local endpoints and Wikimedia navigation', () => {
    for (const url of ['file:///etc/passwd', 'https://a:b@museum.es/', 'https://museum.es:8888/', 'https://a.local/', 'https://commons.wikimedia.org/x']) expect(referenceUrlV8(url)).toBeNull();
  });
  it('ranks relevant history and registered authorities, retaining deterministic citation order', () => {
    const unrelated = { url: 'https://museum.es/news', title: 'Unrelated' };
    const history = { url: 'https://municipal.es/fadri', title: 'El Fadrí historia' };
    expect(rankReferencesV8([unrelated, history], ['El Fadrí'], ['municipal.es'], ['tension_or_contrast'])[0]).toEqual(history);
  });
  it('allows one labelled same-site document; rejects media, another host and PDF recursion', () => {
    const page = { finalUrl: 'https://museum.es/fadri', content: '[Audio](https://museum.es/audio.mp3) [Historia](https://other.es/book.pdf) [Guía histórica](https://museum.es/book.pdf)' };
    expect(associatedReferenceDocumentV8(page as NarrativeCapturedSourceV8)?.url).toBe('https://museum.es/book.pdf');
    expect(associatedReferenceDocumentV8({ ...page, finalUrl: 'https://museum.es/book.pdf' } as NarrativeCapturedSourceV8)).toBeNull();
  });
  it('does not count Wikipedia plus its original as two independent confirmations', () => {
    const wiki = { sourceId: 'wiki', authority: { publisherKey: 'wikimedia' } } as NarrativeCapturedSourceV8;
    const ref = { sourceId: 'ref', authority: { publisherKey: 'museum.es' }, referenceProvenance: { wikipediaSourceId: 'wiki' } } as NarrativeCapturedSourceV8;
    expect(independentReferencePublisherCountV8([wiki, ref])).toBe(1);
    expect(independentReferencePublisherCountV8([wiki, ref, { ...ref, sourceId: 'doc' }])).toBe(1);
    expect(independentReferencePublisherCountV8([wiki, ref, { ...ref, sourceId: 'second', authority: { ...ref.authority, publisherKey: 'specialist.es' } }])).toBe(2);
  });
});
