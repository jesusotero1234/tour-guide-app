import { NarrativeClaimPlanV4, validateNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import {
  NarrativeEvidenceCaseV4,
  narrativeUnicodeWordsV4,
  validateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';
import { NarrativeBlockKindV1 } from './NarrativePilotV1';
import {
  NARRATIVE_TOUR_TEXT_SCHEMA_VERSION_V4,
  NarrativeTourTextV4,
  narrativeTourTextFingerprintV4,
} from './NarrativeProseV4';

export const NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V5 = 'narrative-prose-draft-v5' as const;
export const NARRATIVE_PROSE_VALIDATION_REPORT_SCHEMA_VERSION_V5 =
  'narrative-prose-validation-report-v5' as const;

export interface NarrativeProseDraftV5 {
  schemaVersion: typeof NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V5;
  introduction: string;
  scripts: Array<{
    sceneId: string;
    blocks: Array<{ kind: NarrativeBlockKindV1; text: string }>;
  }>;
}

export type NarrativeProseIssueCodeV5 =
  | 'structure'
  | 'required_text'
  | 'word_count'
  | 'language'
  | 'unknown_proper_noun'
  | 'unknown_number'
  | 'visual_instruction'
  | 'visual_cue'
  | 'repeated_seven_gram'
  | 'duration';

export interface NarrativeProseIssueV5 {
  code: NarrativeProseIssueCodeV5;
  path: string;
  sceneId: string | null;
  message: string;
  observed?: number;
  minimum?: number;
  maximum?: number;
}

export interface NarrativeProseValidationReportV5 {
  schemaVersion: typeof NARRATIVE_PROSE_VALIDATION_REPORT_SCHEMA_VERSION_V5;
  valid: boolean;
  issues: NarrativeProseIssueV5[];
  text: NarrativeTourTextV4 | null;
}

export class NarrativeProseValidationErrorV5 extends Error {
  readonly issues: NarrativeProseIssueV5[];

  constructor(issues: NarrativeProseIssueV5[]) {
    super(`narrative_prose_validation_v5:${JSON.stringify(issues)}`);
    this.name = 'NarrativeProseValidationErrorV5';
    this.issues = issues;
  }
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
const CAPITALIZED_GRAMMAR_LEADS = new Set([
  'aquel', 'aquella', 'aquellas', 'aquellos', 'el', 'esta', 'estas', 'este', 'estos',
  'la', 'las', 'los', 'un', 'una', 'unas', 'unos',
]);

function strictObject(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object', additionalProperties: false,
    required: Object.keys(properties), properties,
  };
}

export function narrativeProseDraftSchemaV5(): Record<string, unknown> {
  const block = strictObject({
    kind: { type: 'string', enum: BLOCK_KINDS },
    text: { type: 'string' },
  });
  const scene = strictObject({
    sceneId: { type: 'string' },
    blocks: { type: 'array', items: block },
  });
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V5] },
    introduction: { type: 'string' },
    scripts: { type: 'array', items: scene },
  });
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizedWords(value: string): string[] {
  return narrativeUnicodeWordsV4(normalized(value));
}

function allowedProperWords(values: string[]): Set<string> {
  return new Set(values.flatMap((value) => normalizedWords(value)));
}

