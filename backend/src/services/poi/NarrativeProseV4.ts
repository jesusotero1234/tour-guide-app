import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeClaimPlanV4,
  validateNarrativeClaimPlanV4,
} from './NarrativeClaimPlanV4';
import {
  NarrativeEvidenceCaseV4,
  narrativeUnicodeWordsV4,
  validateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';
import { NarrativeBlockKindV1 } from './NarrativePilotV1';

export const NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V4 = 'narrative-prose-draft-v4' as const;
export const NARRATIVE_TOUR_TEXT_SCHEMA_VERSION_V4 = 'narrative-tour-text-v4' as const;

export interface NarrativeProseDraftV4 {
  schemaVersion: typeof NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V4;
  introduction: string;
  scripts: Array<{
    sceneId: string;
    blocks: Array<{
      kind: NarrativeBlockKindV1;
      text: string;
    }>;
  }>;
}

export interface NarrativeTourTextV4 {
  schemaVersion: typeof NARRATIVE_TOUR_TEXT_SCHEMA_VERSION_V4;
  introduction: string;
  scripts: Array<{
    sceneId: string;
    name: string;
    blocks: Array<{
      blockId: string;
      kind: NarrativeBlockKindV1;
      text: string;
      evidenceFactIds: string[];
    }>;
    transition: NarrativeClaimPlanV4['scenes'][number]['transition'];
    bodyWordCount: number;
  }>;
  totalWordCount: number;
  durationSeconds: number;
  durationMinutes: number;
}

const BLOCK_KINDS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const VISUAL_INSTRUCTION = /\b(mira|observa|fíjate|levanta|busca|compara|gira|cuenta|distingue|reconoce|localiza)\b/iu;
const SPANISH_MARKERS = new Set([
  'a', 'al', 'aquí', 'como', 'con', 'de', 'del', 'el', 'en', 'es', 'esta', 'este',
  'la', 'las', 'lo', 'los', 'para', 'por', 'que', 'se', 'sin', 'su', 'un', 'una', 'y',
]);
const CUE_STOP_WORDS = new Set([
  'aquí', 'como', 'con', 'desde', 'distingue', 'frente', 'gira', 'hacia', 'hasta',
  'mira', 'observa', 'para', 'sobre', 'vista', 'busca', 'cuenta', 'reconoce', 'localiza',
]);
const SENTENCE_STARTERS = new Set([
  'aquí', 'aunque', 'busca', 'compara', 'continúa', 'cuenta', 'desde', 'distingue',
  'el', 'en', 'esta', 'este', 'gira', 'la', 'las', 'los', 'madrid', 'mira', 'observa',
  'sigue', 'sol', 'una', 'un',
]);

function strictObject(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

export function narrativeProseDraftSchemaV4(): Record<string, unknown> {
  const block = strictObject({
    kind: { type: 'string', enum: BLOCK_KINDS },
    text: { type: 'string' },
  });
  const scene = strictObject({
    sceneId: { type: 'string' },
    blocks: { type: 'array', items: block },
  });
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V4] },
    introduction: { type: 'string' },
    scripts: { type: 'array', items: scene },
  });
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizedWords(value: string): string[] {
  return narrativeUnicodeWordsV4(normalized(value));
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function validateSpanish(text: string, label: string): void {
  const words = normalizedWords(text);
  const markerCount = words.filter((word) => SPANISH_MARKERS.has(word)).length;
  if (words.length === 0 || markerCount / words.length < 0.08) {
    throw new Error(`${label} must be Spanish es-ES prose`);
  }
}

function validateLook(text: string, cue: string, label: string): void {
  if (!VISUAL_INSTRUCTION.test(text)) {
    throw new Error(`${label} requires a visual instruction`);
  }
  const cueTerms = [...new Set(normalizedWords(cue).filter((word) => (
    word.length >= 5 && !CUE_STOP_WORDS.has(word)
  )))];
  const textTerms = new Set(normalizedWords(text));
  const requiredMatches = Math.min(2, cueTerms.length);
  if (cueTerms.filter((term) => textTerms.has(term)).length < requiredMatches) {
    throw new Error(`${label} does not develop the official visual cue`);
  }
}

function allowedProperWords(values: string[]): Set<string> {
  return new Set(values.flatMap((value) => normalizedWords(value)));
}

function validateProperNouns(text: string, allowed: Set<string>, label: string): void {
  const matches = text.matchAll(/\b\p{Lu}[\p{L}’'-]*(?:\s+\p{Lu}[\p{L}’'-]*)*/gu);
  for (const match of matches) {
    const words = normalizedWords(match[0]);
    while (words.length > 0 && SENTENCE_STARTERS.has(words[0])) words.shift();
    if (words.some((word) => !allowed.has(word))) {
      throw new Error(`${label} contains an unknown proper noun: ${match[0]}`);
    }
  }
}

function validateNumbers(text: string, allowed: Set<string>, label: string): void {
  for (const number of text.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    if (!allowed.has(number)) throw new Error(`${label} contains an unknown number: ${number}`);
  }
}

function validateSevenGrams(sceneTexts: Array<{ sceneId: string; text: string }>): void {
  const seen = new Map<string, string>();
  for (const scene of sceneTexts) {
    const words = normalizedWords(scene.text);
    const local = new Set<string>();
    for (let index = 0; index <= words.length - 7; index += 1) {
      local.add(words.slice(index, index + 7).join(' '));
    }
    for (const gram of local) {
      const owner = seen.get(gram);
      if (owner && owner !== scene.sceneId) {
        throw new Error(
          `narrative v4 repeated seven-gram between ${owner} and ${scene.sceneId}: ${gram}`
        );
      }
      seen.set(gram, scene.sceneId);
    }
  }
}

