import { NarrativeScriptV6 } from './NarrativeEditorialV6';

export type NarrativeTourStyleIssueCategoryV8 =
  | 'repeated_opening'
  | 'repeated_ngram'
  | 'overused_abstraction';

export type NarrativeTourStyleClassificationV8 =
  | 'mechanical_repetition'
  | 'intentional_motif';

export interface NarrativeTourStyleIssueV8 {
  category: NarrativeTourStyleIssueCategoryV8;
  classification: NarrativeTourStyleClassificationV8;
  phrase: string;
  occurrences: number;
  stopIds: string[];
  sentenceIds: string[];
}

export interface NarrativeTourContributionDuplicateV8 {
  contribution: string;
  stopIds: string[];
}

export interface NarrativeTourStyleReportV8 {
  passed: boolean;
  issues: NarrativeTourStyleIssueV8[];
  summary: {
    mechanicalIssueCount: number;
    intentionalMotifCount: number;
    affectedStopCount: number;
  };
  contributions: {
    distinct: boolean;
    duplicates: NarrativeTourContributionDuplicateV8[];
  };
}

export interface AnalyzeNarrativeTourStyleOptionsV8 {
  intentionalMotifs?: string[];
  contributionsByStopId?: Readonly<Record<string, string>>;
}

export interface NarrativeMechanicalStyleAuditIssueV8 {
  issueId: string;
  stopId: string;
  sentenceId: string;
  severity: 'soft';
  reason: string;
  classification: NarrativeTourStyleClassificationV8;
  phrase: string;
}

interface SentenceOccurrenceV8 {
  stopId: string;
  sentenceId: string;
  text: string;
  tokens: string[];
}

const COMMON_WORDS_V8 = new Set([
  'a', 'al', 'ante', 'como', 'con', 'de', 'del', 'el', 'en', 'es', 'esta', 'este',
  'la', 'las', 'lo', 'los', 'para', 'por', 'que', 'se', 'sin', 'su', 'sus', 'un',
  'una', 'y',
]);

const ABSTRACTION_PATTERNS_V8: Array<{
  phrase: string;
  pattern: RegExp;
}> = [
  { phrase: 'capas', pattern: /\bcapas?\b/gu },
  { phrase: 'memoria', pattern: /\bmemoria\b/gu },
  { phrase: 'transformación', pattern: /\btransformacion(?:es)?\b/gu },
  { phrase: 'ayuda a entender', pattern: /\bayuda(?:n)? a entender\b/gu },
  { phrase: 'no solo', pattern: /\bno solo\b/gu },
];

