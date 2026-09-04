jest.mock('./NarrativeEditorialAgentsV6', () => {
  const actual = jest.requireActual('./NarrativeEditorialAgentsV6');
  return { ...actual, createNarrativeEditorialAgentsV6Core: jest.fn() };
});
jest.mock('./NarrativeLengthFitterAgentV8', () => ({
  fitNarrativeWriterLengthV8: jest.fn(),
}));
jest.mock('./NarrativeWriterContractV8', () => {
  const actual = jest.requireActual('./NarrativeWriterContractV8');
  return { ...actual, buildNarrativeWriterPlanV8: jest.fn() };
});
jest.mock('./NarrativeEditorialEvidenceProjectionV8', () => ({
  createNarrativeEditorialRequestProjectorV8: jest.fn(() => (
    (projection: unknown) => projection
  )),
}));

import {
  NarrativeEditorialAgentsV6,
  NarrativeEditorialValidationHooksV6,
  NarrativeWriterInputV6,
  createNarrativeEditorialAgentsV6Core,
} from './NarrativeEditorialAgentsV6';
import { createNarrativeEditorialAgentsV8 } from './NarrativeEditorialAgentsV8';
import { fitNarrativeWriterLengthV8 } from './NarrativeLengthFitterAgentV8';
import {
  NarrativeStructuredWriterResultV8,
  NarrativeWriterPlanV8,
  buildNarrativeWriterPlanV8,
} from './NarrativeWriterContractV8';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { NarrativeAdmittedStopV8, NarrativeEvidenceManifestV8 } from './NarrativeEvidenceBoundaryV8';
import { NarrativeArcV8 } from './NarrativeArcArchitectV8';

const mockedCreateCore = createNarrativeEditorialAgentsV6Core as jest.MockedFunction<
  typeof createNarrativeEditorialAgentsV6Core
>;
const mockedFitLength = fitNarrativeWriterLengthV8 as jest.MockedFunction<
  typeof fitNarrativeWriterLengthV8
>;
const mockedBuildPlan = buildNarrativeWriterPlanV8 as jest.MockedFunction<
  typeof buildNarrativeWriterPlanV8
>;

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `palabra${index + 1}`).join(' ');
}

function draft(wordCount: number): NarrativeStructuredWriterResultV8 {
  return {
    text: words(wordCount),
    segments: [],
    coverage: 1,
    wordCount,
  };
}

function diagnostic(
  callId: string,
  value: NarrativeStructuredWriterResultV8
): EditorialCallResultV6<NarrativeStructuredWriterResultV8> {
  return {
    callId,
    status: 'valid',
    value,
    attempts: [],
    model: 'openai/gpt-5.4-mini',
    promptFingerprint: `${callId}-prompt`,
    responseFingerprint: `${callId}-response`,
    inputCharacters: 0,
    schemaCharacters: 0,
    input: {},
    rawOutput: '{}',
    retryCount: 0,
  };
}

const plan: NarrativeWriterPlanV8 = {
  version: 'segments_v8',
  routeStopId: 'stop-a',
  openingMode: 'gaze',
  narrationTarget: {
    stopId: 'stop-a',
    targetSeconds: 300,
    targetWords: 600,
    minPropositions: 6,
    maxPropositions: 10,
    minVisualAnchors: 2,
  },
  evidenceCards: [],
  beats: [],
  highPriorityCardIds: [],
  minimumHighPriorityCoverage: 0.7,
};

const admittedStops = [{
  routeStopId: 'stop-a',
  entityQid: 'Q-test',
  dossier: {},
}] as unknown as NarrativeAdmittedStopV8[];

const manifest = {
  fingerprint: 'manifest-fingerprint',
} as NarrativeEvidenceManifestV8;

const arc = {
  promise: 'Promesa',
  centralQuestion: 'Pregunta',
  stops: [],
} as unknown as NarrativeArcV8;

const targetMap = new Map([['stop-a', plan.narrationTarget]]);

function fakeCore(
  value: NarrativeStructuredWriterResultV8,
  writerDiagnostic: EditorialCallResultV6<NarrativeStructuredWriterResultV8>
): { core: NarrativeEditorialAgentsV6; write: jest.Mock } {
  const write = jest.fn(async () => ({ value, diagnostic: writerDiagnostic }));
  return {
    write,
    core: {
      profileName: 'qwen38_hybrid',
      write,
      audit: jest.fn(),
      adjudicate: jest.fn(),
      repair: jest.fn(),
      auditTour: jest.fn(),
    } as unknown as NarrativeEditorialAgentsV6,
  };
}

describe('createNarrativeEditorialAgentsV8 length fitting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedBuildPlan.mockReturnValue(plan);
  });

  it('fits a short structured draft without asking the core writer to regenerate it', async () => {
    const writtenDraft = draft(559);
    const fittedDraft = draft(600);
    const writerDiagnostic = diagnostic('writer', writtenDraft);
    const fitDiagnostic = diagnostic('length-fit', fittedDraft);
    const { core, write } = fakeCore(writtenDraft, writerDiagnostic);
    mockedCreateCore.mockReturnValue(core);
    mockedFitLength.mockResolvedValue({
      value: fittedDraft,
      diagnostics: [fitDiagnostic],
    });

    const agents = createNarrativeEditorialAgentsV8(
      { profile: 'qwen38_hybrid', openRouterApiKey: 'test-key' },
      admittedStops,
      manifest,
      arc,
      targetMap
    );
    const input = { stopId: 'stop-a' } as NarrativeWriterInputV6;
    const result = await agents.write(input);

    expect(write).toHaveBeenCalledTimes(1);
    expect(mockedFitLength).toHaveBeenCalledWith(expect.objectContaining({
      plan,
      draft: writtenDraft,
      profile: 'qwen38_hybrid',
    }));
    expect(result.value).toBe(fittedDraft);
    expect(result.diagnostics).toEqual([writerDiagnostic, fitDiagnostic]);

    const hooks = mockedCreateCore.mock.calls[0][2] as NarrativeEditorialValidationHooksV6;
    expect(() => hooks.validateWriter?.({ text: words(559) }, input)).not.toThrow();
  });

  it('keeps the core writer behavior when a stop has no narration target', async () => {
    const writtenDraft = draft(559);
    const writerDiagnostic = diagnostic('writer', writtenDraft);
    const { core } = fakeCore(writtenDraft, writerDiagnostic);
    mockedCreateCore.mockReturnValue(core);

    const agents = createNarrativeEditorialAgentsV8(
      { profile: 'qwen38_hybrid' },
      admittedStops,
      manifest,
      arc
    );
    const result = await agents.write({ stopId: 'stop-a' } as NarrativeWriterInputV6);

    expect(result.value).toBe(writtenDraft);
    expect(mockedFitLength).not.toHaveBeenCalled();
  });
});
