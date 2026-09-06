import Ajv from 'ajv';
import * as structured from './EditorialStructuredLlmV6';
import { curatorServiceV8 } from '../../../scripts/validation/narrative-user-canary-v8';
import { NarrativeCuratorPacketV8 } from './NarrativeResearchV8';

const packet: NarrativeCuratorPacketV8 = {
  stopId: 'Q1', stopName: 'Monumento', language: 'es',
  spans: [{ sourceId: 'wiki', evidenceSpanId: 'wiki:span:0001', text: 'Una torre separada de la iglesia.', start: 0, end: 31, sourceUrl: 'https://es.wikipedia.org/wiki/Monumento', publisherKey: 'wikimedia' }],
  publishers: ['wikimedia'], excludedSpanCount: 0, priorityRoles: [],
  narrationTarget: { stopId: 'Q1', targetSeconds: 180, targetWords: 400, minPropositions: 6, maxPropositions: 10, minVisualAnchors: 2 },
};
const emptyOutput = { propositions: [], authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [] };
const fact = { text: 'Una torre separada de la iglesia.', role: 'distinctive_trait', certainty: 'high', interpretation: 'direct',
  supports: [{ sourceId: 'wiki', evidenceSpanIds: ['wiki:span:0001'] }] };

describe('secondary contrast wire compatibility', () => {
  afterEach(() => jest.restoreAllMocks());
  it('adds explicit coverage only to an existing contrast-repair request, with no extra call', async () => {
    const request = jest.spyOn(structured, 'requestEditorialStructuredV6').mockResolvedValue(
      { status: 'valid', value: emptyOutput } as Awaited<ReturnType<typeof structured.requestEditorialStructuredV6>>
    );
    const curate = await curatorServiceV8({ apiKey: '', openRouterApiKey: '', profile: 'qwen38_hybrid', runId: 'wire-offline-test' });
    await curate(packet);
    await curate({ ...packet, priorityRoles: ['human_agency_or_lived_function'] });
    await curate({ ...packet, priorityRoles: ['tension_or_contrast'] });
    expect(request).toHaveBeenCalledTimes(3);
    const [normal, otherRepair, contrastRepair] = request.mock.calls.map(call => call[0]);
    expect(normal.schema).toEqual(otherRepair.schema);
    expect(normal.systemPrompt).not.toContain('secondaryContrast');
    expect(otherRepair.systemPrompt).not.toContain('secondaryContrast');
    expect(contrastRepair.systemPrompt).toContain('secondaryContrast');
    const ajv = new Ajv({ strict: true });
    const oldValidate = ajv.compile(normal.schema);
    const repairValidate = ajv.compile(contrastRepair.schema);
    expect(oldValidate({ ...emptyOutput, propositions: [fact] })).toBe(true);
    expect(oldValidate({ ...emptyOutput, propositions: [{ ...fact, secondaryContrast: null }] })).toBe(false);
    expect(repairValidate({ ...emptyOutput, propositions: [{ ...fact, secondaryContrast: null }] })).toBe(true);
    expect(repairValidate({ ...emptyOutput, propositions: [{ ...fact, secondaryContrast: { left: 'torre separada', right: 'iglesia integrada' } }] })).toBe(true);
    expect(repairValidate({ ...emptyOutput, propositions: [{ ...fact, secondaryContrast: { left: 'torre separada', right: 'iglesia integrada', extra: true } }] })).toBe(false);
  });
});
