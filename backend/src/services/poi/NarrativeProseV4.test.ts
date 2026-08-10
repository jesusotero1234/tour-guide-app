import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import {
  NarrativeProseDraftV4,
  materializeNarrativeProseV4,
  narrativeProseDraftSchemaV4,
} from './NarrativeProseV4';

const KINDS = ['opening', 'look', 'human_conflict', 'interpretation', 'closing'] as const;

function padTo(text: string, target: number, marker: string): string {
  const words = text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? [];
  const filler = [marker, 'aquí', 'la', 'historia', 'se', 'observa'];
  const result = [...words];
  let index = 0;
  while (result.length < target) {
    result.push(filler[index % filler.length]);
    index += 1;
  }
  const padded = result.slice(0, target);
  padded[target - 1] = marker;
  return padded.join(' ');
}

function validDraft(): NarrativeProseDraftV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  return {
    schemaVersion: 'narrative-prose-draft-v4',
    introduction: padTo(
      'Madrid se entiende caminando entre instituciones y espacios públicos que cambiaron la escala de una villa medieval hasta convertirla en capital moderna',
      50,
      'madrid'
    ),
    scripts: evidence.scenes.map((scene) => {
      const cue = scene.evidenceFacts.find((fact) => fact.role === 'observable')!.visibility;
      if (cue.kind !== 'on_site') throw new Error('test fixture requires an on-site cue');
      return {
        sceneId: scene.sceneId,
        blocks: KINDS.map((kind) => ({
          kind,
          text: padTo(
            kind === 'look'
              ? cue.cueEs
              : `En ${scene.name} ${scene.sceneId} este bloque explica ${scene.sceneId} la transformación con ${scene.sceneId} claridad`,
            32,
            scene.sceneId
          ),
        })),
      };
    }),
  };
}

describe('NarrativeProseV4', () => {
  it('exposes a writer schema containing prose fields only', () => {
    const schema = JSON.stringify(narrativeProseDraftSchemaV4());

    expect(schema).toContain('introduction');
    expect(schema).toContain('sceneId');
    expect(schema).toContain('kind');
    expect(schema).toContain('text');
    expect(schema).not.toMatch(/factId|evidenceFactIds|blockId|openingType|transition|wordCount/);
  });

  it('materializes code-owned metadata, transitions, counts, and an honest duration', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const plan = buildNarrativeClaimPlanV4(evidence);
    const text = materializeNarrativeProseV4(validDraft(), evidence, plan);

    expect(text.scripts).toHaveLength(7);
    expect(text.scripts.every((script) => script.bodyWordCount === 160)).toBe(true);
    expect(text.scripts.map((script) => script.transition)).toEqual(
      plan.scenes.map((scene) => scene.transition)
    );
    expect(text.scripts.flatMap((script) => script.blocks)
      .every((block) => block.blockId && block.evidenceFactIds.length > 0)).toBe(true);
    expect(text.durationMinutes).toBeGreaterThanOrEqual(55);
    expect(text.durationMinutes).toBeLessThanOrEqual(65);
  });

  it.each([
    ['introduction', (draft: NarrativeProseDraftV4) => { draft.introduction = 'Demasiado breve'; }],
    ['scene count', (draft: NarrativeProseDraftV4) => { draft.scripts.pop(); }],
    ['block order', (draft: NarrativeProseDraftV4) => { draft.scripts[0].blocks.reverse(); }],
    ['scene body words', (draft: NarrativeProseDraftV4) => { draft.scripts[0].blocks[0].text = 'Muy breve'; }],
    ['look instruction', (draft: NarrativeProseDraftV4) => {
      draft.scripts[0].blocks[1].text = padTo('La arquitectura permanece ante el visitante', 32, 'palace');
    }],
    ['unknown number', (draft: NarrativeProseDraftV4) => {
      draft.scripts[0].blocks[0].text = draft.scripts[0].blocks[0].text.replace('palace', '9999');
    }],
    ['unknown proper noun', (draft: NarrativeProseDraftV4) => {
      draft.scripts[0].blocks[0].text = draft.scripts[0].blocks[0].text.replace('palace', 'Napoleón Bonaparte');
    }],
    ['non-Spanish prose', (draft: NarrativeProseDraftV4) => {
      draft.scripts[0].blocks = KINDS.map((kind) => ({
        kind,
        text: padTo('the building shows how power changed in this public place', 32, 'palace'),
      }));
    }],
  ])('rejects invalid %s deterministically', (_label, mutate) => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const draft = validDraft();
    mutate(draft);

    expect(() => materializeNarrativeProseV4(
      draft,
      evidence,
      buildNarrativeClaimPlanV4(evidence)
    )).toThrow();
  });

  it('rejects a seven-gram repeated between scenes', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const draft = validDraft();
    const repeated = 'esta secuencia completa aparece igual en ambas escenas';
    draft.scripts[0].blocks[0].text = padTo(repeated, 32, 'palace');
    draft.scripts[1].blocks[0].text = padTo(repeated, 32, 'almudena');

    expect(() => materializeNarrativeProseV4(
      draft,
      evidence,
      buildNarrativeClaimPlanV4(evidence)
    )).toThrow('repeated seven-gram');
  });
});
