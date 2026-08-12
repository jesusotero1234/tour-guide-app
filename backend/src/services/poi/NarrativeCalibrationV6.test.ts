import rubric from '../../../fixtures/narrative-madrid-v6/research-rubric.json';
import {
  evaluateNarrativeEditorialGateV6,
  evaluateNarrativeResearchGateV6,
  narrativeReferenceRequirementsFromRubricV6,
  validateNarrativeMadridResearchRubricV6,
} from './NarrativeCalibrationV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';

describe('narrative v6 Madrid calibration gates', () => {
  const evidenceFor = (stops: ReturnType<typeof validateNarrativeMadridResearchRubricV6>['stops']) => (
    [...new Map(stops.flatMap((stop) => stop.facets.flatMap((facet) => (
      facet.humanEvidence.map((evidence) => [evidence.referenceId, evidence] as const)
    ))).map(([referenceId]) => [referenceId, {
      referenceId,
      excerpts: stops.flatMap((stop) => stop.facets.flatMap((facet) => (
        facet.humanEvidence.filter((item) => item.referenceId === referenceId)
          .map((item) => item.literalExcerpt)
      ))),
    }])).values()]
  );

  it('propagates every Palace hard facet and its permitted grounding role to the curator', () => {
    const validated = validateNarrativeMadridResearchRubricV6(rubric);
    const targets = narrativeReferenceRequirementsFromRubricV6(validated, 'palace')
      .flatMap((requirement) => requirement.facetTargets);
    const byId = new Map(targets.map((target) => [target.facetId, target]));

    expect(byId.get('juvarra-site')).toMatchObject({
      allowedRoles: ['chronology_or_transformation', 'tension_or_contrast'],
      conceptGroups: expect.arrayContaining([
        expect.arrayContaining(['juvarra']),
        expect.arrayContaining(['otro emplazamiento', 'fuera del solar del alcázar']),
      ]),
    });
    expect(byId.get('fire-resistant-construction')).toMatchObject({
      allowedRoles: ['distinctive_trait', 'chronology_or_transformation'],
      conceptGroups: expect.arrayContaining([
        expect.arrayContaining(['bóvedas']),
        expect.arrayContaining(['sin madera']),
        expect.arrayContaining(['incendio']),
      ]),
    });
    expect(byId.get('visible-exterior')).toMatchObject({
      allowedRoles: ['visible_observation'],
      conceptGroups: expect.arrayContaining([
        expect.arrayContaining(['palacio real']),
        expect.arrayContaining(['seis niveles']),
        expect.arrayContaining(['ocho niveles']),
        expect.arrayContaining(['bailén']),
      ]),
    });
    expect(byId.get('current-function')).toMatchObject({
      allowedRoles: ['human_agency_or_lived_function'],
      conceptGroups: expect.arrayContaining([
        expect.arrayContaining(['no está habitado']),
        expect.arrayContaining(['museo', 'abierto al público']),
        expect.arrayContaining(['actos oficiales', 'actos institucionales']),
      ]),
    });
  });

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
    const proposition = (
      propositionId: string,
      text: string,
      role: NarrativeDossierV6['propositions'][number]['role']
    ) => ({
      propositionId, text, role, certainty: 'high' as const, interpretation: 'direct' as const,
      sourceIds: [['P1', 'P2', 'P3', 'P4'].includes(propositionId) ? 'S03' : 'S01'],
      passageIds: [`passage-${propositionId}`],
    });
    const propositions = [
      proposition('P1', 'El Alcázar quedó destruido por el fuego en la Nochebuena de 1734.',
        'chronology_or_transformation'),
      proposition('P2', 'Juvarra diseñó un proyecto para otro emplazamiento.', 'tension_or_contrast'),
      proposition('P3', 'Sacchetti produjo un proyecto nuevo y concentró el programa en altura.',
        'tension_or_contrast'),
      proposition('P4', 'La estructura abovedada prescindió de madera para resistir el fuego.',
        'distinctive_trait'),
      proposition('P5', 'Desde la calle de Bailén, el Palacio Real construido muestra seis niveles y alcanza ocho niveles con el desnivel.',
        'visible_observation'),
      proposition('P6', 'Los monarcas no viven allí: el edificio es visitable como museo y acoge actos institucionales.',
        'human_agency_or_lived_function'),
    ];
    const dossier = {
      stopId: 'palace',
      sources: [
        {
          sourceId: 'S01', finalUrl: palace.referenceSources[0].url,
          authority: { publisherKey: 'madrid.es' },
        },
        {
          sourceId: 'S03', finalUrl: palace.referenceSources[1].url,
          authority: { publisherKey: 'patrimonionacional.es' },
        },
      ],
      passages: [
        { passageId: 'passage-P1', sourceId: 'S03', quote: 'El Alcázar sufrió un incendio, la Nochebuena de 1734, y fue destruido por el fuego.' },
        { passageId: 'passage-P2', sourceId: 'S03', quote: 'Para el proyecto de Juvarra, la primera y fundamental fue la elección del lugar: otro emplazamiento más amplio.' },
        { passageId: 'passage-P3', sourceId: 'S03', quote: 'Sacchetti hizo un proyecto nuevo: la horizontalidad hubo de convertirlo aquí Sacchetti en verticalidad.' },
        { passageId: 'passage-P4', sourceId: 'S03', quote: 'Tras el incendio se ordenó una estructura abovedada: toda la nueva estructura fuese de bóveda, sin más madera que la de puertas y ventanas.' },
        { passageId: 'passage-P5', sourceId: 'S01', quote: 'El Palacio Real construido tiene ocho niveles -seis en la calle Bailen-.' },
        { passageId: 'passage-P6', sourceId: 'S01', quote: 'El edificio actualmente no se encuentra habitado; está abierto al público como museo y acoge actos institucionales.' },
      ],
      propositions,
      limits: ['No afirmar quién provocó el incendio.'],
      sufficiency: { isSufficient: true },
    } as NarrativeDossierV6;
    const referenceEvidence = evidenceFor([palace]);
    const gateFor = (candidate: NarrativeDossierV6) => evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] },
      outcomes: [{ stopId: 'palace', status: 'sufficient' as const, dossier: candidate }],
      humanSpotCheck: 'accepted', referenceEvidence,
    });

    const acceptedGate = gateFor(dossier);
    expect(acceptedGate).toMatchObject({
      status: 'passed',
      facets: expect.arrayContaining([expect.objectContaining({ status: 'met' })]),
    });
    expect(evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] },
      outcomes: [{ stopId: 'palace', status: 'sufficient', dossier }],
      humanSpotCheck: 'pending',
      referenceEvidence,
    })).toMatchObject({ status: 'human_spot_check_required' });

    expect(evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] },
      outcomes: [{
        stopId: 'palace', status: 'sufficient',
        dossier: { ...dossier, propositions: propositions.slice(0, -1) } as NarrativeDossierV6,
      }],
      humanSpotCheck: 'accepted',
      referenceEvidence,
    })).toMatchObject({
      status: 'model_calibration_failed', stage: 'research',
      reason: expect.stringContaining('current-function'),
    });

    const unsafe = {
      ...dossier,
      propositions: [proposition(
        'unsafe', 'El incendio fue provocado por miembros franceses.',
        'chronology_or_transformation'
      )],
    } as NarrativeDossierV6;
    expect(evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] },
      outcomes: [{ stopId: 'palace', status: 'sufficient', dossier: unsafe }],
      humanSpotCheck: 'accepted',
      referenceEvidence,
    })).toMatchObject({ status: 'model_calibration_failed', stage: 'research' });

    const negatedFire = {
      ...dossier,
      propositions: propositions.map((item) => item.propositionId === 'P1'
        ? { ...item, text: 'El Alcázar no fue destruido por un incendio en 1734.' }
        : item),
    } as NarrativeDossierV6;
    expect(gateFor(negatedFire)).toMatchObject({
      status: 'model_calibration_failed',
      reason: expect.stringContaining('alcazar-fire=contradictory'),
    });

    for (const irrelevantExterior of [
      'El proyecto de Juvarra muestra seis niveles y ocho niveles desde la calle de Bailén.',
      'Desde el Mirador, el Palacio Real muestra seis niveles y ocho niveles junto a Bailén.',
    ]) {
      const candidate = {
        ...dossier,
        propositions: propositions.map((item) => item.propositionId === 'P5'
          ? { ...item, text: irrelevantExterior }
          : item),
      } as NarrativeDossierV6;
      expect(gateFor(candidate)).toMatchObject({
        status: 'model_calibration_failed',
        reason: expect.stringContaining('visible-exterior=contradictory'),
      });
    }

    const partialFunction = {
      ...dossier,
      propositions: propositions.map((item) => item.propositionId === 'P6'
        ? { ...item, text: 'El Palacio Real está abierto al público como museo.' }
        : item),
    } as NarrativeDossierV6;
    expect(gateFor(partialFunction)).toMatchObject({
      status: 'model_calibration_failed',
      reason: expect.stringContaining('current-function=partial'),
    });
  });

  it('requires every human S01/S03 anchor before evaluating a dossier', () => {
    const validated = validateNarrativeMadridResearchRubricV6(rubric);
    const palace = validated.stops.find((stop) => stop.stopId === 'palace')!;

    expect(evaluateNarrativeResearchGateV6({
      rubric: { ...validated, stops: [palace] }, outcomes: [], humanSpotCheck: 'accepted',
      referenceEvidence: [{ referenceId: 'S01-municipal', excerpts: [] }],
    })).toMatchObject({
      status: 'reference_evidence_missing',
      stopId: 'palace',
      missingReferenceIds: expect.arrayContaining(['S01-municipal', 'S03-institutional']),
    });
  });
});
