import { NarrativeDossierV6, NarrativeSufficiencyRoleV6 } from './NarrativeDossierV6';
import { NarrativeNarrationTargetV8 } from './NarrativeDurationTargetsV8';
import {
  buildNarrativeEvidenceCardsV8,
  evaluateNarrativeRichnessV8,
} from './NarrativeRichnessV8';

interface PropositionFixture {
  text: string;
  role: NarrativeSufficiencyRoleV6;
  passageId: string;
}

function makeDossier(stopId: string, propositions: PropositionFixture[]): NarrativeDossierV6 {
  const passageIds = [...new Set(propositions.map((proposition) => proposition.passageId))];
  return {
    stopId,
    language: 'es',
    sources: [
      {
        sourceId: 'source-a',
        finalUrl: 'https://example.test/a',
        title: 'Fuente A',
        capturedAt: '2026-09-03T00:00:00.000Z',
        fingerprint: 'source-a-fingerprint',
        authority: {
          tier: 'established_source',
          publisherKey: 'publisher-a',
          rule: 'fixture',
        },
      },
      {
        sourceId: 'source-b',
        finalUrl: 'https://example.test/b',
        title: 'Fuente B',
        capturedAt: '2026-09-03T00:00:00.000Z',
        fingerprint: 'source-b-fingerprint',
        authority: {
          tier: 'established_source',
          publisherKey: 'publisher-b',
          rule: 'fixture',
        },
      },
    ],
    passages: passageIds.map((passageId, index) => ({
      passageId,
      sourceId: index % 2 === 0 ? 'source-a' : 'source-b',
      quote: `Pasaje sintético suficientemente largo para ${passageId} y sus pruebas narrativas.`,
    })),
    propositions: propositions.map((proposition, index) => {
      const passageIndex = passageIds.indexOf(proposition.passageId);
      return {
        propositionId: `proposition-${index + 1}`,
        text: proposition.text,
        role: proposition.role,
        certainty: 'high',
        interpretation: 'direct',
        sourceIds: [passageIndex % 2 === 0 ? 'source-a' : 'source-b'],
        passageIds: [proposition.passageId],
      };
    }),
    authorizedNames: [],
    authorizedNumbers: [],
    discrepancies: [],
    limits: [],
    sufficiency: {
      isSufficient: true,
      missingRoles: [],
      authoritySourceCount: 2,
      independentPublisherCount: 2,
    },
    fingerprint: `${stopId}-fingerprint`,
  };
}

function target(stopId: string, targetSeconds = 300): NarrativeNarrationTargetV8 {
  return {
    stopId,
    targetSeconds,
    targetWords: targetSeconds * 2,
    minPropositions: 10,
    maxPropositions: 14,
    minVisualAnchors: 2,
  };
}

