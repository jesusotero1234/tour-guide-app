import { NarrativeDossierV6, NarrativeSufficiencyRoleV6 } from './NarrativeDossierV6';
import { narrationTargetForSecondsV8 } from './NarrativeDurationTargetsV8';
import {
  NARRATIVE_BEAT_ORDER_V8,
  buildNarrativeWriterPlanV8,
} from './NarrativeWriterContractV8';

function dossierWithRoles(
  stopId: string,
  definitions: Array<{ role: NarrativeSufficiencyRoleV6; text: string }>
): NarrativeDossierV6 {
  return {
    stopId,
    language: 'es',
    sources: [{
      sourceId: 'source-1',
      finalUrl: 'https://example.test/source',
      title: 'Fuente',
      capturedAt: '2026-09-03T00:00:00.000Z',
      fingerprint: 'source-fingerprint',
      authority: {
        tier: 'established_source',
        publisherKey: 'publisher',
        rule: 'fixture',
      },
    }],
    passages: definitions.map((_, index) => ({
      passageId: `passage-${index + 1}`,
      sourceId: 'source-1',
      quote: `Pasaje sintético ${index + 1} con contenido suficiente para la prueba del contrato narrativo.`,
    })),
    propositions: definitions.map((definition, index) => ({
      propositionId: `proposition-${index + 1}`,
      text: definition.text,
      role: definition.role,
      certainty: 'high',
      interpretation: 'direct',
      sourceIds: ['source-1'],
      passageIds: [`passage-${index + 1}`],
    })),
    authorizedNames: [],
    authorizedNumbers: [],
    discrepancies: [],
    limits: [],
    sufficiency: {
      isSufficient: true,
      missingRoles: [],
      authoritySourceCount: 1,
      independentPublisherCount: 1,
    },
    fingerprint: `${stopId}-fingerprint`,
  };
}

const RICH_DEFINITIONS: Array<{ role: NarrativeSufficiencyRoleV6; text: string }> = [
  { role: 'visible_observation', text: 'Los arcos delimitan visualmente el espacio.' },
  { role: 'visible_observation', text: 'La fachada continua orienta la mirada.' },
  { role: 'chronology_or_transformation', text: 'La plaza fue reconstruida después de un incendio.' },
  { role: 'chronology_or_transformation', text: 'Una reforma posterior regularizó los edificios.' },
  { role: 'human_agency_or_lived_function', text: 'Los comerciantes ocuparon los soportales.' },
  { role: 'human_agency_or_lived_function', text: 'Las fiestas reunieron a la población.' },
  { role: 'tension_or_contrast', text: 'El uso cotidiano contrastó con el ceremonial.' },
  { role: 'tension_or_contrast', text: 'La continuidad formal convivió con usos cambiantes.' },
  { role: 'distinctive_trait', text: 'Los soportales continuos distinguen este conjunto.' },
  { role: 'distinctive_trait', text: 'La mezcla residencial y cívica define su singularidad.' },
];

describe('NarrativeWriterContractV8', () => {
  it('builds an ordered, traceable beat plan from admitted evidence cards', () => {
    const dossier = dossierWithRoles('plaza-mayor', RICH_DEFINITIONS);

    const plan = buildNarrativeWriterPlanV8({
      routeStopId: 'plaza-mayor',
      dossier,
      narrationTarget: narrationTargetForSecondsV8('plaza-mayor', 300),
      stopIndex: 0,
    });

    expect(plan.version).toBe('segments_v8');
    expect(plan.openingMode).toBe('gaze');
    expect(plan.minimumHighPriorityCoverage).toBe(0.7);
    expect(plan.evidenceCards).toHaveLength(10);
    expect(plan.beats.map((beat) => beat.beat)).toEqual(NARRATIVE_BEAT_ORDER_V8);

    const cardIds = new Set(plan.evidenceCards.map((card) => card.cardId));
    for (const beat of plan.beats) {
      expect(beat.evidenceCardIds.length).toBeGreaterThan(0);
      expect(beat.evidenceCardIds.every((cardId) => cardIds.has(cardId))).toBe(true);
    }
    expect(plan.highPriorityCardIds.every((cardId) => cardIds.has(cardId))).toBe(true);
  });

  it('omits unsupported beats instead of creating decorative placeholders', () => {
    const dossier = dossierWithRoles('thin-stop', [
      { role: 'visible_observation', text: 'La portada se observa desde la plaza.' },
      { role: 'chronology_or_transformation', text: 'La portada fue restaurada.' },
    ]);

    const plan = buildNarrativeWriterPlanV8({
      routeStopId: 'thin-stop',
      dossier,
      narrationTarget: narrationTargetForSecondsV8('thin-stop', 120),
      stopIndex: 1,
    });

    expect(plan.beats.map((beat) => beat.beat)).toEqual([
      'arrival_and_orientation',
      'visible_anchor',
      'time_shift',
    ]);
    expect(plan.beats.every((beat) => beat.evidenceCardIds.length > 0)).toBe(true);
  });

  it('does not offer duplicate claims to the writer', () => {
    const dossier = dossierWithRoles('duplicate-stop', [
      { role: 'visible_observation', text: 'La estatua domina el centro de la plaza.' },
      { role: 'visible_observation', text: 'La estatua domina el centro de la plaza.' },
      { role: 'chronology_or_transformation', text: 'El entorno fue reformado.' },
    ]);

    const plan = buildNarrativeWriterPlanV8({
      routeStopId: 'duplicate-stop',
      dossier,
      narrationTarget: narrationTargetForSecondsV8('duplicate-stop', 120),
      stopIndex: 2,
    });

    expect(plan.evidenceCards).toHaveLength(2);
    expect(plan.evidenceCards.map((card) => card.claim)).toEqual([
      'La estatua domina el centro de la plaza.',
      'El entorno fue reformado.',
    ]);
  });

  it('rotates opening modes across consecutive stops', () => {
    const dossier = dossierWithRoles('stop', RICH_DEFINITIONS);

    const openingModes = [0, 1, 2, 3].map((stopIndex) => buildNarrativeWriterPlanV8({
      routeStopId: `stop-${stopIndex}`,
      dossier,
      narrationTarget: narrationTargetForSecondsV8(`stop-${stopIndex}`, 300),
      stopIndex,
    }).openingMode);

    expect(openingModes).toEqual(['gaze', 'movement', 'contrast', 'gaze']);
  });
});
