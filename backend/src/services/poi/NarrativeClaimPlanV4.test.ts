import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { hydrateNarrativeEvidenceCaseV4 } from './NarrativeEvidenceV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';

const BLOCK_KINDS = ['opening', 'look', 'human_conflict', 'interpretation', 'closing'];

describe('NarrativeClaimPlanV4', () => {
  it('maps explicit evidence roles to the fixed blocks without a model call', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const plan = buildNarrativeClaimPlanV4(evidence);

    expect(plan.schemaVersion).toBe('narrative-claim-plan-v4');
    expect(plan.scenes).toHaveLength(7);
    for (const [sceneIndex, scene] of plan.scenes.entries()) {
      expect(scene.sceneId).toBe(evidence.scenes[sceneIndex].sceneId);
      expect(scene.openingType).toBe('tension_or_contrast');
      expect(scene.blocks.map((block) => block.kind)).toEqual(BLOCK_KINDS);
      expect(scene.transition.targetSceneId).toBe(evidence.scenes[sceneIndex].nextSceneId);
      expect(scene.transition.text.trim()).not.toBe('');

      const directClaims = scene.blocks.flatMap((block) => block.claims)
        .filter((claim) => claim.relation !== 'interpretation');
      const directFactIds = directClaims.flatMap((claim) => claim.evidenceFactIds);
      expect(directFactIds.sort()).toEqual(
        evidence.scenes[sceneIndex].evidenceFacts.map((fact) => fact.factId).sort()
      );
      expect(new Set(directFactIds).size).toBe(4);

      const closing = scene.blocks[4].claims[0];
      expect(closing.relation).toBe('interpretation');
      expect(closing.evidenceFactIds).toEqual([]);
      expect(closing.basisFactIds.sort()).toEqual(directFactIds.sort());
    }
  });

  it('builds the same plan when evidence facts are permuted', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const { fingerprint: _fingerprint, ...content } = evidence;
    const permuted = hydrateNarrativeEvidenceCaseV4({
      ...content,
      scenes: content.scenes.map((scene) => ({
        ...scene,
        evidenceFacts: [...scene.evidenceFacts].reverse().map((fact) => {
          const { fingerprint: _factFingerprint, source, ...factContent } = fact;
          const { fingerprint: _sourceFingerprint, ...sourceContent } = source;
          return { ...factContent, source: sourceContent };
        }),
      })),
    });

    expect(buildNarrativeClaimPlanV4(permuted)).toEqual(buildNarrativeClaimPlanV4(evidence));
  });

  it('derives identifiers, evidence, transitions, counts, names, numbers, and events in code', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const plan = buildNarrativeClaimPlanV4(evidence);

    expect(buildNarrativeClaimPlanV4).toHaveLength(1);
    expect(plan.duration).toEqual({
      wordsPerMinute: 120,
      walkingSeconds: 2473.9,
      observationSeconds: 315,
      introductionWords: { minimum: 45, maximum: 75 },
      sceneBodyWords: { minimum: 160, maximum: 200 },
      acceptedTotalMinutes: { minimum: 55, maximum: 65 },
    });
    for (const scene of plan.scenes) {
      expect(scene.blocks.every((block) => block.blockId.startsWith(`${scene.sceneId}:`))).toBe(true);
      expect(scene.blocks.flatMap((block) => block.claims)
        .every((claim) => claim.claimId.startsWith(`${scene.sceneId}:`))).toBe(true);
      expect(scene.allowedProperNouns).toContain(evidence.city);
      expect(scene.allowedEvents).toEqual(
        evidence.scenes.find((candidate) => candidate.sceneId === scene.sceneId)!
          .evidenceFacts.map((fact) => fact.factId).sort()
      );
      expect(scene.allowedNumbers.every((value) => /^\d/.test(value))).toBe(true);
    }
  });
});
