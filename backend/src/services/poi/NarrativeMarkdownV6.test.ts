import {
  renderBlockedNarrativeScorecardMarkdownV6,
  renderNarrativeScorecardMarkdownV6,
  renderNarrativeTourMarkdownV6,
} from './NarrativeMarkdownV6';
import { NarrativeTourScorecardV6 } from './NarrativeEditorialAgentsV6';

const scorecard: NarrativeTourScorecardV6 = {
  decision: 'Approve', overallBand: 'Good', weightedScore: 8.95,
  dimensions: {
    accuracyGrounding: { score: 10, rationale: 'Exacto.', sentenceIds: ['a-S001'] },
    narrativeArcTransitions: { score: 8.5, rationale: 'Publicable.', sentenceIds: ['a-S001'] },
    oralClarityRhythm: { score: 8.5, rationale: 'Fluido.', sentenceIds: ['a-S001'] },
    placeObservationSafety: { score: 8.5, rationale: 'Seguro.', sentenceIds: ['a-S001'] },
    styleRepetitionClosing: { score: 8.5, rationale: 'Cierra bien.', sentenceIds: ['a-S001'] },
  },
  polishNotes: [{
    dimension: 'oralClarityRhythm', sentenceId: 'a-S001', note: 'Pausa opcional.',
  }],
  objections: [],
};

describe('narrative v6 Markdown renderers', () => {
  it('shows category and discrete grades without exposing the weighted score', () => {
    const markdown = renderNarrativeScorecardMarkdownV6({ city: 'Madrid', scorecard });

    expect(markdown).toContain('**Categoría:** Good');
    expect(markdown).toContain('| Exactitud y grounding | 10 |');
    expect(markdown).toContain('Pausa opcional.');
    expect(markdown).not.toContain('8.95');
    expect(markdown).not.toContain('Media ponderada');
  });

  it('renders automatic gate failures without invoking the reviewer', () => {
    const markdown = renderBlockedNarrativeScorecardMarkdownV6({
      city: 'Barcelona', workflowStatus: 'draft_review_required',
      hardWarningCount: 1, globalIssueCount: 0, openIssueIds: ['issue-1'],
    });

    expect(markdown).toContain('tour de Barcelona');
    expect(markdown).toContain('Request changes');
    expect(markdown).toContain('`issue-1`');
  });

  it('renders a complete user-readable tour without the internal weighted score', () => {
    const markdown = renderNarrativeTourMarkdownV6({
      request: {
        city: 'Barcelona', country: 'España', theme: 'history', language: 'es',
        durationMinutes: 120,
      },
      route: {
        schemaVersion: 'narrative-route-brief-v6', caseId: 'barcelona-history-es-120',
        city: 'Barcelona', country: 'España', theme: 'history', language: 'es',
        durationMinutes: 120, fingerprint: 'f'.repeat(64),
        stops: [{
          stopId: 'parada', position: 0, name: 'Parada', narrativeRole: 'abrir',
          wikidataId: 'Q1', wikidataUrl: 'https://www.wikidata.org/wiki/Q1',
          wikipediaUrl: null, coordinates: { lat: 41.38, lng: 2.17 },
          previousStopId: null, nextStopId: null,
        }],
      },
      routeDiagnostics: {
        estimatedTourMinutes: 120, requestedDuration: 120, coverageRatio: 1,
        degraded: false, degradationReason: null,
      },
      promise: 'Leer la ciudad.', centralQuestion: '¿Cómo cambió?',
      scripts: [{
        stopId: 'parada', text: 'Observa la plaza.', fingerprint: 's'.repeat(64),
        sentences: [{
          sentenceId: 'parada-S001', stopId: 'parada', index: 0,
          text: 'Observa la plaza.',
        }],
      }],
      dossiers: [], workflowStatus: 'ready_for_human_gate', scorecard,
      calls: [{ model: 'gpt', provider: 'OpenAI', calls: 1, latencyMs: 1000, costUsd: 0.01 }],
      budget: {
        limitUsd: 2,
        historicalSpentUsd: 0.8,
        runReportedCostUsd: 0.15,
        runUnverifiedExposureUsd: 0.05,
        spentUsd: 1,
        remainingUsd: 1,
      },
    });

    expect(markdown).toContain('# Tour de Barcelona — history');
    expect(markdown).toContain('## Guiones');
    expect(markdown).toContain('aprobado — Good');
    expect(markdown).toContain('Coste reportado de esta ejecución: $0.1500');
    expect(markdown).toContain('Exposición sin verificar de esta ejecución: $0.0500');
    expect(markdown).toContain('Gasto contabilizado anterior: $0.8000');
    expect(markdown).not.toContain('8.95');
  });
});