function isSentenceBoundary(text: string, index: number): boolean {
  return /(?:^|[.!?¡¿:]\s*)$/u.test(text.slice(0, index));
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

export function validateNarrativeProseV5(
  raw: unknown,
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4
): NarrativeProseValidationReportV5 {
  validateNarrativeEvidenceCaseV4(evidence);
  validateNarrativeClaimPlanV4(plan, evidence);
  const issues: NarrativeProseIssueV5[] = [];
  const add = (
    code: NarrativeProseIssueCodeV5,
    path: string,
    message: string,
    sceneId: string | null = null,
    counts: Pick<NarrativeProseIssueV5, 'observed' | 'minimum' | 'maximum'> = {}
  ) => issues.push({ code, path, sceneId, message, ...counts });
  const objectAt = (value: unknown, path: string, sceneId: string | null = null) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      add('structure', path, `${path} must be an object`, sceneId);
      return null;
    }
    return value as Record<string, unknown>;
  };
  const textAt = (value: unknown, path: string, sceneId: string | null = null) => {
    if (typeof value !== 'string' || !value.trim()) {
      add('required_text', path, `${path} is required`, sceneId);
      return null;
    }
    return value.trim();
  };
  const validateSpanish = (text: string, path: string, sceneId: string | null = null) => {
    const words = normalizedWords(text);
    const markerCount = words.filter((word) => SPANISH_MARKERS.has(word)).length;
    if (words.length === 0 || markerCount / words.length < 0.08) {
      add('language', path, `${path} must be Spanish es-ES prose`, sceneId);
    }
  };
  const validateProperNouns = (
    text: string,
    allowed: Set<string>,
    path: string,
    sceneId: string | null = null
  ) => {
    for (const match of text.matchAll(/\b\p{Lu}[\p{L}’'-]*(?:\s+\p{Lu}[\p{L}’'-]*)*/gu)) {
      const words = normalizedWords(match[0]);
      const atBoundary = isSentenceBoundary(text, match.index ?? 0);
      if (atBoundary && words.length === 1) continue;
      if (atBoundary && (CAPITALIZED_GRAMMAR_LEADS.has(words[0])
        || words.slice(1).every((word) => allowed.has(word)))) words.shift();
      if (words.some((word) => !allowed.has(word))) {
        add(
          'unknown_proper_noun', path,
          `${path} contains an unknown proper noun: ${match[0]}`,
          sceneId
        );
      }
    }
  };
  const validateNumbers = (
    text: string,
    allowed: Set<string>,
    path: string,
    sceneId: string | null = null
  ) => {
    for (const number of text.match(/\d+(?:[.,]\d+)*/g) ?? []) {
      if (!allowed.has(number)) {
        add('unknown_number', path, `${path} contains an unknown number: ${number}`, sceneId);
      }
    }
  };

  const root = objectAt(raw, 'draft');
  if (!root) {
    return {
      schemaVersion: NARRATIVE_PROSE_VALIDATION_REPORT_SCHEMA_VERSION_V5,
      valid: false, issues, text: null,
    };
  }
  if (!exactKeys(root, ['schemaVersion', 'introduction', 'scripts'])
    || root.schemaVersion !== NARRATIVE_PROSE_DRAFT_SCHEMA_VERSION_V5) {
    add('structure', 'draft', 'narrative prose draft v5 metadata changed');
  }

  const introduction = textAt(root.introduction, 'introduction');
  let introductionWords = 0;
  if (introduction) {
    introductionWords = narrativeUnicodeWordsV4(introduction).length;
    if (introductionWords < plan.duration.introductionWords.minimum
      || introductionWords > plan.duration.introductionWords.maximum) {
      add(
        'word_count',
        'introduction',
        `introduction has ${introductionWords} Unicode words; must contain 45 to 75`,
        null,
        { observed: introductionWords, minimum: 45, maximum: 75 }
      );
    }
    validateSpanish(introduction, 'introduction');
    validateProperNouns(
      introduction,
      allowedProperWords(plan.scenes.flatMap((scene) => [
        ...scene.allowedProperNouns,
        ...scene.blocks.flatMap((block) => block.claims.map((claim) => claim.text)),
      ])),
      'introduction'
    );
    validateNumbers(introduction, new Set([
      ...plan.scenes.flatMap((scene) => scene.allowedNumbers),
      ...(evidence.experienceLabel.match(/\d+(?:[.,]\d+)*/g) ?? []),
    ]), 'introduction');
  }

  const rawScripts = Array.isArray(root.scripts) ? root.scripts : [];
  if (!Array.isArray(root.scripts) || rawScripts.length !== evidence.scenes.length) {
    add('structure', 'scripts', `scripts must contain ${evidence.scenes.length} scenes`);
  }
  const scripts: NarrativeTourTextV4['scripts'] = [];
  const sceneTexts: Array<{ sceneId: string; text: string }> = [];
  evidence.scenes.forEach((evidenceScene, sceneIndex) => {
    const scenePath = `scripts[${sceneIndex}]`;
    const rawScene = objectAt(rawScripts[sceneIndex], scenePath, evidenceScene.sceneId);
    if (!rawScene) return;
    if (!exactKeys(rawScene, ['sceneId', 'blocks']) || rawScene.sceneId !== evidenceScene.sceneId) {
      add('structure', scenePath, `${scenePath} metadata changed`, evidenceScene.sceneId);
    }
    const rawBlocks = Array.isArray(rawScene.blocks) ? rawScene.blocks : [];
    if (!Array.isArray(rawScene.blocks) || rawBlocks.length !== BLOCK_KINDS.length) {
      add('structure', `${scenePath}.blocks`, `${scenePath} must contain five blocks`, evidenceScene.sceneId);
    }
    const planScene = plan.scenes[sceneIndex];
    const blocks: NarrativeTourTextV4['scripts'][number]['blocks'] = [];
    rawBlocks.slice(0, BLOCK_KINDS.length).forEach((rawBlock, blockIndex) => {
      const expected = planScene.blocks[blockIndex];
      const blockPath = `${scenePath}.blocks[${blockIndex}]`;
      const block = objectAt(rawBlock, blockPath, evidenceScene.sceneId);
      if (!block) return;
      if (!exactKeys(block, ['kind', 'text']) || block.kind !== expected.kind) {
        add('structure', blockPath, `${blockPath} order or fields changed`, evidenceScene.sceneId);
      }
      const blockText = textAt(block.text, `${blockPath}.text`, evidenceScene.sceneId);
      if (blockText && block.kind === expected.kind) {
        blocks.push({
          blockId: expected.blockId,
          kind: expected.kind,
          text: blockText,
          evidenceFactIds: [...expected.evidenceFactIds],
        });
      }
    });
    if (blocks.length !== BLOCK_KINDS.length) return;

    const body = blocks.map((block) => block.text).join(' ');
    const bodyWordCount = narrativeUnicodeWordsV4(body).length;
    if (bodyWordCount < plan.duration.sceneBodyWords.minimum
      || bodyWordCount > plan.duration.sceneBodyWords.maximum) {
      add(
        'word_count', scenePath,
        `${evidenceScene.sceneId} body has ${bodyWordCount} Unicode words; must contain 160 to 200`,
        evidenceScene.sceneId,
        { observed: bodyWordCount, minimum: 160, maximum: 200 }
      );
    }
    validateSpanish(body, scenePath, evidenceScene.sceneId);
    validateProperNouns(
      body,
      allowedProperWords([
        ...planScene.allowedProperNouns,
        ...planScene.blocks.flatMap((block) => block.claims.map((claim) => claim.text)),
      ]),
      scenePath,
      evidenceScene.sceneId
    );
    validateNumbers(body, new Set(planScene.allowedNumbers), scenePath, evidenceScene.sceneId);

    const observable = evidenceScene.evidenceFacts.find((fact) => fact.role === 'observable');
    if (!observable || observable.visibility.kind !== 'on_site') {
      add('visual_cue', `${scenePath}.blocks[1].text`, 'scene has no official visual cue', evidenceScene.sceneId);
    } else {
      const look = blocks[1].text;
      if (!VISUAL_INSTRUCTION.test(look)) {
        add(
          'visual_instruction', `${scenePath}.blocks[1].text`,
          'look block requires a visual instruction', evidenceScene.sceneId
        );
      }
      const cueTerms = [...new Set(normalizedWords(observable.visibility.cueEs).filter((word) => (
        word.length >= 5 && !CUE_STOP_WORDS.has(word)
      )))];
      const lookTerms = new Set(normalizedWords(look));
      const requiredMatches = Math.min(2, cueTerms.length);
      if (cueTerms.filter((term) => lookTerms.has(term)).length < requiredMatches) {
        add(
          'visual_cue', `${scenePath}.blocks[1].text`,
          'look block does not develop the official visual cue', evidenceScene.sceneId
        );
      }
    }
    scripts.push({
      sceneId: evidenceScene.sceneId,
      name: evidenceScene.name,
      blocks,
      transition: { ...planScene.transition },
      bodyWordCount,
    });
    sceneTexts.push({ sceneId: evidenceScene.sceneId, text: body });
  });

  const seenSevenGrams = new Map<string, string>();
  for (const scene of sceneTexts) {
    const words = normalizedWords(scene.text);
    const local = new Set<string>();
    for (let index = 0; index <= words.length - 7; index += 1) {
      local.add(words.slice(index, index + 7).join(' '));
    }
    for (const gram of local) {
      const owner = seenSevenGrams.get(gram);
      if (owner && owner !== scene.sceneId) {
        add(
          'repeated_seven_gram', 'scripts',
          `repeated seven-gram between ${owner} and ${scene.sceneId}: ${gram}`,
          scene.sceneId
        );
      } else {
        seenSevenGrams.set(gram, scene.sceneId);
      }
    }
  }

  let candidate: NarrativeTourTextV4 | null = null;
  if (introduction && scripts.length === evidence.scenes.length) {
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
      add('duration', 'durationMinutes', `duration ${durationMinutes} is outside 55 to 65 minutes`);
    }
    candidate = {
      schemaVersion: NARRATIVE_TOUR_TEXT_SCHEMA_VERSION_V4,
      introduction,
      scripts,
      totalWordCount,
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      durationMinutes,
    };
  }

  return {
    schemaVersion: NARRATIVE_PROSE_VALIDATION_REPORT_SCHEMA_VERSION_V5,
    valid: issues.length === 0,
    issues,
    text: issues.length === 0 ? candidate : null,
  };
}

export function materializeNarrativeProseV5(
  raw: unknown,
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4
): NarrativeTourTextV4 {
  const report = validateNarrativeProseV5(raw, evidence, plan);
  if (!report.valid || !report.text) throw new NarrativeProseValidationErrorV5(report.issues);
  return report.text;
}

export function narrativeTourTextFingerprintV5(text: NarrativeTourTextV4): string {
  return narrativeTourTextFingerprintV4(text);
}
