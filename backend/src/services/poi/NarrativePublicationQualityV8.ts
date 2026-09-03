import type { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import type { NarrativeScriptV6 } from './NarrativeEditorialV6';
import {
  NarrativeNarrationTargetV8,
  narrationLengthBoundsV8,
} from './NarrativeDurationTargetsV8';
import {
  NarrativeTourStyleReportV8,
  analyzeNarrativeTourStyleV8,
} from './NarrativeTourStyleV8';
import { NARRATIVE_BEAT_ORDER_V8, NarrativeBeatV8 } from './NarrativeWriterContractV8';

export interface NarrativePublicationStopQualityV8 {
  stopId: string;
  targetSeconds: number;
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
  finalWordCount: number;
  lengthPassed: boolean;
  highPriorityCoverage: number | null;
  beatCount: number;
  beats: NarrativeBeatV8[];
  traceabilityPassed: boolean | null;
}

export interface NarrativePublicationQualityV8 {
  passed: boolean;
  lengthPassed: boolean;
  traceabilityPassed: boolean | null;
  stylePassed: boolean;
  stops: NarrativePublicationStopQualityV8[];
  style: NarrativeTourStyleReportV8;
}

export interface BuildNarrativePublicationQualityInputV8 {
  scripts: NarrativeScriptV6[];
  targets: NarrativeNarrationTargetV8[];
  arcContributions: Readonly<Record<string, string>>;
  writerDiagnostics: EditorialCallResultV6<unknown>[];
  requireWriterTraceability: boolean;
}

interface WriterTraceabilityV8 {
  highPriorityCoverage: number | null;
  beatCount: number;
  beats: NarrativeBeatV8[];
  traceabilityPassed: boolean | null;
}

function wordCountV8(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function objectV8(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function writerTraceabilityV8(
  stopId: string,
  diagnostics: EditorialCallResultV6<unknown>[]
): WriterTraceabilityV8 {
  const diagnostic = [...diagnostics].reverse().find((candidate) => (
    candidate.callId === `narrative-v6-writer-${stopId}`
    && candidate.status === 'valid'
    && candidate.value !== null
  ));
  const value = objectV8(diagnostic?.value);
  if (!value || !Array.isArray(value.segments)) {
    return {
      highPriorityCoverage: null,
      beatCount: 0,
      beats: [],
      traceabilityPassed: null,
    };
  }

  const coverage = typeof value.coverage === 'number'
    && Number.isFinite(value.coverage)
    && value.coverage >= 0
    && value.coverage <= 1
    ? value.coverage
    : null;
  const segmentRecords = value.segments.map(objectV8);
  const beats = segmentRecords.flatMap((segment) => {
    const beat = segment?.beat;
    return typeof beat === 'string' && NARRATIVE_BEAT_ORDER_V8.includes(beat as NarrativeBeatV8)
      ? [beat as NarrativeBeatV8]
      : [];
  });
  const beatsValid = segmentRecords.length === NARRATIVE_BEAT_ORDER_V8.length
    && beats.length === NARRATIVE_BEAT_ORDER_V8.length
    && beats.every((beat, index) => beat === NARRATIVE_BEAT_ORDER_V8[index]);
  const supportsValid = segmentRecords.every((segment) => (
    segment !== null
    && Array.isArray(segment.supportCardIds)
    && segment.supportCardIds.length > 0
    && segment.supportCardIds.every((cardId) => typeof cardId === 'string' && cardId.length > 0)
  ));

  return {
    highPriorityCoverage: coverage,
    beatCount: segmentRecords.length,
    beats,
    traceabilityPassed: beatsValid && supportsValid && coverage !== null && coverage >= 0.7,
  };
}

export function buildNarrativePublicationQualityV8(
  input: BuildNarrativePublicationQualityInputV8
): NarrativePublicationQualityV8 {
  const targetByStopId = new Map<string, NarrativeNarrationTargetV8>();
  for (const target of input.targets) {
    if (targetByStopId.has(target.stopId)) {
      throw new Error(`duplicate narration target for stop ${target.stopId}`);
    }
    targetByStopId.set(target.stopId, target);
  }
  const scriptStopIds = new Set(input.scripts.map((script) => script.stopId));
  for (const target of input.targets) {
    if (!scriptStopIds.has(target.stopId)) {
      throw new Error(`narration target has no final script for stop ${target.stopId}`);
    }
  }

  const stops = input.scripts.map((script): NarrativePublicationStopQualityV8 => {
    const target = targetByStopId.get(script.stopId);
    if (!target) {
      throw new Error(`final script has no narration target for stop ${script.stopId}`);
    }
    const { minimumWords, maximumWords } = narrationLengthBoundsV8(target.targetWords);
    const finalWordCount = wordCountV8(script.text);
    const traceability = writerTraceabilityV8(script.stopId, input.writerDiagnostics);
    return {
      stopId: script.stopId,
      targetSeconds: target.targetSeconds,
      targetWords: target.targetWords,
      minimumWords,
      maximumWords,
      finalWordCount,
      lengthPassed: finalWordCount >= minimumWords && finalWordCount <= maximumWords,
      ...traceability,
    };
  });

  const style = analyzeNarrativeTourStyleV8(input.scripts, {
    contributionsByStopId: input.arcContributions,
  });
  const lengthPassed = stops.every((stop) => stop.lengthPassed);
  const availableTraceability = stops.filter(
    (stop): stop is NarrativePublicationStopQualityV8 & { traceabilityPassed: boolean } => (
      stop.traceabilityPassed !== null
    )
  );
  const traceabilityPassed = availableTraceability.length === 0
    ? null
    : availableTraceability.every((stop) => stop.traceabilityPassed);
  const requiredTraceabilityPassed = !input.requireWriterTraceability
    || (
      availableTraceability.length === stops.length
      && traceabilityPassed === true
    );

  return {
    passed: lengthPassed && style.passed && requiredTraceabilityPassed,
    lengthPassed,
    traceabilityPassed,
    stylePassed: style.passed,
    stops,
    style,
  };
}
