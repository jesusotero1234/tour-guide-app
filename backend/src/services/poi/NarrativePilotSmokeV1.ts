import {
  buildNarrativeCriticRequestV1,
  NarrativeCriticRequestV1,
} from './NarrativePilotCriticV1';
import {
  NarrativeScriptRequestV1,
  SceneNarrativeScriptV1,
  validateNarrativeScriptsV1,
} from './NarrativePilotV1';

export type NarrativeCriticSmokeCaseNameV1 =
  | 'valid'
  | 'invented_causality'
  | 'cross_attribution'
  | 'false_character'
  | 'misleading_omission';

export interface NarrativeCriticSmokeCaseV1 {
  name: NarrativeCriticSmokeCaseNameV1;
  expectedVerdict: 'approve' | 'reject';
  request: NarrativeCriticRequestV1;
}

const WORD = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;

function replaceLeadingWords(text: string, claim: string): string {
  const claimCount = claim.match(WORD)?.length ?? 0;
  const matches = [...text.matchAll(WORD)];
  if (claimCount === 0 || matches.length <= claimCount) {
    throw new Error('narrative smoke mutation cannot preserve the word count');
  }
  return `${claim} ${text.slice(matches[claimCount].index)}`;
}

function mutate(
  scripts: SceneNarrativeScriptV1[],
  sceneId: string,
  blockIndex: number,
  claim: string
): SceneNarrativeScriptV1[] {
  const result = structuredClone(scripts);
  const scene = result.find((candidate) => candidate.sceneId === sceneId);
  if (!scene) throw new Error(`narrative smoke scene ${sceneId} is missing`);
  scene.blocks[blockIndex].text = replaceLeadingWords(scene.blocks[blockIndex].text, claim);
  return result;
}

export function buildNarrativeCriticSmokeCasesV1(
  request: NarrativeScriptRequestV1,
  scripts: SceneNarrativeScriptV1[]
): NarrativeCriticSmokeCaseV1[] {
  validateNarrativeScriptsV1(scripts, request);
  const cases: Array<{
    name: NarrativeCriticSmokeCaseNameV1;
    expectedVerdict: 'approve' | 'reject';
    scripts: SceneNarrativeScriptV1[];
  }> = [
    { name: 'valid', expectedVerdict: 'approve', scripts: structuredClone(scripts) },
    {
      name: 'invented_causality', expectedVerdict: 'reject',
      scripts: mutate(
        scripts, 'notre-dame', 2,
        'Victor Hugo provocó el incendio de Notre-Dame en 2019.'
      ),
    },
    {
      name: 'cross_attribution', expectedVerdict: 'reject',
      scripts: mutate(
        scripts, 'louvre', 2,
        'Henri II inició en 1190 la fortaleza del Louvre.'
      ),
    },
    {
      name: 'false_character', expectedVerdict: 'reject',
      scripts: mutate(
        scripts, 'palais-royal', 2,
        'Camille Desmoulins era Luis XVI y gobernaba el Palais-Royal.'
      ),
    },
  ];
  const omission = mutate(
    scripts, 'louvre', 4,
    'La monarquía mantuvo sin ruptura política el acceso público.'
  );
  const omissionScene = omission.find((candidate) => candidate.sceneId === 'louvre');
  if (!omissionScene) throw new Error('narrative smoke Louvre scene is missing');
  for (const block of omissionScene.blocks) {
    block.text = block.text.replace(/\bRevolución\b/gu, 'continuidad');
  }
  omissionScene.transition.text = omissionScene.transition.text
    .replace(/\bRevolución\b/gu, 'continuidad');
  cases.push({
    name: 'misleading_omission', expectedVerdict: 'reject', scripts: omission,
  });

  return cases.map((item) => ({
    name: item.name,
    expectedVerdict: item.expectedVerdict,
    request: buildNarrativeCriticRequestV1(request, item.scripts),
  }));
}
