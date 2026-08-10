import { readFileSync } from 'fs';
import { join } from 'path';
import { PoiEnrichmentSnapshot } from './PoiEnrichmentSnapshot';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import { WikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';
import { buildNarrativeEvidenceCaseFromWorkbenchV3 } from './NarrativeEvidenceV3';
import {
  NarrativeClaimPlanV3,
  NarrativeScriptRequestV3,
  buildNarrativeScriptRequestV3,
  canonicalizeNarrativeClaimPlanV3,
  materializeNarrativeScriptsV3,
  narrativeClaimPlanDraftSchemaV3,
  narrativeProseDraftSchemaV3,
  validateNarrativeClaimPlanV3,
} from './NarrativeContractsV3';
import { NarrativeBlockKindV1, narrativeWordCountV1 } from './NarrativePilotV1';

const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];

function request(): NarrativeScriptRequestV3 {
  const root = join(__dirname, '..', '..', '..');
  const workbench = JSON.parse(readFileSync(join(
    root, 'fixtures', 'editorial-v7', 'madrid-history-es-120.json'
  ), 'utf8')) as EditorialWorkbenchV7;
  const sources = JSON.parse(readFileSync(join(
    root, 'fixtures', 'sources', 'madrid-history-es.json'
  ), 'utf8')) as PoiEnrichmentSnapshot;
  const core = JSON.parse(readFileSync(join(
    root, 'fixtures', 'editorial-v6', 'core', 'editorial-core-v6-madrid-20260807-e',
    'madrid-history-es-120.json'
  ), 'utf8')) as { prominence: WikimediaProminenceSnapshotV6 };
  return buildNarrativeScriptRequestV3(buildNarrativeEvidenceCaseFromWorkbenchV3(
    workbench, sources, core.prominence
  ));
}

function planDraft(input: NarrativeScriptRequestV3): unknown {
  return {
    schemaVersion: 'narrative-claim-plan-draft-v3',
    scenes: input.scenes.map((scene) => {
      const byRole = new Map(scene.evidenceFacts.map((fact) => [fact.role, fact]));
      const historical = byRole.get('historical')!;
      return {
        sceneId: scene.sceneId,
        openingType: 'architectural_reversal',
        blocks: BLOCKS.map((kind) => ({
          kind,
          purpose: `Propósito narrativo de ${kind}`,
          claims: kind === 'opening' ? [{
            text: 'Sitúa el cambio histórico sin inventar causalidad.',
            relation: historical.relationSupport.includes('chronology') ? 'chronology' : 'direct',
            evidenceFactIds: [historical.factId],
          }] : kind === 'look' ? [{
            text: 'Dirige la mirada hacia el detalle visible documentado.',
            relation: 'direct',
            evidenceFactIds: [byRole.get('observable')!.factId],
          }] : kind === 'human_conflict' ? [{
            text: 'Explica la decisión humana sustentada por la fuente.',
            relation: 'direct',
            evidenceFactIds: [byRole.get('human')!.factId],
          }] : [],
        })),
      };
    }),
  };
}

const WORDS = ['la', 'historia', 'de', 'este', 'lugar', 'se', 'entiende', 'con', 'una', 'mirada'];

function blockText(count: number, look: boolean): string {
  const words = Array.from({ length: count }, (_, index) => (
    index === 0 && look ? 'Mira' : WORDS[index % WORDS.length]
  ));
  words[0] = `${words[0][0].toUpperCase()}${words[0].slice(1)}`;
  words[words.length - 1] += '.';
  return words.join(' ');
}

function prose(input: NarrativeScriptRequestV3, counts = [25, 45, 45, 45, 45]): unknown {
  return {
    schemaVersion: 'narrative-prose-draft-v3',
    scripts: input.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      blocks: BLOCKS.map((kind, index) => ({
        kind,
        text: blockText(counts[index], kind === 'look'),
      })),
    })),
  };
}

