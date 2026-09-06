import type { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import type { NarrativeScriptV6 } from './NarrativeEditorialV6';
import {
  NarrativeNarrationTargetV8,
  narrationLengthBoundsV8,
  evaluateNarrationDeliveryV8,
} from './NarrativeDurationTargetsV8';
import {
  NarrativeTourStyleReportV8,
  analyzeNarrativeTourStyleV8,
} from './NarrativeTourStyleV8';
import { NARRATIVE_BEAT_ORDER_V8, NarrativeBeatV8, parseNarrativeWriterResponseV8 } from './NarrativeWriterContractV8';
import type { NarrativeFinalWriterTraceV8 } from './NarrativeEditorialStageStateV8';

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
  duration: ReturnType<typeof evaluateNarrationDeliveryV8>;
  lengthPassed: boolean;
  traceabilityPassed: boolean | null;
  stylePassed: boolean;
  stageVerificationPassed: boolean | null;
  stops: NarrativePublicationStopQualityV8[];
  style: NarrativeTourStyleReportV8;
}

export interface BuildNarrativePublicationQualityInputV8 {
  scripts: NarrativeScriptV6[];
  targets: NarrativeNarrationTargetV8[];
  arcContributions: Readonly<Record<string, string>>;
  writerDiagnostics: EditorialCallResultV6<unknown>[];
  requireWriterTraceability: boolean;
  finalWriterTraces?: Readonly<Record<string, NarrativeFinalWriterTraceV8>>;
  stageVerificationPassed?: boolean;
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

function traceWriterTraceabilityV8(
  stopId: string,
  script: NarrativeScriptV6,
  trace: NarrativeFinalWriterTraceV8 | undefined
): WriterTraceabilityV8 {
  if (!trace || !trace.plan || !trace.draft || trace.scriptFingerprint !== script.fingerprint || trace.plan.routeStopId !== script.stopId) {
    return {
      highPriorityCoverage: null,
      beatCount: 0,
      beats: [],
      traceabilityPassed: false,
    };
  }
  try {
    const parsed = parseNarrativeWriterResponseV8(trace.plan, {
      stop_id: script.stopId,
      segments: trace.draft.segments,
    });
    if (parsed.text !== script.text) {
      return {
        highPriorityCoverage: null,
        beatCount: 0,
        beats: [],
        traceabilityPassed: false,
      };
    }
    return {
      highPriorityCoverage: parsed.coverage,
      beatCount: parsed.segments.length,
      beats: parsed.segments.map((segment) => segment.beat),
      traceabilityPassed: true,
    };
  } catch {
    return {
      highPriorityCoverage: null,
      beatCount: 0,
      beats: [],
      traceabilityPassed: false,
    };
  }
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
  const diagnosticInput = objectV8(diagnostic?.input);
  const writerPlan = objectV8(diagnosticInput?.writerPlan);
  const plannedBeats = Array.isArray(writerPlan?.beats)
    ? writerPlan.beats
    : [];
  const plannedBeatList = plannedBeats.flatMap((item) => {
    const record = objectV8(item);
    const beat = record?.beat;
    return typeof beat === 'string' && NARRATIVE_BEAT_ORDER_V8.includes(beat as NarrativeBeatV8)
      ? [beat as NarrativeBeatV8]
      : [];
  });
  const planValid = plannedBeats.length > 0 && plannedBeatList.length === plannedBeats.length;
  const segmentRecords = value.segments.map(objectV8);
  const beats = segmentRecords.flatMap((segment) => {
    const beat = segment?.beat;
    return typeof beat === 'string' && NARRATIVE_BEAT_ORDER_V8.includes(beat as NarrativeBeatV8)
      ? [beat as NarrativeBeatV8]
      : [];
  });
  const beatsValid = plannedBeatList.length > 0
    && segmentRecords.length === plannedBeatList.length
    && beats.length === plannedBeatList.length
    && beats.every((beat, index) => beat === plannedBeatList[index]);
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
    traceabilityPassed: planValid
      ? beatsValid && supportsValid && coverage !== null && coverage >= 0.7
      : null,
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
    const traceability = input.finalWriterTraces !== undefined
      ? traceWriterTraceabilityV8(script.stopId, script, input.finalWriterTraces[script.stopId])
      : writerTraceabilityV8(script.stopId, input.writerDiagnostics);
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

  const duration = evaluateNarrationDeliveryV8(stops.map(stop => ({ targetWords: stop.targetWords, actualWords: stop.finalWordCount })));
  const stageVerificationPassed = input.stageVerificationPassed ?? null;
  return {
    // Mechanical style/target warnings remain visible; material global issues are verified separately.
    passed: duration.passed && requiredTraceabilityPassed && input.stageVerificationPassed !== false,
    duration,
    lengthPassed,
    traceabilityPassed,
    stylePassed: style.passed,
    stageVerificationPassed,
    stops,
    style,
  };
}
