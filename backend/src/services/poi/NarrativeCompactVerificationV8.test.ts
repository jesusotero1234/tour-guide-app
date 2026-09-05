import { assignNarrativeSentenceIdsV6, narrativeSentenceFingerprintV6 } from './NarrativeEditorialV6';
import { compactNarrativeAuditSchemaV8, parseCompactNarrativeAuditV8, verifyNarrativeCompactV8 } from './NarrativeCompactVerificationV8';
import * as llm from './EditorialStructuredLlmV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';

const script = assignNarrativeSentenceIdsV6('stop', 'La fachada tiene dos torres. Observa su silueta.');
const checks = () => script.sentences.map((s, i) => ({
  sentenceId: s.sentenceId, classification: i === 0 ? 'supported' : 'authorized_inference',
  passageIds: i === 0 ? ['local-passage'] : [], reason: 'Soporte comprobado.',
}));
describe('compact factual verification V8', () => {
  it('uses the existing OpenRouter auditor_b slot with one request and backend validation', async () => {
    const request = jest.spyOn(llm, 'requestEditorialStructuredV6').mockImplementation(async input => ({
      callId: input.callId, status: 'valid', value: input.validate({ checks: checks() }),
      attempts: [], model: input.provider.model, promptFingerprint: 'p', responseFingerprint: 'r',
      inputCharacters: 1, schemaCharacters: 1, input: input.input, rawOutput: '{}',
    }));
    try {
      const dossier = { language: 'es', propositions: [], passages: [{ passageId: 'local-passage', sourceId: 'source',
        quote: 'La fachada tiene dos torres.' }], discrepancies: [], limits: [] } as unknown as NarrativeDossierV6;
      const result = await verifyNarrativeCompactV8({ profile: 'qwen38_hybrid', openRouterApiKey: 'offline-test' },
        { script, dossier }, { propositions: [], passages: [] });
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0].provider).toMatchObject({ kind: 'openrouter', model: 'openai/gpt-5.4-mini' });
      expect(request.mock.calls[0][0].options).toMatchObject({ phase: 'auditor_b', requestAttempts: 1, rateLimitAttempts: 1 });
      expect(result.value.findings).toHaveLength(2);
      expect(result.value.provenance).toEqual({ transport: 'openrouter', requestedModel: 'openai/gpt-5.4-mini', actualModel: null, actualProvider: null });
      expect(result.diagnostic.value).toEqual(result.value);
    } finally { request.mockRestore(); }
  });

  it('covers every sentence and computes anchors in code', () => {
    const report = parseCompactNarrativeAuditV8({ checks: checks() }, script, ['local-passage']);
    expect(report.findings).toHaveLength(2);
    expect(report.findings[0].sentenceFingerprint).toBe(narrativeSentenceFingerprintV6(script.sentences[0]));
    expect(report.findings[0].claimSpan).toBe(script.sentences[0].text);
  });
  it.each(['omitted', 'duplicate', 'foreign'])('rejects %s sentence coverage', mode => {
    const input = checks();
    if (mode === 'omitted') input.pop();
    if (mode === 'duplicate') input[1] = input[0];
    if (mode === 'foreign') input[0].sentenceId = 'elsewhere-S001';
    expect(() => parseCompactNarrativeAuditV8({ checks: input }, script, ['local-passage'])).toThrow();
  });
  it.each([['unknown'], [script.sentences[0].sentenceId], ['local-passage', 'local-passage']])('rejects invalid passage IDs %j', (...ids) => {
    const input = checks();
    input[0].passageIds = ids;
    expect(() => parseCompactNarrativeAuditV8({ checks: input }, script, ['local-passage'])).toThrow();
  });
  it('requires support citations but retains unsupported findings without citations', () => {
    const input = checks();
    input[0].passageIds = [];
    const report = parseCompactNarrativeAuditV8({ checks: input }, script, []);
    expect(report.findings[0].classification).toBe('unclear');
    expect(report.findings[0].reason).toBe('Falta cita de evidencia para supported; afirmación pendiente.');
    expect(report.findings[0].conflictType).toBe('ambiguous_verifiable_claim');
    input[0].classification = 'unsupported';
    expect(parseCompactNarrativeAuditV8({ checks: input }, script, []).findings[0].classification).toBe('unsupported');
  });
  it('preserves valid checks when one is distorted uncited', () => {
    const input = checks();
    input[0].passageIds = ['local-passage'];
    input[1].classification = 'distorted';
    input[1].passageIds = [];
    const report = parseCompactNarrativeAuditV8({ checks: input }, script, ['local-passage']);
    expect(report.findings[0].classification).toBe('supported');
    expect(report.findings[1].classification).toBe('unclear');
    expect(report.findings[1].reason).toBe('Falta cita de evidencia para distorted; afirmación pendiente.');
  });
  it('converts supported and distorted without citations to unclear', () => {
    const input = checks();
    input[0].passageIds = [];
    input[1].classification = 'distorted';
    input[1].passageIds = [];
    const report = parseCompactNarrativeAuditV8({ checks: input }, script, []);
    expect(report.findings[0].classification).toBe('unclear');
    expect(report.findings[1].classification).toBe('unclear');
  });
  it('allows only explicitly admitted bridge citations and constrains schema IDs', () => {
    const input = checks(); input[0].passageIds = ['bridge-passage'];
    expect(parseCompactNarrativeAuditV8({ checks: input }, script, ['bridge-passage']).findings[0].passageIds).toEqual(['bridge-passage']);
    const schema = compactNarrativeAuditSchemaV8(script, ['bridge-passage']) as any;
    expect(schema.properties.checks.items.properties.passageIds.items.enum).toEqual(['bridge-passage']);
    expect(schema.properties.checks.items.properties.sentenceId.enum).toEqual(script.sentences.map(s => s.sentenceId));
  });
  it('passes real nextStop to request and constrains systemPrompt', async () => {
    const request = jest.spyOn(llm, 'requestEditorialStructuredV6').mockImplementation(async input => ({
      callId: input.callId, status: 'valid', value: input.validate({ checks: checks() }),
      attempts: [], model: input.provider.model, promptFingerprint: 'p', responseFingerprint: 'r',
      inputCharacters: 1, schemaCharacters: 1, input: input.input, rawOutput: '{}',
    }));
    try {
      const dossier = { language: 'es', propositions: [], passages: [{ passageId: 'local-passage', sourceId: 'source',
        quote: 'La fachada tiene dos torres.' }], discrepancies: [], limits: [] } as unknown as NarrativeDossierV6;
      request.mockImplementation(async input => ({
        callId: input.callId, status: 'valid', value: input.validate({ checks: checks() }),
        attempts: [], model: input.provider.model, promptFingerprint: 'p', responseFingerprint: 'r',
        inputCharacters: 1, schemaCharacters: 1, input: input.input, rawOutput: '{}',
        requestedModel: input.provider.model, actualModel: 'actual-model', actualProvider: 'actual-provider',
      }));
      const bridgeEvidence = { propositions: [], passages: [], nextStop: { stopId: 'next-stop', authorizedNames: ['Next Stop'] } };
      const result = await verifyNarrativeCompactV8({ profile: 'qwen38_hybrid', openRouterApiKey: 'offline-test' },
        { script, dossier }, bridgeEvidence);
      expect(request).toHaveBeenCalledTimes(1);
      expect(result.value.provenance).toMatchObject({ actualModel: 'actual-model', actualProvider: 'actual-provider' });
      expect(result.diagnostic.value).toEqual(result.value);
      expect(request.mock.calls[0][0].input).toMatchObject({ bridgeEvidence: { nextStop: { stopId: 'next-stop', authorizedNames: ['Next Stop'] } } });
      expect(request.mock.calls[0][0].systemPrompt).toContain('bridgeEvidence.nextStop');
      expect(request.mock.calls[0][0].systemPrompt).toContain('Pero la plaza no habla solo del monumento original');
      expect(request.mock.calls[0][0].systemPrompt).toContain('La plaza fue diseñada para controlar a la población');
    } finally { request.mockRestore(); }
  });
  it('rejects extra fields and unbounded explanations', () => {
    expect(() => parseCompactNarrativeAuditV8({ checks: checks(), approved: true }, script, ['local-passage'])).toThrow();
    const input = checks(); input[0].reason = 'x'.repeat(301);
    expect(() => parseCompactNarrativeAuditV8({ checks: input }, script, ['local-passage'])).toThrow();
  });
});
