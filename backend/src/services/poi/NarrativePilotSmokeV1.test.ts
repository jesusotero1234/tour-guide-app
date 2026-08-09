import { readFileSync } from 'fs';
import { join } from 'path';
import { NarrativeScriptResponseV1, narrativeWordCountV1 } from './NarrativePilotV1';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { buildNarrativeCriticSmokeCasesV1 } from './NarrativePilotSmokeV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

function load<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES, ...parts), 'utf8')) as T;
}

describe('narrative critic adversarial smoke cases v1', () => {
  it('builds one valid control and four deterministic-valid semantic mutations', () => {
    const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
    const response = load<NarrativeScriptResponseV1>(
      'narrative-pilot-v1', 'paris-premium-es.response.json'
    );
    const cases = buildNarrativeCriticSmokeCasesV1(
      buildParisNarrativeScriptRequestV1(route), response.scripts
    );

    expect(cases.map(({ name, expectedVerdict }) => ({ name, expectedVerdict }))).toEqual([
      { name: 'valid', expectedVerdict: 'approve' },
      { name: 'invented_causality', expectedVerdict: 'reject' },
      { name: 'cross_attribution', expectedVerdict: 'reject' },
      { name: 'false_character', expectedVerdict: 'reject' },
      { name: 'misleading_omission', expectedVerdict: 'reject' },
    ]);
    for (const item of cases) {
      expect(item.request.scripts.every((script) => (
        narrativeWordCountV1(script) === script.wordCount
      ))).toBe(true);
    }
    expect(JSON.stringify(cases[1].request.scripts)).toContain('Victor Hugo provocó');
    expect(JSON.stringify(cases[2].request.scripts)).toContain('Henri II inició en 1190');
    expect(JSON.stringify(cases[3].request.scripts)).toContain('Camille Desmoulins era Luis XVI');
    expect(JSON.stringify(
      cases[4].request.scripts.find((script) => script.sceneId === 'louvre')
    )).not.toContain('Revolución');
  });
});
