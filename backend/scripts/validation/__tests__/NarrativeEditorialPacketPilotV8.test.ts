import { buildEditorialPacketRequestV8, buildFrozenAuditInputV8, main, pilotReservationPlanV8, assertPilotCallMaximumV8, selectPilotPhasesV8, pilotTransportWriterSchemaV8 } from '../narrative-writer-briefing-pilot-v8';
import { buildFrozenWriterCasesV8, loadNarrativeWriterBenchmarkCheckpointV8 } from '../narrative-writer-benchmark-v8';
import { preflightNarrativeOpenRouterV6 } from '../../../src/services/poi/OpenRouterPreflightV6';
import { requestEditorialStructuredV6 } from '../../../src/services/poi/EditorialStructuredLlmV6';
import { NARRATIVE_MODEL_PROFILES_V6 } from '../../../src/services/poi/NarrativeModelProfilesV6';

jest.mock('../narrative-writer-benchmark-v8', () => ({
  buildFrozenWriterCasesV8: jest.fn(), loadNarrativeWriterBenchmarkCheckpointV8: jest.fn(),
}));
jest.mock('../../../src/services/poi/OpenRouterPreflightV6', () => ({
  preflightNarrativeOpenRouterV6: jest.fn(), openRouterPricingFromPreflightV6: jest.fn(),
}));
jest.mock('../../../src/services/poi/EditorialStructuredLlmV6', () => ({ requestEditorialStructuredV6: jest.fn() }));

const fixture = () => {
  const dossier: any = {
    stopId: 'Q1', fingerprint: 'fp', language: 'es', authorizedNames: ['Parada uno'],
    propositions: [{ propositionId: 'a', text: 'Forma rectangular.', passageIds: ['p1'] }],
    passages: [{ passageId: 'p1', quote: 'Forma rectangular.' }, { passageId: 'conflict', quote: '1560 después de 1561.' }],
    discrepancies: ['cronología pendiente'], limits: ['sin corroboración'],
  };
  const item: any = {
    stopId: 'Q1', input: { dossier }, systemPrompt: 'baseline', schema: {},
    bounds: { minimumWords: 575, maximumWords: 660 },
    plan: { evidenceCards: [{ cardId: 'card-a', passageIds: ['p1'] }, { cardId: 'card-b', passageIds: ['p1'] }],
      narrationTarget: { targetWords: 600, targetSeconds: 300 } },
  };
  const packet: any = {
    stopId: 'Q1', dossierFingerprint: 'fp', language: 'es', targetWords: 600, nextStopId: 'Q2',
    capacity: 'sufficient', storyAngle: 'La forma del lugar', instructions: [], excludedClaims: ['No usar fecha contradictoria'],
    facts: [{ cardId: 'card-a', claim: 'Forma rectangular.', passageIds: ['p1'] }],
  };
  const next = { ...dossier, stopId: 'Q2', authorizedNames: ['Franco', 'Otro personaje'],
    propositions: [{ propositionId: 'next-prop', passageIds: ['p2'] }, { propositionId: 'not-allowed', passageIds: ['p3'] }],
    passages: [{ passageId: 'p2', quote: 'Hecho del puente.' }, { passageId: 'p3', quote: 'No transferir.' }] };
  const checkpoint: any = {
    route: { stops: [{ stopId: 'Q1', name: 'Parada uno' }, { stopId: 'Q2', name: 'Parada dos' }] },
    research: [{ routeStopId: 'Q1', result: { dossier } }, { routeStopId: 'Q2', result: { dossier: next } }],
    arc: { stops: [{ stopId: 'Q1', bridgePropositionIds: ['next-prop'] }, { stopId: 'Q2', bridgePropositionIds: [] }] },
  };
  return { dossier, item, packet, checkpoint };
};