describe('NarrativeContractsV3', () => {
  it('builds a strict three-scene request from the automatic evidence case', () => {
    const result = request();

    expect(result.schemaVersion).toBe('narrative-script-request-v3');
    expect(result.routeSceneIds).toEqual(['palace', 'mayor', 'alcala']);
    expect(result.scenes.every((scene) => scene.evidenceFacts.length === 3)).toBe(true);
    expect(result.scenes.every((scene) => scene.allowedProperNouns.length > 0)).toBe(true);
  });

  it('allows three selected claims across five purposeful blocks and assigns canonical IDs', () => {
    const input = request();
    const plan = canonicalizeNarrativeClaimPlanV3(planDraft(input), input);

    expect(plan.scenes[0].blocks.map((block) => block.blockId)).toEqual([
      'palace:opening', 'palace:look', 'palace:human_conflict',
      'palace:interpretation', 'palace:closing',
    ]);
    expect(plan.scenes[0].blocks.flatMap((block) => block.claims)).toHaveLength(3);
    expect(plan.scenes[0].blocks[3].claims).toEqual([]);
    expect(validateNarrativeClaimPlanV3(plan, input)).toEqual(plan);
  });

  it('rejects unsupported causality, cross-scene evidence, and duplicate fact assignment', () => {
    const input = request();
    const causality = planDraft(input) as any;
    causality.scenes[0].blocks[0].claims[0].relation = 'causality';
    expect(() => canonicalizeNarrativeClaimPlanV3(causality, input))
      .toThrow('does not support causality');

    const crossed = planDraft(input) as any;
    crossed.scenes[0].blocks[0].claims[0].evidenceFactIds = [
      input.scenes[1].evidenceFacts[0].factId,
    ];
    expect(() => canonicalizeNarrativeClaimPlanV3(crossed, input)).toThrow('same scene');

    const duplicated = planDraft(input) as any;
    duplicated.scenes[0].blocks[4].claims.push({
      text: 'Repite un hecho como relleno.',
      relation: 'direct',
      evidenceFactIds: [input.scenes[0].evidenceFacts[0].factId],
    });
    expect(() => canonicalizeNarrativeClaimPlanV3(duplicated, input))
      .toThrow('assigned to more than one claim');
  });

  it('derives navigation and accepts uneven blocks when the Unicode scene total is valid', () => {
    const input = request();
    const approvedPlan = canonicalizeNarrativeClaimPlanV3(planDraft(input), input);
    const scripts = materializeNarrativeScriptsV3(prose(input), input, approvedPlan);

    expect(scripts[0].blocks[0].text.trim().split(/\s+/u)).toHaveLength(25);
    expect(scripts[0].blocks[1].text.trim().split(/\s+/u)).toHaveLength(45);
    expect(scripts.map((script) => script.transition.targetSceneId)).toEqual([
      'mayor', 'alcala', null,
    ]);
    expect(scripts.every((script) => script.wordCount === narrativeWordCountV1(script))).toBe(true);
    expect(scripts.every((script) => script.wordCount >= 220 && script.wordCount <= 260)).toBe(true);
  });

  it('rejects a short scene using only the final 220-260 word authority', () => {
    const input = request();
    const approvedPlan = canonicalizeNarrativeClaimPlanV3(planDraft(input), input);

    expect(() => materializeNarrativeScriptsV3(
      prose(input, [20, 35, 35, 35, 35]), input, approvedPlan
    )).toThrow('requires 220 to 260 words');
  });

  it('keeps model schemas strict-compatible and excludes derived transition metadata', () => {
    const planSchema = JSON.stringify(narrativeClaimPlanDraftSchemaV3());
    const proseSchema = JSON.stringify(narrativeProseDraftSchemaV3());

    expect(planSchema).not.toMatch(/minItems|maxItems|uniqueItems|minLength|maxLength/);
    expect(proseSchema).not.toMatch(/transition|blockId|evidenceFactIds|wordCount|openingType/);
    expect(planSchema).toContain('"additionalProperties":false');
    expect(proseSchema).toContain('"additionalProperties":false');
  });
});
