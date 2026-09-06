import {
  renderBlockedNarrativeScorecardMarkdownV6,
  renderNarrativeScorecardMarkdownV6,
  renderNarrativeTourMarkdownV6,
  renderNarrativeCheckpointPreviewV8,
} from './NarrativeMarkdownV6';
import { NarrativeTourScorecardV6 } from './NarrativeEditorialAgentsV6';
import { SPEAKING_RATE_WORDS_PER_MINUTE } from './NarrativeDurationTargetsV8';
import type { TourGeometryV8Result } from './TourGeometryV8';
import type { NarrativeScriptV6 } from './NarrativeEditorialV6';

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

  const tourInput: Parameters<typeof renderNarrativeTourMarkdownV6>[0] = {
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
  };

  it('renders a complete user-readable tour without the internal weighted score', () => {
    const markdown = renderNarrativeTourMarkdownV6(tourInput);

    expect(markdown).toContain('# Tour de Barcelona — history');
    expect(markdown).toContain('## Guiones');
    expect(markdown).toContain('aprobado — Good');
    expect(markdown).toContain('Coste reportado de esta ejecución: $0.1500');
    expect(markdown).toContain('Exposición sin verificar de esta ejecución: $0.0500');
    expect(markdown).toContain('Gasto contabilizado anterior: $0.8000');
    expect(markdown).not.toContain('8.95');
  });

  it('computes Escucha estimate from speakingRateWordsPerMinute with V6 default 140', () => {
    const words = Array.from({ length: 250 }, (_, i) => `w${i + 1}`).join(' ');
    const input = {
      ...tourInput,
      scripts: [{
        stopId: 'parada', text: words, fingerprint: 's'.repeat(64),
        sentences: [{
          sentenceId: 'parada-S001', stopId: 'parada', index: 0,
          text: words,
        }],
      }],
    };

    const defaultMarkdown = renderNarrativeTourMarkdownV6(input);
    expect(defaultMarkdown).toContain('unas 2 min (250 palabras)');

    const rateMarkdown = renderNarrativeTourMarkdownV6({ ...input, speakingRateWordsPerMinute: SPEAKING_RATE_WORDS_PER_MINUTE });
    expect(rateMarkdown).toContain('unas 3 min (250 palabras)');

    expect(() => renderNarrativeTourMarkdownV6({ ...input, speakingRateWordsPerMinute: 0 })).toThrow();
  });

  it('uses V8 geometry guided duration and walking/self-transfer details when supplied', () => {
    const geometry: TourGeometryV8Result = {
      status: 'walkable',
      reason: null,
      blocks: [{ stopIds: ['parada'] }],
      legs: [
        { type: 'walking', fromStopId: 'parada', toStopId: 'parada2', durationSeconds: 300 },
        { type: 'self_transfer', fromStopId: 'parada2', toStopId: 'parada3', durationSeconds: null },
      ],
      guidedDurationMinutes: 90,
      externalTransferTimeIncluded: false,
      transferCount: 1,
      requestedDuration: 120,
    };

    const markdown = renderNarrativeTourMarkdownV6({ ...tourInput, geometry });

    expect(markdown).toContain('estimación estructural 90 min (incluye estancias planificadas en paradas; excluye traslados propios)');
    expect(markdown).toContain('Caminata aproximada: 5 min; 1 traslado(s) propio(s) sin tiempo estimado.');
    expect(markdown).not.toContain('el resto corresponde al recorrido, observación y pausas');
  });

  it('shows structural estimate unknown when geometry is explicitly null', () => {
    const markdown = renderNarrativeTourMarkdownV6({ ...tourInput, geometry: null });

    expect(markdown).toContain('estimación estructural desconocida');
    expect(markdown).not.toContain('el resto corresponde al recorrido, observación y pausas');
  });

  it.each([
    { fit: 'within_target', source: 'walking_graph', expected: 'Ajuste de duración: ajuste aproximado planificado, no garantía medida.' },
    { fit: 'short', source: 'walking_graph', expected: 'Aviso: la estimación de la ruta seleccionada está por debajo de la duración solicitada; requiere revisión de ruta.' },
    { fit: 'long', source: 'geometric', expected: 'Aviso: la estimación de la ruta seleccionada está por encima de la duración solicitada; requiere revisión de ruta.' },
    { fit: 'unknown', source: 'geometric', expected: 'Aviso: no hay ajuste de duración confirmado para la ruta seleccionada.' },
  ] as const)('exposes timing source and duration fit for $fit with $source', ({ fit, source, expected }) => {
    const geometry: TourGeometryV8Result = {
      status: 'walkable',
      reason: null,
      blocks: [{ stopIds: ['parada'] }],
      legs: [
        { type: 'walking', fromStopId: 'parada', toStopId: 'parada2', durationSeconds: 300 },
      ],
      guidedDurationMinutes: 90,
      externalTransferTimeIncluded: false,
      transferCount: 0,
      requestedDuration: 120,
      timingSource: source,
      durationFit: fit,
    };

    const markdown = renderNarrativeTourMarkdownV6({ ...tourInput, geometry });

    expect(markdown).toContain(source === 'walking_graph'
      ? 'Fuente de tiempos: grafo peatonal; tiempos estimados, no medición en campo.'
      : 'Fuente de tiempos: geometría aproximada; servicio peatonal no disponible.');
    expect(markdown).toContain(expected);
  });

  describe('renderNarrativeCheckpointPreviewV8', () => {
    const baseInput = {
      request: tourInput.request,
      route: tourInput.route,
      routeDiagnostics: tourInput.routeDiagnostics,
      promise: tourInput.promise,
      centralQuestion: tourInput.centralQuestion,
      dossiers: tourInput.dossiers,
      calls: tourInput.calls,
      budget: tourInput.budget,
    };

    it('returns null when script is null or route is empty', () => {
      expect(renderNarrativeCheckpointPreviewV8(baseInput, [{ script: null }])).toBeNull();
      expect(renderNarrativeCheckpointPreviewV8({ ...baseInput, route: { ...tourInput.route, stops: [] } }, [])).toBeNull();
    });

    it('includes content and explicit incomplete/unapproved notice without Approve even with prior approving scorecard', () => {
      const script = tourInput.scripts[0];
      const markdown = renderNarrativeCheckpointPreviewV8(tourInput, [{ script }]);

      expect(markdown).not.toBeNull();
      expect(markdown).toContain('Observa la plaza.');
      expect(markdown).toContain('Vista provisional del checkpoint: proceso y revisión incompletos; no aprobado para publicación.');
      expect(markdown).not.toContain('aprobado — Good');
      expect(markdown).toContain('requiere revisión — draft_review_required');
    });

    it('renders before.script for pending editComparison and current changed script for accepted edit', () => {
      const originalScript = tourInput.scripts[0];
      const changedScript: NarrativeScriptV6 = {
        stopId: 'parada',
        text: 'Texto modificado distinto.',
        fingerprint: 'c'.repeat(64),
        sentences: [{
          sentenceId: 'parada-S001', stopId: 'parada', index: 0,
          text: 'Texto modificado distinto.',
        }],
      };

      const pendingMarkdown = renderNarrativeCheckpointPreviewV8(baseInput, [{
        script: changedScript,
        editComparison: { decision: 'pending', before: { script: originalScript } },
      }]);
      expect(pendingMarkdown).not.toBeNull();
      expect(pendingMarkdown).toContain('Observa la plaza.');
      expect(pendingMarkdown).not.toContain('Texto modificado distinto.');

      const acceptedMarkdown = renderNarrativeCheckpointPreviewV8(baseInput, [{
        script: changedScript,
        editComparison: { decision: 'accepted', before: { script: originalScript } },
      }]);
      expect(acceptedMarkdown).not.toBeNull();
      expect(acceptedMarkdown).toContain('Texto modificado distinto.');
      expect(acceptedMarkdown).not.toContain('Observa la plaza.');
    });

    it('returns null for duplicate script IDs or wrong stop ID', () => {
      const script = tourInput.scripts[0];
      const duplicateStops = [{ script }, { script }];
      expect(renderNarrativeCheckpointPreviewV8(baseInput, duplicateStops)).toBeNull();

      const wrongStopScript: NarrativeScriptV6 = {
        stopId: 'wrong',
        text: 'Texto.',
        fingerprint: 'w'.repeat(64),
        sentences: [{ sentenceId: 'wrong-S001', stopId: 'wrong', index: 0, text: 'Texto.' }],
      };
      expect(renderNarrativeCheckpointPreviewV8(baseInput, [{ script: wrongStopScript }])).toBeNull();
      const duplicateRoute = { ...baseInput, route: { ...baseInput.route,
        stops: [baseInput.route.stops[0], baseInput.route.stops[0]] } };
      expect(renderNarrativeCheckpointPreviewV8(duplicateRoute, [{ script }, { script: wrongStopScript }])).toBeNull();
    });

    it('does not mutate original fixture or stop data after rendering', () => {
      const originalScript = tourInput.scripts[0];
      const originalStop = tourInput.route.stops[0];
      const originalText = originalScript.text;
      const originalStopId = originalStop.stopId;

      const markdown = renderNarrativeCheckpointPreviewV8(baseInput, [{ script: originalScript }]);
      expect(markdown).not.toBeNull();

      expect(originalScript.text).toBe(originalText);
      expect(originalStop.stopId).toBe(originalStopId);
      expect(tourInput.scripts[0].text).toBe('Observa la plaza.');
      expect(tourInput.route.stops[0].stopId).toBe('parada');
    });
  });
});