describe('NarrativeRichnessV8', () => {
  it('projects traceable cards and maps a visible observation to visual and spatial facets', () => {
    const dossier = makeDossier('plaza-mayor', [
      {
        text: 'Los balcones forman una fachada continua alrededor de la plaza.',
        role: 'visible_observation',
        passageId: 'passage-1',
      },
    ]);

    const cards = buildNarrativeEvidenceCardsV8(dossier);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      cardId: 'card-proposition-1',
      propositionId: 'proposition-1',
      sourceIds: ['source-a'],
      passageIds: ['passage-1'],
      facets: expect.arrayContaining(['visual', 'spatial']),
      visual: true,
      spatial: true,
    });
  });

  it('allows a rich Plaza Mayor dossier to support 300 seconds', () => {
    const dossier = makeDossier('plaza-mayor', [
      { text: 'La plaza presenta soportales visibles en todo su perímetro.', role: 'visible_observation', passageId: 'passage-1' },
      { text: 'Las fachadas conservan una composición regular y reconocible.', role: 'visible_observation', passageId: 'passage-2' },
      { text: 'La primera etapa documentada transformó el espacio urbano.', role: 'chronology_or_transformation', passageId: 'passage-3' },
      { text: 'Una reconstrucción posterior modificó su configuración.', role: 'chronology_or_transformation', passageId: 'passage-4' },
      { text: 'Los comerciantes ocuparon los soportales durante generaciones.', role: 'human_agency_or_lived_function', passageId: 'passage-5' },
      { text: 'Las celebraciones públicas reunieron a habitantes y visitantes.', role: 'human_agency_or_lived_function', passageId: 'passage-6' },
      { text: 'Su uso cotidiano contrastó con las ceremonias oficiales.', role: 'tension_or_contrast', passageId: 'passage-7' },
      { text: 'Las reformas conservaron la unidad mientras cambiaban los usos.', role: 'tension_or_contrast', passageId: 'passage-8' },
      { text: 'La continuidad de sus soportales distingue esta plaza.', role: 'distinctive_trait', passageId: 'passage-9' },
      { text: 'La combinación de vivienda y espacio cívico define su singularidad.', role: 'distinctive_trait', passageId: 'passage-10' },
    ]);

    const profile = evaluateNarrativeRichnessV8(dossier, target('plaza-mayor'));

    expect(profile.maximumSupportedSeconds).toBe(300);
    expect(profile.richnessReady).toBe(true);
    expect(profile.supportedCardCount).toBe(10);
    expect(profile.distinctPassageCount).toBe(10);
    expect(profile.facetCount).toBeGreaterThanOrEqual(5);
    expect(profile.visualCardCount).toBe(2);
  });

  it('keeps writerReady true when legacy V6 sufficiency is false but V8 richness is sufficient', () => {
    const dossier = makeDossier('plaza-mayor', [
      { text: 'La plaza presenta soportales visibles en todo su perímetro.', role: 'visible_observation', passageId: 'passage-1' },
      { text: 'Las fachadas conservan una composición regular y reconocible.', role: 'visible_observation', passageId: 'passage-2' },
      { text: 'La primera etapa documentada transformó el espacio urbano.', role: 'chronology_or_transformation', passageId: 'passage-3' },
      { text: 'Una reconstrucción posterior modificó su configuración.', role: 'chronology_or_transformation', passageId: 'passage-4' },
      { text: 'Los comerciantes ocuparon los soportales durante generaciones.', role: 'human_agency_or_lived_function', passageId: 'passage-5' },
      { text: 'Las celebraciones públicas reunieron a habitantes y visitantes.', role: 'human_agency_or_lived_function', passageId: 'passage-6' },
      { text: 'Su uso cotidiano contrastó con las ceremonias oficiales.', role: 'tension_or_contrast', passageId: 'passage-7' },
      { text: 'Las reformas conservaron la unidad mientras cambiaban los usos.', role: 'tension_or_contrast', passageId: 'passage-8' },
      { text: 'La continuidad de sus soportales distingue esta plaza.', role: 'distinctive_trait', passageId: 'passage-9' },
      { text: 'La combinación de vivienda y espacio cívico define su singularidad.', role: 'distinctive_trait', passageId: 'passage-10' },
    ]);
    dossier.sufficiency.isSufficient = false;

    const profile = evaluateNarrativeRichnessV8(dossier, target('plaza-mayor'), { writerReady: true });

    expect(profile.writerReady).toBe(true);
    expect(profile.richnessReady).toBe(true);
  });

  it('limits a medium Cibeles dossier to 240 seconds', () => {
    const dossier = makeDossier('cibeles', [
      { text: 'La fuente ocupa el centro de la intersección.', role: 'visible_observation', passageId: 'passage-1' },
      { text: 'El conjunto fue instalado durante una reforma urbana.', role: 'chronology_or_transformation', passageId: 'passage-2' },
      { text: 'Otra intervención cambió la relación con la calzada.', role: 'chronology_or_transformation', passageId: 'passage-3' },
      { text: 'Los viajeros usaron este cruce para orientarse.', role: 'human_agency_or_lived_function', passageId: 'passage-4' },
      { text: 'La ciudadanía adoptó la fuente como punto de encuentro.', role: 'human_agency_or_lived_function', passageId: 'passage-5' },
      { text: 'El tráfico moderno contrasta con el diseño ceremonial.', role: 'tension_or_contrast', passageId: 'passage-6' },
      { text: 'El uso representativo convivió con la circulación diaria.', role: 'tension_or_contrast', passageId: 'passage-7' },
      { text: 'La reforma posterior preservó la figura central.', role: 'chronology_or_transformation', passageId: 'passage-8' },
    ]);

    const profile = evaluateNarrativeRichnessV8(dossier, target('cibeles'));

    expect(profile.maximumSupportedSeconds).toBe(240);
    expect(profile.richnessReady).toBe(false);
    expect(profile.supportedCardCount).toBe(8);
    expect(profile.reasons).toContain('insufficient_supported_cards');
  });

  it('does not mistake repeated Colón material for a rich dossier', () => {
    const dossier = makeDossier('colon', [
      { text: 'El monumento domina visualmente la plaza.', role: 'visible_observation', passageId: 'passage-1' },
      { text: 'El monumento domina visualmente la plaza.', role: 'visible_observation', passageId: 'passage-1' },
      { text: 'La plaza cambió durante una reforma urbana.', role: 'chronology_or_transformation', passageId: 'passage-2' },
      { text: 'La plaza cambió durante una reforma urbana.', role: 'chronology_or_transformation', passageId: 'passage-2' },
      { text: 'El monumento domina visualmente la plaza.', role: 'distinctive_trait', passageId: 'passage-1' },
      { text: 'La plaza cambió durante una reforma urbana.', role: 'human_agency_or_lived_function', passageId: 'passage-2' },
      { text: 'El monumento domina visualmente la plaza.', role: 'tension_or_contrast', passageId: 'passage-1' },
      { text: 'La plaza cambió durante una reforma urbana.', role: 'chronology_or_transformation', passageId: 'passage-2' },
      { text: 'El monumento domina visualmente la plaza.', role: 'visible_observation', passageId: 'passage-1' },
      { text: 'La plaza cambió durante una reforma urbana.', role: 'human_agency_or_lived_function', passageId: 'passage-2' },
    ]);

    const profile = evaluateNarrativeRichnessV8(dossier, target('colon'));

    expect(profile.maximumSupportedSeconds).toBeLessThanOrEqual(180);
    expect(profile.richnessReady).toBe(false);
    expect(profile.duplicateCardCount).toBeGreaterThan(0);
    expect(profile.distinctPassageCount).toBe(2);
  });

  it('limits a sparse dossier to 120 seconds', () => {
    const dossier = makeDossier('sparse-stop', [
      { text: 'Se observa una fachada de piedra.', role: 'visible_observation', passageId: 'passage-1' },
      { text: 'El edificio fue reformado.', role: 'chronology_or_transformation', passageId: 'passage-2' },
      { text: 'La institución utilizó el inmueble.', role: 'human_agency_or_lived_function', passageId: 'passage-3' },
      { text: 'El uso nuevo contrasta con el anterior.', role: 'tension_or_contrast', passageId: 'passage-4' },
      { text: 'Su portada lo distingue.', role: 'distinctive_trait', passageId: 'passage-5' },
    ]);

    const profile = evaluateNarrativeRichnessV8(dossier, target('sparse-stop'));

    expect(profile.maximumSupportedSeconds).toBe(120);
    expect(profile.richnessReady).toBe(false);
  });

  it('reports a rich dossier as not writer-ready when the writer role is missing', () => {
    const dossier = makeDossier('plaza-mayor', [
      { text: 'La plaza presenta soportales visibles en todo su perímetro.', role: 'visible_observation', passageId: 'passage-1' },
      { text: 'Las fachadas conservan una composición regular y reconocible.', role: 'visible_observation', passageId: 'passage-2' },
      { text: 'La primera etapa documentada transformó el espacio urbano.', role: 'chronology_or_transformation', passageId: 'passage-3' },
      { text: 'Una reconstrucción posterior modificó su configuración.', role: 'chronology_or_transformation', passageId: 'passage-4' },
      { text: 'Los comerciantes ocuparon los soportales durante generaciones.', role: 'human_agency_or_lived_function', passageId: 'passage-5' },
      { text: 'Las celebraciones públicas reunieron a habitantes y visitantes.', role: 'human_agency_or_lived_function', passageId: 'passage-6' },
      { text: 'Su uso cotidiano contrastó con las ceremonias oficiales.', role: 'tension_or_contrast', passageId: 'passage-7' },
      { text: 'Las reformas conservaron la unidad mientras cambiaban los usos.', role: 'tension_or_contrast', passageId: 'passage-8' },
      { text: 'La continuidad de sus soportales distingue esta plaza.', role: 'distinctive_trait', passageId: 'passage-9' },
      { text: 'La combinación de vivienda y espacio cívico define su singularidad.', role: 'distinctive_trait', passageId: 'passage-10' },
    ]);

    const profile = evaluateNarrativeRichnessV8(dossier, target('plaza-mayor'), { writerReady: false });

    expect(profile.maximumSupportedSeconds).toBe(300);
    expect(profile.richnessReady).toBe(true);
    expect(profile.writerReady).toBe(false);
    expect(profile.reasons).toContain('dossier_not_writer_ready');
  });
});
