import {
  NARRATIVE_SCORECARD_DIMENSIONS_V6,
  NarrativeScorecardDimensionV6,
  NarrativeTourScorecardV6,
} from './NarrativeEditorialAgentsV6';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeScriptV6 } from './NarrativeEditorialV6';

const SCORECARD_LABELS_V6: Record<NarrativeScorecardDimensionV6, string> = {
  accuracyGrounding: 'Exactitud y grounding',
  narrativeArcTransitions: 'Arco narrativo y transiciones',
  oralClarityRhythm: 'Claridad oral y ritmo',
  placeObservationSafety: 'Observación del lugar y seguridad',
  styleRepetitionClosing: 'Estilo, repetición y cierre',
};

export function renderNarrativeScorecardMarkdownV6(input: {
  city: string;
  scorecard: NarrativeTourScorecardV6;
}): string {
  const { city, scorecard } = input;
  const dimensionRows = NARRATIVE_SCORECARD_DIMENSIONS_V6.map((dimension) => {
    const result = scorecard.dimensions[dimension];
    return `| ${SCORECARD_LABELS_V6[dimension]} | ${result.score} | ${result.sentenceIds.join(', ')} |`;
  });
  const dimensionDetails = NARRATIVE_SCORECARD_DIMENSIONS_V6.flatMap((dimension) => {
    const result = scorecard.dimensions[dimension];
    return [`### ${SCORECARD_LABELS_V6[dimension]}`, '', result.rationale, ''];
  });
  return [
    `# Scorecard editorial — tour de ${city}`,
    '',
    `> **Decisión:** ${scorecard.decision}`,
    `> **Categoría:** ${scorecard.overallBand}`,
    '',
    '| Dimensión | Nota discreta | Frases citadas |',
    '| --- | ---: | --- |',
    ...dimensionRows,
    '',
    '## Justificación por dimensión',
    '',
    ...dimensionDetails,
    '## Pulido opcional',
    '',
    ...(scorecard.polishNotes.length === 0
      ? ['Ninguno.']
      : scorecard.polishNotes.map((note) => (
        `- **${SCORECARD_LABELS_V6[note.dimension]} · ${note.sentenceId}:** ${note.note}`
      ))),
    '',
    '## Objeciones bloqueantes',
    '',
    ...(scorecard.objections.length === 0
      ? ['Ninguna.']
      : scorecard.objections.flatMap((objection) => [
        `- **${SCORECARD_LABELS_V6[objection.dimension]} · ${objection.sentenceId}:** ${objection.exactSentence}`,
        `  - Evidencia: ${objection.evidence}`,
        ...(objection.propositionIds.length > 0
          ? [`  - Proposiciones: ${objection.propositionIds.join(', ')}`] : []),
        ...(objection.passageIds.length > 0
          ? [`  - Pasajes: ${objection.passageIds.join(', ')}`] : []),
        `  - Reemplazo mínimo: ${objection.minimalReplacement}`,
      ])),
    '',
  ].join('\n');
}