export function materializeNarrativeProseV4(
  raw: unknown,
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4
): NarrativeTourTextV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  validateNarrativeClaimPlanV4(plan, evidence);
  const root = objectValue(raw, 'narrative prose draft v4');
  exactKeys(root, ['schemaVersion', 'introduction', 'scripts'], 'narrative prose draft v4');
  if (root.schemaVersion !== NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V4
    || !Array.isArray(root.scripts) || root.scripts.length !== evidence.scenes.length) {
    throw new Error('narrative prose draft v4 metadata changed');
  }
  const introduction = requiredText(root.introduction, 'narrative v4 introduction');
  const introductionWords = narrativeUnicodeWordsV4(introduction).length;
  if (introductionWords < plan.duration.introductionWords.minimum
    || introductionWords > plan.duration.introductionWords.maximum) {
    throw new Error('narrative v4 introduction must contain 45 to 75 Unicode words');
  }
  validateSpanish(introduction, 'narrative v4 introduction');
  const globalProper = allowedProperWords(plan.scenes.flatMap((scene) => scene.allowedProperNouns));
  const globalNumbers = new Set([
    ...plan.scenes.flatMap((scene) => scene.allowedNumbers),
    ...(evidence.experienceLabel.match(/\d+(?:[.,]\d+)*/g) ?? []),
  ]);
  validateProperNouns(introduction, globalProper, 'narrative v4 introduction');
  validateNumbers(introduction, globalNumbers, 'narrative v4 introduction');

  const scripts = root.scripts.map((rawScript, sceneIndex) => {
    const rawScene = objectValue(rawScript, `narrative v4 scripts[${sceneIndex}]`);
    exactKeys(rawScene, ['sceneId', 'blocks'], `narrative v4 scripts[${sceneIndex}]`);
    const evidenceScene = evidence.scenes[sceneIndex];
    const planScene = plan.scenes[sceneIndex];
    if (rawScene.sceneId !== evidenceScene.sceneId || !Array.isArray(rawScene.blocks)
      || rawScene.blocks.length !== BLOCK_KINDS.length) {
      throw new Error(`narrative v4 ${evidenceScene.sceneId} scene structure changed`);
    }
    const blocks = rawScene.blocks.map((rawBlock, blockIndex) => {
      const block = objectValue(rawBlock, `${evidenceScene.sceneId} blocks[${blockIndex}]`);
      exactKeys(block, ['kind', 'text'], `${evidenceScene.sceneId} blocks[${blockIndex}]`);
      const expected = planScene.blocks[blockIndex];
      if (block.kind !== expected.kind) {
        throw new Error(`narrative v4 ${evidenceScene.sceneId} block order changed`);
      }
      return {
        blockId: expected.blockId,
        kind: expected.kind,
        text: requiredText(block.text, `${evidenceScene.sceneId}:${expected.kind}`),
        evidenceFactIds: [...expected.evidenceFactIds],
      };
    });
    const bodyWordCount = blocks.reduce(
      (total, block) => total + narrativeUnicodeWordsV4(block.text).length,
      0
    );
    if (bodyWordCount < plan.duration.sceneBodyWords.minimum
      || bodyWordCount > plan.duration.sceneBodyWords.maximum) {
      throw new Error(`narrative v4 ${evidenceScene.sceneId} body must contain 160 to 200 words`);
    }
    const body = blocks.map((block) => block.text).join(' ');
    validateSpanish(body, `narrative v4 ${evidenceScene.sceneId}`);
    validateProperNouns(
      body,
      allowedProperWords(planScene.allowedProperNouns),
      `narrative v4 ${evidenceScene.sceneId}`
    );
    validateNumbers(
      body,
      new Set(planScene.allowedNumbers),
      `narrative v4 ${evidenceScene.sceneId}`
    );
    const observable = evidenceScene.evidenceFacts.find((fact) => fact.role === 'observable');
    if (!observable || observable.visibility.kind !== 'on_site') {
      throw new Error(`narrative v4 ${evidenceScene.sceneId} has no visual cue`);
    }
    validateLook(blocks[1].text, observable.visibility.cueEs, `${evidenceScene.sceneId}:look`);
    return {
      sceneId: evidenceScene.sceneId,
      name: evidenceScene.name,
      blocks,
      transition: { ...planScene.transition },
      bodyWordCount,
    };
  });
  validateSevenGrams(scripts.map((script) => ({
    sceneId: script.sceneId,
    text: script.blocks.map((block) => block.text).join(' '),
  })));
  const transitionWords = scripts.reduce(
    (total, script) => total + narrativeUnicodeWordsV4(script.transition.text).length,
    0
  );
  const totalWordCount = introductionWords + transitionWords
    + scripts.reduce((total, script) => total + script.bodyWordCount, 0);
  const durationSeconds = evidence.route.walkingSeconds
    + plan.duration.observationSeconds
    + (totalWordCount / plan.duration.wordsPerMinute) * 60;
  const durationMinutes = Math.round((durationSeconds / 60) * 100) / 100;
  if (durationMinutes < plan.duration.acceptedTotalMinutes.minimum
    || durationMinutes > plan.duration.acceptedTotalMinutes.maximum) {
    throw new Error(`narrative v4 duration ${durationMinutes} is outside 55 to 65 minutes`);
  }
  return {
    schemaVersion: NARRATIVE_TOUR_TEXT_SCHEMA_VERSION_V4,
    introduction,
    scripts,
    totalWordCount,
    durationSeconds: Math.round(durationSeconds * 10) / 10,
    durationMinutes,
  };
}

export function narrativeTourTextFingerprintV4(text: NarrativeTourTextV4): string {
  return editorialFingerprintV7(text);
}
