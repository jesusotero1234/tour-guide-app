import {
  NarrativeEditorialAgentsV8,
  NarrativeLengthOutcomeV8,
} from './NarrativeEditorialAgentsV8';
import { NarrativeEditorialWorkflowResultV6 } from './NarrativeEditorialWorkflowV6';
import { collectNarrativeLengthOutcomesV8 } from './NarrativeEditorialWorkflowV8';

describe('collectNarrativeLengthOutcomesV8', () => {
  it('reports final script lengths and omits stops without narration targets', () => {
    const residual: NarrativeLengthOutcomeV8 = {
      stopId: 'stop-a',
      lengthStatus: 'accepted_with_residual',
      targetWords: 600,
      actualWords: 553,
      minimumWords: 575,
      maximumWords: 660,
    };
    const narrationLengthOutcome = jest.fn()
      .mockReturnValueOnce(residual)
      .mockReturnValueOnce(null);
    const agents = { narrationLengthOutcome } as unknown as NarrativeEditorialAgentsV8;
    const editorial = {
      stops: [
        { stopId: 'stop-a', finalScript: { text: 'final a' } },
        { stopId: 'stop-b', finalScript: { text: 'final b' } },
      ],
    } as unknown as NarrativeEditorialWorkflowResultV6;

    expect(collectNarrativeLengthOutcomesV8(editorial, agents)).toEqual([residual]);
    expect(narrationLengthOutcome.mock.calls).toEqual([
      ['stop-a', 'final a'],
      ['stop-b', 'final b'],
    ]);
  });
});