export function renderBlockedNarrativeScorecardMarkdownV6(input: {
  city: string;
  workflowStatus: string;
  hardWarningCount: number;
  globalIssueCount: number;
  openIssueIds: string[];
}): string {
  return [
    `# Scorecard editorial — tour de ${input.city}`,
    '',
    '> **Decisión:** Request changes',
    '> **Revisor LLM:** no ejecutado; fallaron condiciones automáticas obligatorias.',
    '',
    `- Estado del workflow: \`${input.workflowStatus}\``,
    `- Warnings duros: ${input.hardWarningCount}`,
    `- Issues globales pendientes: ${input.globalIssueCount}`,
    `- Issues abiertos: ${input.openIssueIds.length}`,
    '',
    '## Issues abiertos',
    '',
    ...(input.openIssueIds.length === 0
      ? ['Ninguno.']
      : input.openIssueIds.map((issueId) => `- \`${issueId}\``)),
    '',
  ].join('\n');
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

function readableParagraphs(text: string): string {
  const sentences = text.trim().replace(/\s+/gu, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/u);
  if (sentences.length < 4) return sentences.join(' ');
  const paragraphCount = Math.min(5, Math.max(3, Math.ceil(sentences.length / 7)));
  const baseSize = Math.floor(sentences.length / paragraphCount);
  const remainder = sentences.length % paragraphCount;
  const paragraphs: string[] = [];
  let cursor = 0;
  for (let index = 0; index < paragraphCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    paragraphs.push(sentences.slice(cursor, cursor + size).join(' '));
    cursor += size;
  }
  return paragraphs.join('\n\n');
}

export interface NarrativeTourCallSummaryV6 {
  model: string;
  provider: string;
  calls: number;
  latencyMs: number;
  costUsd: number | null;
}

export function renderNarrativeTourMarkdownV6(input: {
  request: {
    city: string; country: string; theme: string; language: string; durationMinutes: number;
  };
  route: NarrativeRouteBriefV6;
  routeDiagnostics: {
    estimatedTourMinutes: number; requestedDuration: number;
    coverageRatio: number; degraded: boolean; degradationReason: string | null;
  };
  promise: string;
  centralQuestion: string;
  scripts: NarrativeScriptV6[];
  dossiers: NarrativeDossierV6[];
  workflowStatus: string;
  scorecard: NarrativeTourScorecardV6 | null;
  calls: NarrativeTourCallSummaryV6[];
  budget: {
    limitUsd: number;
    spentUsd: number;
    remainingUsd: number;
    historicalSpentUsd?: number;
    runReportedCostUsd?: number;
    runUnverifiedExposureUsd?: number;
  };
  speakingRateWordsPerMinute?: number;
}): string {
  const scriptByStopId = new Map(input.scripts.map((script) => [script.stopId, script]));
  const missingScripts = input.route.stops.filter((stop) => !scriptByStopId.has(stop.stopId));
  if (missingScripts.length > 0) {
    throw new Error(`tour Markdown is missing scripts: ${missingScripts.map((stop) => stop.stopId).join(', ')}`);
  }
  const totalWords = input.scripts.reduce((total, script) => total + wordCount(script.text), 0);
  const speakingRate = input.speakingRateWordsPerMinute ?? 140;
  if (!Number.isFinite(speakingRate) || speakingRate <= 0) {
    throw new Error('speakingRateWordsPerMinute must be a positive finite number');
  }
  const status = input.workflowStatus === 'ready_for_human_gate'
    && input.scorecard?.decision === 'Approve'
    ? `aprobado — ${input.scorecard.overallBand}`
    : `requiere revisión — ${input.workflowStatus}`;
  const sources = input.dossiers.flatMap((dossier) => dossier.sources.map((source) => ({
    stopId: dossier.stopId,
    title: source.title,
    url: source.finalUrl,
    publisher: source.authority.publisherKey,
  })));
  const uniqueSources = [...new Map(sources.map((source) => [source.url, source])).values()];
  const scorecardMarkdown = input.scorecard
    ? renderNarrativeScorecardMarkdownV6({ city: input.request.city, scorecard: input.scorecard })
      .replace(/^# Scorecard editorial[^\n]*\n/u, '## Scorecard editorial\n')
    : '## Scorecard editorial\n\nNo ejecutado: el workflow no superó las condiciones automáticas.';
  const budgetLines = input.budget.runReportedCostUsd === undefined
    ? [
      `Presupuesto acumulado: $${input.budget.spentUsd.toFixed(4)} de $${input.budget.limitUsd.toFixed(2)}; quedan $${input.budget.remainingUsd.toFixed(4)}.`,
    ]
    : [
      `Coste reportado de esta ejecución: $${input.budget.runReportedCostUsd.toFixed(4)}.`,
      `Exposición sin verificar de esta ejecución: $${(input.budget.runUnverifiedExposureUsd ?? 0).toFixed(4)}.`,
      `Gasto contabilizado anterior: $${(input.budget.historicalSpentUsd ?? 0).toFixed(4)}.`,
      `Presupuesto contabilizado: $${input.budget.spentUsd.toFixed(4)} de $${input.budget.limitUsd.toFixed(2)}; quedan $${input.budget.remainingUsd.toFixed(4)}.`,
    ];
  return [
    `# Tour de ${input.request.city} — ${input.request.theme}`,
    '',
    `> **Estado:** ${status}.`,
    `> **Petición:** ${input.request.city}, ${input.request.country} · ${input.request.durationMinutes} min · ${input.request.language}.`,
    `> **Ruta seleccionada:** ${input.route.stops.length} paradas · cobertura ${(input.routeDiagnostics.coverageRatio * 100).toFixed(1)}% · estimación estructural ${Math.round(input.routeDiagnostics.estimatedTourMinutes)} min.`,
    `> **Escucha:** unas ${Math.ceil(totalWords / speakingRate)} min (${totalWords} palabras); el resto corresponde al recorrido, observación y pausas.`,
    '',
    '## Promesa y pregunta central',
    '',
    input.promise,
    '',
    `**Pregunta:** ${input.centralQuestion}`,
    '',
    '## Ruta elegida por el producto',
    '',
    '| # | Parada | Coordenadas | Rol narrativo |',
    '| ---: | --- | --- | --- |',
    ...input.route.stops.map((stop, index) => (
      `| ${index + 1} | ${stop.name} | ${stop.coordinates.lat}, ${stop.coordinates.lng} | ${stop.narrativeRole} |`
    )),
    '',
    '## Guiones',
    '',
    ...input.route.stops.flatMap((stop, index) => {
      const script = scriptByStopId.get(stop.stopId) as NarrativeScriptV6;
      return [
        `### ${index + 1}. ${stop.name}`,
        '',
        `_${wordCount(script.text)} palabras · ${stop.coordinates.lat}, ${stop.coordinates.lng}_`,
        '',
        readableParagraphs(script.text),
        '',
      ];
    }),
    scorecardMarkdown,
    '',
    '## Modelos, coste y latencia',
    '',
    '| Modelo | Proveedor | Llamadas | Latencia acumulada | Coste |',
    '| --- | --- | ---: | ---: | ---: |',
    ...input.calls.map((call) => (
      `| ${call.model} | ${call.provider} | ${call.calls} | ${(call.latencyMs / 1_000).toFixed(1)} s | ${call.costUsd === null ? 'no informado' : `$${call.costUsd.toFixed(4)}`} |`
    )),
    '',
    ...budgetLines,
    '',
    '## Fuentes',
    '',
    ...uniqueSources.map((source) => (
      `- [${source.title}](${source.url}) — ${source.publisher}; parada \`${source.stopId}\`.`
    )),
    '',
  ].join('\n');
}
