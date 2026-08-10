import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeEvidenceCaseV4,
  NarrativeEvidenceFactV4,
  NarrativeEvidenceRoleV4,
  validateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';
import { NarrativeBlockKindV1 } from './NarrativePilotV1';

export const NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V4 = 'narrative-claim-plan-v4' as const;

export type NarrativeClaimRelationV4 = 'direct' | 'chronology' | 'causality' | 'interpretation';

export interface NarrativeClaimPlanClaimV4 {
  claimId: string;
  text: string;
  relation: NarrativeClaimRelationV4;
  evidenceFactIds: string[];
  basisFactIds: string[];
}

export interface NarrativeClaimPlanBlockV4 {
  blockId: string;
  kind: NarrativeBlockKindV1;
  evidenceFactIds: string[];
  claims: NarrativeClaimPlanClaimV4[];
}

export interface NarrativeClaimPlanSceneV4 {
  sceneId: string;
  openingType: 'tension_or_contrast';
  blocks: NarrativeClaimPlanBlockV4[];
  transition: {
    kind: 'walk_to_next' | 'tour_end';
    targetSceneId: string | null;
    text: string;
  };
  allowedProperNouns: string[];
  allowedNumbers: string[];
  allowedEvents: string[];
}

export interface NarrativeClaimPlanV4 {
  schemaVersion: typeof NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V4;
  scenes: NarrativeClaimPlanSceneV4[];
  duration: {
    wordsPerMinute: 120;
    walkingSeconds: number;
    observationSeconds: number;
    introductionWords: { minimum: 45; maximum: 75 };
    sceneBodyWords: { minimum: 160; maximum: 200 };
    acceptedTotalMinutes: { minimum: 55; maximum: 65 };
  };
}

const ROLE_BLOCK: Record<NarrativeEvidenceRoleV4, NarrativeBlockKindV1> = {
  tension_or_contrast: 'opening',
  observable: 'look',
  human_agency: 'human_conflict',
  historical_change: 'interpretation',
};

const TRANSITIONS: Record<string, string> = {
  palace: 'Cruza la Plaza de la Armería hacia la Catedral de la Almudena y sitúate frente a su fachada principal.',
  almudena: 'Sigue por la calle Mayor hasta la Plaza de la Villa y detente junto a la estatua central.',
  villa: 'Continúa por la calle Mayor, gira hacia la Plaza Mayor y entra bajo uno de sus arcos.',
  mayor: 'Sal hacia la calle Mayor y continúa hasta la Puerta del Sol, buscando el espacio semicircular de la plaza.',
  sol: 'Toma la calle de Alcalá y avanza hasta la plaza de Cibeles; observa la fuente desde la acera.',
  cibeles: 'Continúa por la calle de Alcalá hasta la Plaza de la Independencia y busca la Puerta de Alcalá.',
  alcala: 'El recorrido termina aquí, frente a la Puerta de Alcalá.',
};

function roleFact(facts: NarrativeEvidenceFactV4[], role: NarrativeEvidenceRoleV4) {
  const fact = facts.find((candidate) => candidate.role === role);
  if (!fact) throw new Error(`narrative v4 is missing ${role}`);
  return fact;
}

function directRelation(fact: NarrativeEvidenceFactV4): NarrativeClaimRelationV4 {
  if (fact.allowsCausality) return 'causality';
  if (fact.role === 'historical_change' && fact.relationSupport.includes('chronology')) {
    return 'chronology';
  }
  return 'direct';
}

function factClaim(
  sceneId: string,
  kind: NarrativeBlockKindV1,
  fact: NarrativeEvidenceFactV4
): NarrativeClaimPlanClaimV4 {
  const text = fact.visibility.kind === 'on_site'
    ? `${fact.visibility.cueEs} ${fact.atomicTextEs}`
    : fact.atomicTextEs;
  return {
    claimId: `${sceneId}:${kind}:${fact.factId}`,
    text,
    relation: directRelation(fact),
    evidenceFactIds: [fact.factId],
    basisFactIds: [],
  } satisfies NarrativeClaimPlanClaimV4;
}

function normalizedNameTokens(value: string): string[] {
  return value.match(/\b\p{Lu}[\p{L}’'-]*(?:\s+\p{Lu}[\p{L}’'-]*)*/gu) ?? [];
}

function properNouns(evidence: NarrativeEvidenceCaseV4, sceneIndex: number): string[] {
  const scene = evidence.scenes[sceneIndex];
  const fields = [
    evidence.city, evidence.title, evidence.subtitle, scene.name,
    ...scene.evidenceFacts.flatMap((fact) => [
      fact.atomicTextEs, fact.originalExcerpt, fact.source.title,
    ]),
  ];
  return [...new Set([
    evidence.city,
    ...evidence.scenes.map((candidate) => candidate.name),
    ...fields.flatMap(normalizedNameTokens),
  ].map((value) => value.trim()).filter(Boolean))].sort();
}

function numbers(sceneFacts: NarrativeEvidenceFactV4[]): string[] {
  return [...new Set(sceneFacts.flatMap((fact) => (
    `${fact.atomicTextEs} ${fact.originalExcerpt}`.match(/\d+(?:[.,]\d+)*/g) ?? []
  )))].sort();
}

export function buildNarrativeClaimPlanV4(
  evidence: NarrativeEvidenceCaseV4
): NarrativeClaimPlanV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  return {
    schemaVersion: NARRATIVE_CLAIM_PLAN_SCHEMA_VERSION_V4,
    scenes: evidence.scenes.map((scene, sceneIndex) => {
      const blocks = (Object.entries(ROLE_BLOCK) as Array<[
        NarrativeEvidenceRoleV4, NarrativeBlockKindV1,
      ]>).map(([role, kind]) => {
        const fact = roleFact(scene.evidenceFacts, role);
        return {
          blockId: `${scene.sceneId}:${kind}`,
          kind,
          evidenceFactIds: [fact.factId],
          claims: [factClaim(scene.sceneId, kind, fact)],
        };
      });
      const closingBasis = [...scene.closingInterpretation.basisFactIds].sort();
      blocks.push({
        blockId: `${scene.sceneId}:closing`,
        kind: 'closing',
        evidenceFactIds: closingBasis,
        claims: [{
          claimId: `${scene.sceneId}:closing:editorial`,
          text: scene.closingInterpretation.textEs,
          relation: 'interpretation',
          evidenceFactIds: [],
          basisFactIds: closingBasis,
        }],
      });
      const transitionText = TRANSITIONS[scene.sceneId];
      if (!transitionText) throw new Error(`narrative v4 transition missing for ${scene.sceneId}`);
      return {
        sceneId: scene.sceneId,
        openingType: 'tension_or_contrast',
        blocks,
        transition: {
          kind: scene.nextSceneId ? 'walk_to_next' : 'tour_end',
          targetSceneId: scene.nextSceneId,
          text: transitionText,
        },
        allowedProperNouns: properNouns(evidence, sceneIndex),
        allowedNumbers: numbers(scene.evidenceFacts),
        allowedEvents: scene.evidenceFacts.map((fact) => fact.factId).sort(),
      };
    }),
    duration: {
      wordsPerMinute: 120,
      walkingSeconds: evidence.route.walkingSeconds,
      observationSeconds: evidence.scenes.length * 45,
      introductionWords: { minimum: 45, maximum: 75 },
      sceneBodyWords: { minimum: 160, maximum: 200 },
      acceptedTotalMinutes: { minimum: 55, maximum: 65 },
    },
  };
}

export function narrativeClaimPlanFingerprintV4(plan: NarrativeClaimPlanV4): string {
  return editorialFingerprintV7(plan);
}