describe('editorial packet pilot (no remote calls)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reserves the whole comparison and rejects a request above its allocation before HTTP', () => {
    const caps = { writer: 0.15, auditor_b: 0.8 };
    expect(pilotReservationPlanV8(7.47154935, 9.47154935, 2, 2, caps)).toBeCloseTo(1.9);
    expect(() => pilotReservationPlanV8(0, 2, 6, 6, caps)).toThrow(/whole pilot/);
    expect(() => pilotReservationPlanV8(0, 2, 1, 1, { writer: NaN, auditor_b: 0.8 })).toThrow();
    expect(() => assertPilotCallMaximumV8('auditor_b', 0.81, caps)).toThrow(/before HTTP/);
    expect(() => assertPilotCallMaximumV8('writer', undefined, caps)).toThrow();
    expect(() => assertPilotCallMaximumV8('writer', 0.1, caps)).not.toThrow();
    expect(requestEditorialStructuredV6).not.toHaveBeenCalled();
  });

  test('free paragraphs compile without fixed beats or word-quota rejection', () => {
    const { dossier, item, packet } = fixture();
    const request = buildEditorialPacketRequestV8(item, dossier, packet, 'Q2');
    const draft = request.parse({ stop_id: 'Q1', paragraphs: [
      { text: 'Mira la forma.', supportCardIds: ['card-a'] },
      { text: 'Detengamos la atención.', supportCardIds: [] },
    ] });
    expect(draft.text).toBe('Mira la forma.\n\nDetengamos la atención.');
    expect(draft.wordCount).toBe(6);
    expect(draft.segments).toEqual([]);
    expect((draft as any).status).toBeUndefined();
    expect(request.input).not.toHaveProperty('beats');
    expect(JSON.stringify(request.schema)).not.toContain('uniqueItems'); // OpenAI strict schema rejects this keyword; parser still enforces uniqueness.
    expect(request.input.targetWords).toBe(600);
  });

  test.each([
    ['stopId', 'Q99'], ['dossierFingerprint', 'wrong'], ['language', 'en'],
    ['targetWords', 599], ['nextStopId', 'Q3'], ['capacity', 'insufficient'],
  ])('rejects incompatible %s before requests', (key, value) => {
    const { dossier, item, packet } = fixture();
    packet[key] = value;
    expect(() => buildEditorialPacketRequestV8(item, dossier, packet, 'Q2')).toThrow();
    expect(requestEditorialStructuredV6).not.toHaveBeenCalled();
  });

  test('different facts may reference one source passage; source objects remain intact', () => {
    const { dossier, item, packet } = fixture();
    packet.facts.push({ cardId: 'card-b', claim: 'Otra formulación.', passageIds: ['p1'] });
    const before = JSON.stringify({ dossier, item, packet });
    const request = buildEditorialPacketRequestV8(item, dossier, packet, 'Q2');
    expect((request.input.passages as unknown[]).length).toBe(1);
    expect(JSON.stringify({ dossier, item, packet })).toBe(before);
  });

  test('rejects invented, repeated and empty references', () => {
    for (const change of [
      (p: any) => { p.facts[0].cardId = 'foreign'; },
      (p: any) => { p.facts[0].passageIds = ['foreign']; },
      (p: any) => { p.facts[0].passageIds = ['p1', 'p1']; },
      (p: any) => { p.facts[0].claim = ' '; },
    ]) {
      const { dossier, item, packet } = fixture(); change(packet);
      expect(() => buildEditorialPacketRequestV8(item, dossier, packet, 'Q2')).toThrow();
    }
  });

  test('parser checks ids, blank text, reference duplication and transport bound', () => {
    const { dossier, item, packet } = fixture();
    const { parse } = buildEditorialPacketRequestV8(item, dossier, packet, 'Q2');
    for (const paragraphs of [
      [], [{ text: ' ', supportCardIds: [] }], [{ text: 'Texto.', supportCardIds: ['foreign'] }],
      [{ text: 'Texto.', supportCardIds: ['card-a', 'card-a'] }],
      Array.from({ length: 41 }, () => ({ text: 'Texto.', supportCardIds: [] })),
    ]) expect(() => parse({ stop_id: 'Q1', paragraphs })).toThrow();
  });

  test('auditor retains excluded source conflict and receives only canonical next-stop facts', () => {
    const { dossier, item, packet, checkpoint } = fixture();
    const before = JSON.stringify(checkpoint);
    const request = buildEditorialPacketRequestV8(item, dossier, packet, 'Q2');
    const audit: any = buildFrozenAuditInputV8(checkpoint, 'Q1');
    expect((request.input.passages as any[]).map(p => p.passageId)).not.toContain('conflict');
    expect(audit.passages.find((p: any) => p.passageId === 'conflict').quote).toContain('1560');
    expect(audit.bridgeEvidence.propositions.map((p: any) => p.propositionId)).toEqual(['next-prop']);
    expect(audit.bridgeEvidence.nextStop).toEqual({ stopId: 'Q2', name: 'Parada dos', authorizedNames: ['Parada dos'] });
    expect(JSON.stringify(checkpoint)).toBe(before);
    expect(() => buildFrozenAuditInputV8(checkpoint, 'Q9')).toThrow();
    checkpoint.research.pop();
    expect(() => buildFrozenAuditInputV8(checkpoint, 'Q1')).toThrow();
  });

  test('missing canonical label is rejected instead of substituting a dossier person', () => {
    const { checkpoint } = fixture();
    checkpoint.route.stops[1].name = '';
    expect(() => buildFrozenAuditInputV8(checkpoint, 'Q1')).toThrow(/canonical/);
  });

  test('synthetic scarce material is refused based on explicit editorial insufficiency', () => {
    const { dossier, item, packet } = fixture();
    packet.capacity = 'insufficient';
    packet.facts = [];
    dossier.passages = [];
    expect(() => buildEditorialPacketRequestV8(item, dossier, packet, 'Q2')).toThrow(/capacity/);
    expect(requestEditorialStructuredV6).not.toHaveBeenCalled();
  });

  test('selectPilotPhasesV8 resolves defaults, overrides, rejection, and non-mutation', () => {
    const profiles = NARRATIVE_MODEL_PROFILES_V6;
    const before = JSON.stringify(profiles);
    const hybridDefault = selectPilotPhasesV8('qwen38_hybrid');
    expect(hybridDefault.writer).toBe(profiles.qwen38_hybrid.phases.writer);
    expect(hybridDefault.auditor).toBe(profiles.qwen38_hybrid.phases.auditor_b);
    expect(hybridDefault.preflightProfile).toBe('qwen38_hybrid');
    const geminiDefault = selectPilotPhasesV8('qwen38_gemini25pro_writer');
    expect(geminiDefault.writer).toBe(profiles.qwen38_gemini25pro_writer.phases.writer);
    expect(geminiDefault.auditor).toBe(profiles.qwen38_gemini25pro_writer.phases.auditor_b);
    expect(geminiDefault.preflightProfile).toBe('qwen38_gemini25pro_writer');
    const localOverride = selectPilotPhasesV8('qwen38_hybrid', 'qwen-local');
    expect(localOverride.writer.provider.kind).toBe('qwen_local');
    expect(localOverride.writer.reasoning).toBe('none');
    expect(localOverride.writer.temperature).toBe(0.7);
    expect(localOverride.writer.maxTokens).toBe(4000);
    expect(localOverride.auditor).toBe(profiles.qwen38_hybrid.phases.auditor_b);
    expect(localOverride.preflightProfile).toBe('qwen38_hybrid');
    const geminiOverride = selectPilotPhasesV8('qwen38_hybrid', 'gemini-2.5-pro');
    expect(geminiOverride.writer).toBe(profiles.qwen38_gemini25pro_writer.phases.writer);
    expect(geminiOverride.auditor).toBe(profiles.qwen38_hybrid.phases.auditor_b);
    expect(geminiOverride.preflightProfile).toBe('qwen38_gemini25pro_writer');
    expect(() => selectPilotPhasesV8('qwen38_hybrid', 'unknown')).toThrow(/unknown writer override/);
    expect(JSON.stringify(profiles)).toBe(before);
  });

  test('pilotTransportWriterSchemaV8 removes only maxItems for Gemini without mutating original', () => {
    const { dossier, item, packet } = fixture();
    const request = buildEditorialPacketRequestV8(item, dossier, packet, 'Q2');
    const originalSchema = request.schema;
    const originalJson = JSON.stringify(originalSchema);
    const geminiSchema = pilotTransportWriterSchemaV8(originalSchema, 'google/gemini-2.5-pro');
    expect(JSON.stringify(originalSchema)).toBe(originalJson);
    expect(geminiSchema).not.toBe(originalSchema);
    const originalParagraphs = (originalSchema.properties as any).paragraphs;
    const geminiParagraphs = (geminiSchema.properties as any).paragraphs;
    expect(originalParagraphs.maxItems).toBe(40);
    expect(geminiParagraphs.maxItems).toBeUndefined();
    expect(geminiParagraphs.minItems).toBe(1);
    expect(geminiParagraphs.items).toEqual(originalParagraphs.items);
    expect((geminiSchema.properties as Record<string, unknown>).stop_id).toEqual((originalSchema.properties as Record<string, unknown>).stop_id);
    expect(geminiSchema.required).toEqual(originalSchema.required);
    expect(geminiSchema.additionalProperties).toBe(false);
    const nonGeminiSchema = pilotTransportWriterSchemaV8(originalSchema, 'qwen/qwen3-32b');
    expect(nonGeminiSchema).toBe(originalSchema);
    const parse = request.parse;
    expect(() => parse({ stop_id: 'Q1', paragraphs: Array.from({ length: 41 }, () => ({ text: 'Texto.', supportCardIds: [] })) })).toThrow(/at most 40/);
  });

  test('dry-run of baseline never reaches HTTP/preflight and reports frozen target', async () => {
    const { item, checkpoint } = fixture();
    (loadNarrativeWriterBenchmarkCheckpointV8 as jest.Mock).mockReturnValue(checkpoint);
    (buildFrozenWriterCasesV8 as jest.Mock).mockReturnValue({ cases: [item] });
    const argv = process.argv;
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'pilot', '--source=/unused', '--run-id=dry-test', '--variant=baseline',
      '--stop-ids=Q1', '--prior-spend-usd=0', '--spend-limit-usd=2'];
    try {
      await main();
      expect(preflightNarrativeOpenRouterV6).not.toHaveBeenCalled();
      expect(requestEditorialStructuredV6).not.toHaveBeenCalled();
      expect(JSON.stringify(spy.mock.calls)).toContain('600');
    } finally { process.argv = argv; spy.mockRestore(); }
  });
});
