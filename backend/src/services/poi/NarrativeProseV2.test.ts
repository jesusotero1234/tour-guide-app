import { readFileSync } from 'fs';
import { join } from 'path';
import {
  canonicalizeNarrativeClaimPlanV1,
  NarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import {
  materializeNarrativeScriptsV2,
  narrativeProseDraftSchemaV2,
  narrativeProseFingerprintV2,
  validateNarrativeProseDraftV2,
} from './NarrativeProseV2';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import {
  NarrativeBlockKindV1,
  NarrativeScriptRequestV1,
  narrativeWordCountV1,
} from './NarrativePilotV1';

const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const VOCABULARY = [
  ['catedral', 'isla', 'piedra', 'torre', 'fachada', 'templo', 'orilla', 'campana'],
  ['palacio', 'foso', 'museo', 'patio', 'galería', 'fortaleza', 'colección', 'público'],
  ['jardín', 'cafés', 'arcadas', 'comercio', 'paseo', 'foro', 'columnas', 'plaza'],
];
const CONNECTORS = ['la', 'de', 'y', 'en', 'con', 'que', 'su', 'para'];

function request(): NarrativeScriptRequestV1 {
  const path = join(
    __dirname, '..', '..', '..', 'fixtures', 'editorial-v7', 'paris-history-en-120.json'
  );
  return buildParisNarrativeScriptRequestV1(
    JSON.parse(readFileSync(path, 'utf8')) as EditorialWorkbenchV7
  );
}

function plan(input: NarrativeScriptRequestV1): NarrativeClaimPlanV1 {
  const openings = ['rescue_decision', 'architectural_reversal', 'dated_public_action'];
  return canonicalizeNarrativeClaimPlanV1({
    schemaVersion: 'narrative-claim-plan-draft-v1',
    scenes: input.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      openingType: openings[sceneIndex],
      blocks: BLOCKS.map((kind, blockIndex) => ({
        kind,
        claims: [{
          text: `Hecho aprobado ${blockIndex + 1}`,
          relation: blockIndex === 3 ? 'interpretation' : 'direct',
          evidenceFactIds: [scene.evidenceFacts[blockIndex % 4].factId],
        }],
      })),
    })),
  }, input);
}

function blockText(sceneIndex: number, blockIndex: number, count = 42): string {
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (blockIndex === 1 && index === 0) words.push('Mira');
    else if (index % 2 === 0) words.push(VOCABULARY[sceneIndex][(index + blockIndex) % 8]);
    else words.push(CONNECTORS[(index + blockIndex) % 8]);
  }
  words[words.length - 1] = `${words[words.length - 1]}.`;
  return words.join(' ');
}

function transitionText(sceneIndex: number, target: string | null, count = 22): string {
  const first = target
    ? ['Continúa', 'ahora', 'hacia', target]
    : ['Aquí', 'termina', 'nuestro', 'recorrido'];
  const vocabulary = VOCABULARY[sceneIndex];
  const words = [...first];
  while (words.length < count) {
    const index = words.length;
    words.push(index % 2 === 0 ? CONNECTORS[index % 8] : vocabulary[index % 8]);
  }
  words[words.length - 1] = `${words[words.length - 1]}.`;
  return words.join(' ');
}

function prose(input: NarrativeScriptRequestV1): any {
  return {
    schemaVersion: 'narrative-prose-draft-v2',
    scripts: input.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      blocks: BLOCKS.map((kind, blockIndex) => ({
        kind,
        text: blockText(sceneIndex, blockIndex),
      })),
      transitionText: transitionText(sceneIndex, scene.nextSceneId),
    })),
  };
}