function normalizeStyleTextV8(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9ñ]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function originalTokensV8(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function normalizedTokensV8(value: string): string[] {
  const normalized = normalizeStyleTextV8(value);
  return normalized ? normalized.split(' ') : [];
}

function uniqueInOrderV8(values: string[]): string[] {
  return [...new Set(values)];
}

function classificationForPhraseV8(
  phrase: string,
  intentionalMotifs: ReadonlySet<string>
): NarrativeTourStyleClassificationV8 {
  return intentionalMotifs.has(normalizeStyleTextV8(phrase))
    ? 'intentional_motif'
    : 'mechanical_repetition';
}

function issueV8(
  category: NarrativeTourStyleIssueCategoryV8,
  phrase: string,
  occurrences: SentenceOccurrenceV8[],
  occurrenceCount: number,
  intentionalMotifs: ReadonlySet<string>
): NarrativeTourStyleIssueV8 {
  return {
    category,
    classification: classificationForPhraseV8(phrase, intentionalMotifs),
    phrase,
    occurrences: occurrenceCount,
    stopIds: uniqueInOrderV8(occurrences.map((item) => item.stopId)),
    sentenceIds: uniqueInOrderV8(occurrences.map((item) => item.sentenceId)),
  };
}

function sentenceOccurrencesV8(scripts: NarrativeScriptV6[]): SentenceOccurrenceV8[] {
  return scripts.flatMap((script) => script.sentences.map((sentence) => ({
    stopId: script.stopId,
    sentenceId: sentence.sentenceId,
    text: sentence.text,
    tokens: normalizedTokensV8(sentence.text),
  })));
}

function properNameTokensV8(sentences: SentenceOccurrenceV8[]): Set<string> {
  const names = new Set<string>();
  for (const sentence of sentences) {
    const tokens = originalTokensV8(sentence.text);
    tokens.forEach((token, index) => {
      if (index > 0 && /^\p{Lu}/u.test(token)) {
        const normalized = normalizeStyleTextV8(token);
        if (normalized) names.add(normalized);
      }
    });
  }
  return names;
}

function repeatedOpeningIssuesV8(
  scripts: NarrativeScriptV6[],
  intentionalMotifs: ReadonlySet<string>,
  properNames: ReadonlySet<string>
): NarrativeTourStyleIssueV8[] {
  const groups = new Map<string, SentenceOccurrenceV8[]>();
  for (const script of scripts) {
    const first = script.sentences[0];
    if (!first) continue;
    const tokens = normalizedTokensV8(first.text).slice(0, 4);
    if (tokens.length < 3 || tokens.some((token) => properNames.has(token))) continue;
    const signature = tokens.join(' ');
    const occurrence: SentenceOccurrenceV8 = {
      stopId: script.stopId,
      sentenceId: first.sentenceId,
      text: first.text,
      tokens,
    };
    groups.set(signature, [...(groups.get(signature) ?? []), occurrence]);
  }

  return [...groups.entries()]
    .filter(([, occurrences]) => new Set(occurrences.map((item) => item.stopId)).size >= 2)
    .map(([phrase, occurrences]) => (
      issueV8('repeated_opening', phrase, occurrences, occurrences.length, intentionalMotifs)
    ))
    .sort((left, right) => left.phrase.localeCompare(right.phrase, 'es'));
}

function repeatedNgramIssuesV8(
  sentences: SentenceOccurrenceV8[],
  intentionalMotifs: ReadonlySet<string>,
  properNames: ReadonlySet<string>
): NarrativeTourStyleIssueV8[] {
  const groups = new Map<string, SentenceOccurrenceV8[]>();
  const ngramSize = 5;

  for (const sentence of sentences) {
    const seenInSentence = new Set<string>();
    for (let index = 0; index <= sentence.tokens.length - ngramSize; index += 1) {
      const tokens = sentence.tokens.slice(index, index + ngramSize);
      if (tokens.some((token) => properNames.has(token))) continue;
      const contentWordCount = tokens.filter(
        (token) => token.length >= 4 && !COMMON_WORDS_V8.has(token)
      ).length;
      if (contentWordCount < 2) continue;
      const phrase = tokens.join(' ');
      if (seenInSentence.has(phrase)) continue;
      seenInSentence.add(phrase);
      groups.set(phrase, [...(groups.get(phrase) ?? []), sentence]);
    }
  }

  return [...groups.entries()]
    .filter(([, occurrences]) => new Set(occurrences.map((item) => item.stopId)).size >= 2)
    .sort(([leftPhrase, leftOccurrences], [rightPhrase, rightOccurrences]) => (
      rightOccurrences.length - leftOccurrences.length
      || leftPhrase.localeCompare(rightPhrase, 'es')
    ))
    .slice(0, 8)
    .map(([phrase, occurrences]) => (
      issueV8('repeated_ngram', phrase, occurrences, occurrences.length, intentionalMotifs)
    ));
}

function abstractionIssuesV8(
  sentences: SentenceOccurrenceV8[],
  intentionalMotifs: ReadonlySet<string>
): NarrativeTourStyleIssueV8[] {
  const issues: NarrativeTourStyleIssueV8[] = [];

  for (const abstraction of ABSTRACTION_PATTERNS_V8) {
    const occurrences: SentenceOccurrenceV8[] = [];
    let occurrenceCount = 0;
    for (const sentence of sentences) {
      const normalized = normalizeStyleTextV8(sentence.text);
      const matches = normalized.match(abstraction.pattern) ?? [];
      if (matches.length === 0) continue;
      occurrenceCount += matches.length;
      occurrences.push(sentence);
    }
    const stopCount = new Set(occurrences.map((item) => item.stopId)).size;
    if (stopCount >= 2 || occurrenceCount >= 3) {
      issues.push(issueV8(
        'overused_abstraction',
        abstraction.phrase,
        occurrences,
        occurrenceCount,
        intentionalMotifs
      ));
    }
  }

  return issues;
}

function contributionReportV8(
  contributionsByStopId: Readonly<Record<string, string>> | undefined
): NarrativeTourStyleReportV8['contributions'] {
  if (!contributionsByStopId) return { distinct: true, duplicates: [] };

  const groups = new Map<string, { contribution: string; stopIds: string[] }>();
  for (const [stopId, contribution] of Object.entries(contributionsByStopId)) {
    const normalized = normalizeStyleTextV8(contribution);
    if (!normalized) continue;
    const existing = groups.get(normalized);
    if (existing) {
      existing.stopIds.push(stopId);
    } else {
      groups.set(normalized, { contribution, stopIds: [stopId] });
    }
  }

  const duplicates = [...groups.values()]
    .filter((group) => group.stopIds.length >= 2)
    .map((group) => ({
      contribution: group.contribution,
      stopIds: group.stopIds,
    }));

  return {
    distinct: duplicates.length === 0,
    duplicates,
  };
}

export function buildNarrativeMechanicalStyleAuditIssuesV8(
  scripts: NarrativeScriptV6[],
  report: NarrativeTourStyleReportV8
): NarrativeMechanicalStyleAuditIssueV8[] {
  const sentenceById = new Map<string, { stopId: string; sentenceId: string }>();
  for (const script of scripts) {
    for (const sentence of script.sentences) {
      sentenceById.set(sentence.sentenceId, { stopId: script.stopId, sentenceId: sentence.sentenceId });
    }
  }

  const issues: NarrativeMechanicalStyleAuditIssueV8[] = [];
  for (const issue of report.issues) {
    if (issue.classification !== 'mechanical_repetition') continue;

    const uniqueSentenceIds = uniqueInOrderV8(issue.sentenceIds);
    const targetSentenceIds = issue.occurrences > uniqueSentenceIds.length
      ? uniqueSentenceIds
      : uniqueSentenceIds.slice(1);

    for (const sentenceId of targetSentenceIds) {
      const resolved = sentenceById.get(sentenceId);
      if (!resolved) continue;
      const normalizedPhrase = normalizeStyleTextV8(issue.phrase).replace(/\s+/gu, '-');
      const issueId = `mechanical-style:${issue.category}:${normalizedPhrase}:${sentenceId}`;
      issues.push({
        issueId,
        stopId: resolved.stopId,
        sentenceId: resolved.sentenceId,
        severity: 'soft',
        reason: `La frase repite mecánicamente "${issue.phrase}"; reformula esta aparición sin alterar los hechos.`,
        classification: issue.classification,
        phrase: issue.phrase,
      });
    }
  }

  return issues;
}

export function analyzeNarrativeTourStyleV8(
  scripts: NarrativeScriptV6[],
  options: AnalyzeNarrativeTourStyleOptionsV8 = {}
): NarrativeTourStyleReportV8 {
  const intentionalMotifs = new Set(
    (options.intentionalMotifs ?? []).map(normalizeStyleTextV8).filter(Boolean)
  );
  const sentences = sentenceOccurrencesV8(scripts);
  const properNames = properNameTokensV8(sentences);
  const issues = [
    ...repeatedOpeningIssuesV8(scripts, intentionalMotifs, properNames),
    ...repeatedNgramIssuesV8(sentences, intentionalMotifs, properNames),
    ...abstractionIssuesV8(sentences, intentionalMotifs),
  ];
  const contributions = contributionReportV8(options.contributionsByStopId);
  const mechanicalIssues = issues.filter(
    (item) => item.classification === 'mechanical_repetition'
  );
  const affectedStopIds = uniqueInOrderV8(
    mechanicalIssues.flatMap((item) => item.stopIds)
  );

  return {
    passed: mechanicalIssues.length === 0 && contributions.distinct,
    issues,
    summary: {
      mechanicalIssueCount: mechanicalIssues.length,
      intentionalMotifCount: issues.length - mechanicalIssues.length,
      affectedStopCount: affectedStopIds.length,
    },
    contributions,
  };
}
