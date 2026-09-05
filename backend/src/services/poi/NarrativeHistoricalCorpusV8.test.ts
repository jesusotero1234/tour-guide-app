import { historicalCorpusOriginV8, narrativeRagResumeRequestFingerprintV8, retrieveNarrativeHistoricalCorpusV8 } from './NarrativeHistoricalCorpusV8';
const sha = (letter = 'a') => 'sha256:' + letter.repeat(64).replace(/[^0-9a-f]/g, '0');
const input = { stopId: 'Q1', stopName: 'Alcazaba', cityQid: 'Q10', cityName: 'Málaga', language: 'es', aliases: ['Alcazaba de Málaga'] };
function hit(overrides: Record<string, unknown> = {}) {
  return { chunkId: sha(), documentId: 'book', textHash: sha('b'), contentHash: sha('c'),
    sourceUrl: 'https://books.google.es/books?id=example', title: 'Diccionario histórico',
    text: 'En Málaga, la Alcazaba tenía una muralla y alojaba a los gobernadores.',
    pageStart: 65, pageEnd: 65, publicationYear: 1848, historicalPeriod: '1848', language: 'es',
    sourceClass: 'primary_historical', rightsStatus: 'reviewed_reusable', rightsVerifiedAt: '2026-09-04T00:00:00Z',
    rightsIsExplicitlyReusable: true, coverageStatus: 'partial_source', coverageAcceptedForProduct: true,
    sourceIsExactRecord: true, ocrConfidence: 0.98, rerankScore: 0.8, cityQids: [], entityQids: [], sectionPath: [],
    entryTitle: 'Alcazaba',
    ...overrides };
}
const response = (hits: unknown[]) => ({ indexVersion: sha('d'), hits });
describe('historical corpus V8 boundary', () => {
  it('only permits off-to-on reuse when restarting research with the same base request', () => {
    const input = { enabled: true, fromPhase: 'research', saved: 'base', baseline: 'base', current: 'rag' };
    expect(narrativeRagResumeRequestFingerprintV8(input)).toBe('base');
    for (const fromPhase of ['boundary', 'arc', 'editorial', 'scorecard']) {
      expect(narrativeRagResumeRequestFingerprintV8({...input, fromPhase})).toBe('rag');
    }
    expect(narrativeRagResumeRequestFingerprintV8({...input, saved: 'different-city-or-duration'})).toBe('rag');
    expect(narrativeRagResumeRequestFingerprintV8({...input, enabled: false})).toBe('rag');
  });
  it('keeps verbatim OCR, metadata, independent chunk URLs and a shared publisher', async () => {
    const first = hit();
    const result = await retrieveNarrativeHistoricalCorpusV8(input, { post: async () => response([first, hit({ chunkId: sha('e') })]) });
    expect(result.error).toBeNull(); expect(result.queries).toBe(1);
    expect(result.captures).toHaveLength(2);
    expect(result.captures[0].content).toBe(first.text);
    expect(result.captures[0].historicalCorpus).toMatchObject({ chunkId: first.chunkId, textHash: first.textHash, pageStart: 65, indexVersion: sha('d'), publicationYear: 1848 });
    expect(result.captures[0].publisherKey).toBe(result.captures[1].publisherKey);
    expect(result.captures[0].finalUrl).not.toBe(result.captures[1].finalUrl);
    expect(result.captures[0].entityQid).toBeNull();
    const { segmentCaptureIntoSpansV7 } = require('./NarrativeSpansV7');
    const spanned = segmentCaptureIntoSpansV7(result.captures[0]);
    expect(spanned.content).not.toContain('Metadatos de catálogo');
  });
  it('tries tagged then textual retrieval once and caps captures at three', async () => {
    const post = jest.fn(async (_url: string, _body: Record<string, unknown>) => response([]));
    post.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(['a','b','c','d'].map(letter => hit({chunkId: sha(letter)}))));
    const result = await retrieveNarrativeHistoricalCorpusV8(input, { post });
    expect(result.captures).toHaveLength(3); expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1]).toMatchObject({ cityQid: 'Q10', stopQid: 'Q1' });
    expect(post.mock.calls[1][1]).not.toHaveProperty('cityQid');
  });
  it('does not mistake a city alias for the requested monument', async () => {
    const result = await retrieveNarrativeHistoricalCorpusV8({...input, aliases:['Málaga']}, {post: async () => response([hit({text:'En Málaga había un puerto muy concurrido.'})])});
    expect(result.captures).toHaveLength(0);
  });
  it('accepts exact QIDs without inventing textual identity', async () => {
    const result = await retrieveNarrativeHistoricalCorpusV8(input, {post: async () => response([hit({text:'Un testimonio de época.',cityQids:['Q10'],entityQids:['Q1'],entryTitle:null})])});
    expect(result.captures[0].entityQid).toBe('Q1');
  });
  it.each([
    {text:'La Alcazaba de Almería conserva una torre.',rerankScore:1},
    {text:'La Alcazaba conserva una torre.',coverageStatement:'Málaga'},
    {text:'La Alcazaba de Malagares era una fortaleza.'},
    {cityQids:['Q999']}, {entityQids:['Q999']}, {rightsIsExplicitlyReusable:false},
    {entryTitle:42,sectionPath:['Alcazaba']}, {entryTitle:'Gibralfaro'.repeat(20),sectionPath:['Alcazaba']},
    {rightsStatus:'pending'}, {coverageAcceptedForProduct:false}, {coverageStatus:'unknown'},
    {ocrConfidence:0.8}, {chunkId:'unverified'}, {sourceUrl:'http://127.0.0.1/private'},
    {sourceIsExactRecord:false}, {rerankScore:-0.5}, {rerankScore:1.5}, {rerankScore:NaN},
  ])('rejects unsafe or unrelated evidence %j', async overrides => {
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit(overrides)])});
    expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it('admits positive rerank score when identity and rights are valid', async () => {
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({rerankScore:0.453})])});
    expect(result.captures).toHaveLength(1); expect(result.rejected).toBe(0);
  });
  it('resolves page-context fallback for hit without city text', async () => {
    const hitText='La Alcazaba tenía una muralla y alojaba a los gobernadores.';
    const originalText='MALAGA.\n'+hitText;
    const page={
      pageId:sha('p'), logicalPageNumber:65, documentId:'book', sourceUrl:'https://books.google.es/books?id=example',
      sourceIsExactRecord:true, rightsStatus:'reviewed_reusable', rightsIsExplicitlyReusable:true,
      coverageAcceptedForProduct:true, continuityBreakBefore:false, contentClass:'normal',
      originalText, lines:[
        {role:'header', originalText:'Málaga', confidence:0.95, lineId:sha('h')},
        {role:'body', originalText:hitText, lineId:sha('l')},
      ],
    };
    const get=async(url:string)=>{ expect(url).toBe('http://127.0.0.1:3010/v1/documents/book/pages/65'); return page; };
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:hitText,sectionPath:['Alcazaba']})]),get});
    expect(result.captures).toHaveLength(1); expect(result.rejected).toBe(0);
    expect(result.captures[0].historicalCorpus!.pageContext).toMatchObject({pageId:page.pageId,logicalPageNumber:65,headerLineId:page.lines[0].lineId,headerText:'Málaga'});
    expect(result.captures[0].content).toContain(hitText);
  });
  it.each([
    {name:'wrong parent document',overrides:{documentId:'other'},page:{documentId:'book'}},
    {name:'wrong city header',overrides:{},page:{lines:[{role:'header',originalText:'Almería',confidence:0.95,lineId:sha('h')},{role:'body',originalText:'La Alcazaba tenía una muralla y alojaba a los gobernadores.',lineId:sha('l')}]}},
    {name:'missing section identity',overrides:{sectionPath:[]},page:{lines:[{role:'header',originalText:'Málaga',confidence:0.95,lineId:sha('h')},{role:'body',originalText:'La Alcazaba tenía una muralla y alojaba a los gobernadores.',lineId:sha('l')}]}},
    {name:'nonmatching originalText',overrides:{},page:{originalText:'MALAGA.\nUn texto completamente distinto sin relación con la Alcazaba.',lines:[{role:'header',originalText:'Málaga',confidence:0.95,lineId:sha('h')},{role:'body',originalText:'Un texto completamente distinto sin relación con la Alcazaba.',lineId:sha('l')}]}},
    {name:'continuity break',overrides:{},page:{continuityBreakBefore:true,lines:[{role:'header',originalText:'Málaga',confidence:0.95,lineId:sha('h')},{role:'body',originalText:'La Alcazaba tenía una muralla y alojaba a los gobernadores.',lineId:sha('l')}]}},
    {name:'table content class',overrides:{},page:{contentClass:'table',lines:[{role:'header',originalText:'Málaga',confidence:0.95,lineId:sha('h')},{role:'body',originalText:'La Alcazaba tenía una muralla y alojaba a los gobernadores.',lineId:sha('l')}]}},
    {name:'body entry before fragment',overrides:{},page:{originalText:'ALMERÍA.\nLa Alcazaba tenía una muralla y alojaba a los gobernadores.',lines:[{role:'header',originalText:'Málaga',confidence:0.95,lineId:sha('h')},{role:'body',originalText:'ALMERÍA.',lineId:sha('a')},{role:'body',originalText:'La Alcazaba tenía una muralla y alojaba a los gobernadores.',lineId:sha('l')}]}},
    {name:'bad rights',overrides:{rightsStatus:'pending'},page:{rightsStatus:'reviewed_reusable',lines:[{role:'header',originalText:'Málaga',confidence:0.95,lineId:sha('h')},{role:'body',originalText:'La Alcazaba tenía una muralla y alojaba a los gobernadores.',lineId:sha('l')}]}},
  ])('rejects fallback when %s', async ({overrides,page}) => {
    const hitText='La Alcazaba tenía una muralla y alojaba a los gobernadores.';
    const basePage={
      pageId:sha('p'), logicalPageNumber:65, documentId:'book', sourceUrl:'https://books.google.es/books?id=example',
      sourceIsExactRecord:true, rightsStatus:'reviewed_reusable', rightsIsExplicitlyReusable:true,
      coverageAcceptedForProduct:true, continuityBreakBefore:false, contentClass:'normal',
      originalText:'MALAGA.\n'+hitText,
      lines:[{role:'header',originalText:'Málaga',confidence:0.95,lineId:sha('h')},{role:'body',originalText:hitText,lineId:sha('l')}],
    };
    const fullPage={...basePage,...page};
    const get=async(_url:string)=>fullPage;
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:hitText,sectionPath:['Alcazaba'],...overrides})]),get});
    expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it('does not rescue conflicting hitQID via parent context', async () => {
    const hitText='La Alcazaba tenía una muralla y alojaba a los gobernadores.';
    const page={
      pageId:sha('p'), logicalPageNumber:65, documentId:'book', sourceUrl:'https://books.google.es/books?id=example',
      sourceIsExactRecord:true, rightsStatus:'reviewed_reusable', rightsIsExplicitlyReusable:true,
      coverageAcceptedForProduct:true, continuityBreakBefore:false, contentClass:'normal',
      originalText:'MALAGA.\n'+hitText,
      lines:[{role:'header',originalText:'Málaga',confidence:0.95,lineId:sha('h')},{role:'body',originalText:hitText,lineId:sha('l')}],
    };
    const get=async(_url:string)=>page;
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:hitText,sectionPath:['Alcazaba'],entityQids:['Q999']})]),get});
    expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it('rejects null malformed hit without transport failure', async () => {
    const get=async(_url:string)=>{ throw new Error('should not be called'); };
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([null]),get});
    expect(result.error).toBeNull(); expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it('does not perform live GET when only post is injected', async () => {
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:'La Alcazaba tenía una muralla y alojaba a los gobernadores.',sectionPath:['Alcazaba']})])});
    expect(result.error).toBeNull(); expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it('preserves line-break OCR while using dehyphenation only for identity', async () => {
    const text='En Málaga la Alca-\nzaba tenía una muralla.';
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text})])});
    expect(result.captures[0].content).toContain(text);
  });
  it('fails softly on transport/malformed data but propagates cancellation', async () => {
    const failed=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>{throw new Error('timeout');}});
    expect(failed.error).toBe('timeout'); expect(failed.queries).toBe(1); expect(failed.captures).toEqual([]);
    const malformed=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>({hits:[]})});
    expect(malformed.error).toContain('malformed');
    const controller=new AbortController();controller.abort(new Error('cancelled'));
    await expect(retrieveNarrativeHistoricalCorpusV8(input,{signal:controller.signal,post:async()=>response([])})).rejects.toThrow('cancelled');
  });
  it('does not mix index versions across fallback', async () => {
    let count=0;
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>({...response(count++ ? [hit()] : []),indexVersion:sha(count===1?'d':'e')})});
    expect(result.error).toContain('index changed'); expect(result.captures).toEqual([]);
  });
  it('rejects body mention of Alcazaba when entryTitle is Gibralfaro', async () => {
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:'En Málaga, la Alcazaba tenía una muralla.',entryTitle:'Gibralfaro'})])});
    expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it('rejects matching city/body when entryTitle and sectionPath absent', async () => {
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:'En Málaga, la Alcazaba tenía una muralla.',entryTitle:null,sectionPath:[]})])});
    expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it('accepts matching final sectionPath when entryTitle absent', async () => {
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:'En Málaga, la Alcazaba tenía una muralla.',entryTitle:null,sectionPath:['Alcazaba']})])});
    expect(result.captures).toHaveLength(1); expect(result.rejected).toBe(0);
  });
  it('rejects conflicting entryTitle not rescued by matching sectionPath', async () => {
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:'En Málaga, la Alcazaba tenía una muralla.',entryTitle:'Gibralfaro',sectionPath:['Alcazaba']})])});
    expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it('rejects tagged QIDs with conflicting title', async () => {
    const result=await retrieveNarrativeHistoricalCorpusV8(input,{post:async()=>response([hit({text:'Un testimonio de época.',cityQids:['Q10'],entityQids:['Q1'],entryTitle:'Gibralfaro'})])});
    expect(result.captures).toHaveLength(0); expect(result.rejected).toBe(1);
  });
  it.each(['https://example.com','http://127.0.0.1:3010/path','http://user:pass@localhost:3010','http://localhost:3010?x=1'])('rejects nonlocal configuration %s',url=>{
    expect(()=>historicalCorpusOriginV8(url)).toThrow();
  });
});