describe('NarrativeProseV2', () => {
  it('derives block IDs, evidence, route transitions, and Unicode word counts', () => {
    const input = request();
    const approvedPlan = plan(input);
    const scripts = materializeNarrativeScriptsV2(prose(input), input, approvedPlan);

    expect(scripts[0].blocks[0]).toMatchObject({
      blockId: 'notre-dame:opening',
      kind: 'opening',
      evidenceFactIds: [input.scenes[0].evidenceFacts[0].factId],
    });
    expect(scripts.map((script) => script.transition.targetSceneId)).toEqual([
      'sainte-chapelle', 'carrousel', null,
    ]);
    expect(scripts.map((script) => script.transition.kind)).toEqual([
      'walk_to_next', 'walk_to_next', 'tour_end',
    ]);
    expect(scripts.every((script) => script.wordCount === narrativeWordCountV1(script))).toBe(true);
    expect(scripts.every((script) => script.wordCount >= 220 && script.wordCount <= 260)).toBe(true);
  });

  it('enforces 42-45 space tokens per block and 22-25 per transition', () => {
    const input = request();
    const scripts = materializeNarrativeScriptsV2(prose(input), input, plan(input));

    expect(scripts.flatMap((script) => script.blocks).every((block) => (
      block.text.trim().split(/\s+/u).length >= 42
        && block.text.trim().split(/\s+/u).length <= 45
    ))).toBe(true);
    expect(scripts.every((script) => {
      const count = script.transition.text.trim().split(/\s+/u).length;
      return count >= 22 && count <= 25;
    })).toBe(true);
  });

  it('rejects model-controlled IDs, evidence, destinations, counts, and opening types', () => {
    const input = request();
    for (const [field, value] of [
      ['blockId', 'invented'],
      ['evidenceFactIds', ['invented']],
      ['targetSceneId', 'invented'],
      ['wordCount', 232],
      ['openingType', 'rescue_decision'],
    ] as const) {
      const raw = prose(input);
      if (field === 'blockId' || field === 'evidenceFactIds') raw.scripts[0].blocks[0][field] = value;
      else raw.scripts[0][field] = value;
      expect(() => validateNarrativeProseDraftV2(raw, input)).toThrow('unexpected');
    }
  });

  it('rejects scene and block order changes', () => {
    const input = request();
    const scenes = prose(input);
    [scenes.scripts[0], scenes.scripts[1]] = [scenes.scripts[1], scenes.scripts[0]];
    expect(() => validateNarrativeProseDraftV2(scenes, input)).toThrow('scene order');

    const blocks = prose(input);
    [blocks.scripts[0].blocks[0], blocks.scripts[0].blocks[1]] = [
      blocks.scripts[0].blocks[1], blocks.scripts[0].blocks[0],
    ];
    expect(() => validateNarrativeProseDraftV2(blocks, input)).toThrow('block order');
  });

  it('rejects prose outside either local token range', () => {
    const input = request();
    const shortBlock = prose(input);
    shortBlock.scripts[0].blocks[0].text = blockText(0, 0, 41);
    expect(() => materializeNarrativeScriptsV2(shortBlock, input, plan(input)))
      .toThrow('42 to 45');

    const longTransition = prose(input);
    longTransition.scripts[1].transitionText = transitionText(1, 'carrousel', 26);
    expect(() => materializeNarrativeScriptsV2(longTransition, input, plan(input)))
      .toThrow('22 to 25');
  });

  it('accepts only navigational transitions to the derived next stop or tour end', () => {
    const input = request();
    const factual = prose(input);
    factual.scripts[0].transitionText = transitionText(0, null);
    expect(() => materializeNarrativeScriptsV2(factual, input, plan(input)))
      .toThrow('next scene');

    const noEnd = prose(input);
    noEnd.scripts[2].transitionText = transitionText(2, 'louvre');
    expect(() => materializeNarrativeScriptsV2(noEnd, input, plan(input)))
      .toThrow('tour end');
  });

  it('applies the existing final scene validator after deriving model-forbidden fields', () => {
    const input = request();
    const unsupportedName = prose(input);
    unsupportedName.scripts[0].blocks[0].text = unsupportedName.scripts[0].blocks[0].text
      .replace(' catedral', ' Napoleón');

    expect(() => materializeNarrativeScriptsV2(unsupportedName, input, plan(input)))
      .toThrow('unsupported proper name');
  });

  it('uses a strict-compatible prose schema without unsupported cardinality keywords', () => {
    const serialized = JSON.stringify(narrativeProseDraftSchemaV2());
    expect(serialized).not.toMatch(/minItems|maxItems|uniqueItems|minLength|maxLength/);
    expect(serialized).not.toMatch(/blockId|evidenceFactIds|targetSceneId|wordCount|openingType/);
    expect(serialized).toContain('"additionalProperties":false');
  });

  it('fingerprints the fully derived text independently', () => {
    const input = request();
    const scripts = materializeNarrativeScriptsV2(prose(input), input, plan(input));
    const changed = structuredClone(scripts);
    changed[0].blocks[0].text = changed[0].blocks[0].text.replace('catedral', 'templo');

    expect(narrativeProseFingerprintV2(scripts)).not.toBe(narrativeProseFingerprintV2(changed));
  });
});
