import rubric from '../../../fixtures/narrative-madrid-v6/research-rubric.json';
import {
  evaluateNarrativeEditorialGateV6,
  evaluateNarrativeResearchGateV6,
  validateNarrativeMadridResearchRubricV6,
} from './NarrativeCalibrationV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';

describe('narrative v6 Madrid calibration gates', () => {
  it('keeps holdout prompt fingerprints locked and requires every mutation to be detected', () => {
    const prompt = 'a'.repeat(64);
    expect(evaluateNarrativeEditorialGateV6({
      developmentStopIds: ['palace'], validationStopIds: ['sol', 'alcala'],
      stopOutcomes: [
        { stopId: 'palace', status: 'ready_for_human_gate', promptFingerprint: prompt },
        { stopId: 'sol', status: 'ready_for_human_gate', promptFingerprint: prompt },
        { stopId: 'alcala', status: 'ready_for_human_gate', promptFingerprint: prompt },
      ],
      mutations: [
        { mutationId: 'invented-causality', detected: true },
        { mutationId: 'mixed-dates', detected: true },
      ],
    })).toEqual({ status: 'passed' });

    expect(evaluateNarrativeEditorialGateV6({
      developmentStopIds: ['palace'], validationStopIds: ['sol'],
      stopOutcomes: [
        { stopId: 'palace', status: 'ready_for_human_gate', promptFingerprint: prompt },
        { stopId: 'sol', status: 'ready_for_human_gate', promptFingerprint: 'b'.repeat(64) },
      ],
      mutations: [{ mutationId: 'invented-causality', detected: false }],
    })).toMatchObject({ status: 'model_calibration_failed', stage: 'editorial_engine' });
  });

  it('compares machine research to deterministic Madrid authority and forbidden-claim ground truth', () => {
    const validated = validateNarrativeMadridResearchRubricV6(rubric);
    const palace = validated.stops.find((stop) => stop.stopId === 'palace')!;
    const dossier = {
      stopId: 'palace',
      sources: [{ authority: { publisherKey: 'patrimonionacional.es' } }],
      propositions: [
        { text: 'El Alcázar fue destruido por un incendio en la Nochebuena de 1734.' },
        { text: 'Juvarra preparó un proyecto para otro emplazamiento.' },
        { text: 'Sacchetti produjo un proyecto nuevo de planta vertical.' },
        { text: 'Las bóvedas evitaron la madera para resistir otro incendio.' },
        { text: 'La fachada del palacio hace visibles sus niveles.' },
        { text: 'El palacio funciona como museo y acoge actos oficiales.' },
      ],
      limits: ['No afirmar quién provocó el incendio.'],
      sufficiency: { isSufficient: true },
    } as NarrativeDossierV6;

    expect(evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] },
      outcomes: [{ stopId: 'palace', status: 'sufficient', dossier }],
      humanSpotCheck: 'accepted',
    })).toEqual({ status: 'passed' });
    expect(evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] },
      outcomes: [{ stopId: 'palace', status: 'sufficient', dossier }],
      humanSpotCheck: 'pending',
    })).toMatchObject({ status: 'human_spot_check_required' });

    expect(evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] },
      outcomes: [{
        stopId: 'palace', status: 'sufficient',
        dossier: { ...dossier, propositions: dossier.propositions.slice(0, -1) } as NarrativeDossierV6,
      }],
      humanSpotCheck: 'accepted',
    })).toMatchObject({
      status: 'model_calibration_failed', stage: 'research',
      reason: expect.stringContaining('current-function'),
    });

    const unsafe = {
      ...dossier,
      propositions: [{ text: 'El incendio fue provocado por miembros franceses.' }],
    } as NarrativeDossierV6;
    expect(evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] },
      outcomes: [{ stopId: 'palace', status: 'sufficient', dossier: unsafe }],
      humanSpotCheck: 'accepted',
    })).toMatchObject({ status: 'model_calibration_failed', stage: 'research' });
  });
});
