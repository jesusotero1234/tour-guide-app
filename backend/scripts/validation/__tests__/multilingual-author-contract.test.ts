import { blueprintFixture } from '../../../src/services/TourBlueprint.test-support';
import { prepareAuthorCanaryMaterialV8 } from '../narrative-author-canary-material-v8';
import { auditCodexNarrationV8 } from '../narrative-codex-live-v8';
import { assignNarrativeSentenceIdsV6 } from '../../../src/services/poi/NarrativeEditorialV6';
import * as codexAuditor from '../narrative-codex-auditor-v8';

const template = '# Author\n\nWrite from the provided evidence.\n\n## Caso y objetivo de esta respuesta\nExample';
const reference = '## Guion para narrar\nUna referencia española.\n## Notas de revisión\nNotas';
function materials() {
  const snapshot = blueprintFixture();
  const original = JSON.stringify(snapshot);
  const result = prepareAuthorCanaryMaterialV8(snapshot.checkpoint, template, reference, 'Q999', 'fr-FR');
  expect(JSON.stringify(snapshot)).toBe(original);
  return result;
}
afterEach(() => jest.restoreAllMocks());
it('writes French and audits French against unchanged Spanish passages', () => {
  const m = materials()[0];
  expect(m.canonicalContext.language).toBe('fr');
  expect(m.frozen.inputs[0].preparedRequest.input.language).toBe('fr');
  expect(m.frozen.inputs[0].auditInput).toMatchObject({language:'fr',researchLanguage:'es'});
  expect(m.sourceUrls.every(source => source.sourceLanguage === 'es')).toBe(true);
  expect(m.authorPrompt).toContain('français');
  expect(m.targetWords).toBe(360);
});
it('accepts the extended audit contract and preserves language issues independently of facts', async () => {
  const m = materials()[0];
  const script = assignNarrativeSentenceIdsV6(m.stopId, 'Cette façade possède quatre tours.');
  const languageReview = {matchesRequestedLanguage:true,naturalForListening:false,issues:['Formulation peu naturelle.']};
  const passageId = m.frozen.inputs[0].auditInput.passages[0].passageId;
  const payload = {checks:script.sentences.map(s=>({sentenceId:s.sentenceId,classification:'supported',passageIds:[passageId],reason:'Meaning matches source.'})),languageReview};
  const mock = jest.spyOn(codexAuditor,'requestCodexAuditV8').mockImplementation(async (input:any)=>({
    callId:input.callId,status:'valid',value:input.validate(payload),
  } as any));
  const result = await auditCodexNarrationV8(m,script,{
    openRouterApiKey:'',pricing:{},
    runId:'test',signal:new AbortController().signal,onProgress:()=>{},requireLanguageReview:true,
  });
  expect(result).toMatchObject({status:'valid',value:{languageReview}});
  const validate = (mock.mock.calls[0][0] as any).validate;
  expect(()=>validate({checks:payload.checks})).toThrow();
  expect(()=>validate({...payload,languageReview:{...languageReview,issues:[42]}})).toThrow();
  expect(()=>validate({...payload,approved:true})).toThrow();
});
