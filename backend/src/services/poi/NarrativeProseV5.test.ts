import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import {
  NarrativeProseDraftV5,
  NarrativeProseValidationErrorV5,
  materializeNarrativeProseV5,
  validateNarrativeProseV5,
} from './NarrativeProseV5';

const SCENE_REFLECTIONS: Record<string, string> = {
  palace: 'La convivencia entre ceremonia, residencia y visita pública permite leer el edificio como una institución todavía activa. El cambio de escala se percibe al pasar del antiguo recinto fortificado a una fachada pensada para durar, ordenar el entorno y hacer visible la autoridad.',
  almudena: 'El resultado obliga a mirar una catedral reciente con preguntas distintas a las de un templo medieval. Su larga construcción reunió estilos, interrupciones y decisiones sucesivas hasta formar una imagen capaz de dialogar con el palacio situado enfrente.',
  villa: 'En este espacio reducido conviven huellas domésticas, nobiliarias y municipales. Esa cercanía ayuda a entender que el gobierno urbano no apareció de golpe: fue ocupando edificios, fijando sedes y transformando una trama heredada sin borrar por completo sus capas anteriores.',
  mayor: 'La regularidad de la plaza no elimina las vidas que la atravesaron. Viviendas, comercio, celebraciones y reconstrucciones compartieron un mismo marco, de modo que la arquitectura ordenada funcionó a la vez como escenario cotidiano y representación pública de la ciudad.',
  sol: 'La amplitud actual puede hacer olvidar que este lugar cambió de forma y de función muchas veces. Leer sus edificios y su trazado como partes de una secuencia permite reconocer el paso hacia un centro administrativo, circulatorio y simbólico.',
  cibeles: 'La fuente y los grandes edificios convierten el cruce en una composición urbana, no en una pieza aislada. Al observarlos juntos se entiende mejor cómo la expansión de Madrid empleó perspectivas, instituciones y monumentos para expresar una nueva escala de capital.',
  alcala: 'La puerta conserva su sentido ceremonial aunque hoy esté rodeada por el movimiento de la ciudad. Su posición permite cerrar el recorrido comparando el antiguo límite urbano con la expansión posterior y preguntarse qué formas de poder siguen siendo visibles en el espacio público.',
};

function naturalDraft(): NarrativeProseDraftV5 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-prose-draft-v5',
    introduction: 'Sin embargo, Madrid no se explica mediante una sola fecha ni desde un único monumento. Este paseo sigue siete lugares donde la residencia real, el culto, el gobierno municipal y los nuevos espacios públicos cambiaron la escala de la ciudad. En cada parada observaremos una huella concreta y la relacionaremos con quienes tomaron decisiones sobre ella.',
    scripts: plan.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      blocks: scene.blocks.map((block, blockIndex) => ({
        kind: block.kind,
        text: `${block.claims[0].text}${blockIndex === 4 ? ` ${SCENE_REFLECTIONS[scene.sceneId]}` : ''}`,
      })),
    })),
  };
}

describe('NarrativeProseV5', () => {
  it('accepts natural Spanish prose and sentence-opening connectors', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const report = validateNarrativeProseV5(
      naturalDraft(),
      evidence,
      buildNarrativeClaimPlanV4(evidence)
    );

    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.text?.scripts).toHaveLength(7);
    expect(report.text?.scripts.every((scene) => (
      scene.bodyWordCount >= 160 && scene.bodyWordCount <= 200
    ))).toBe(true);
  });

  it('reports simultaneous introduction and scene problems instead of failing fast', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const draft = naturalDraft();
    draft.introduction = 'Madrid 9999.';
    draft.scripts[0].blocks[0].text = draft.scripts[0].blocks[0].text
      .replace('El Palacio', 'El cronista Aurelio Valdés describió el Palacio');
    draft.scripts[0].blocks[4].text += ` ${SCENE_REFLECTIONS.palace}`;
    draft.scripts[1].blocks[1].text = 'La fachada permanece delante de quien visita este lugar.';

    const report = validateNarrativeProseV5(
      draft,
      evidence,
      buildNarrativeClaimPlanV4(evidence)
    );

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'word_count', path: 'introduction' }),
      expect.objectContaining({ code: 'unknown_number', path: 'introduction' }),
      expect.objectContaining({ code: 'unknown_proper_noun', sceneId: 'palace' }),
      expect.objectContaining({
        code: 'word_count',
        sceneId: 'palace',
        message: expect.stringMatching(/has \d+ Unicode words; must contain 160 to 200/),
      }),
      expect.objectContaining({ code: 'visual_instruction', sceneId: 'almudena' }),
      expect.objectContaining({ code: 'visual_cue', sceneId: 'almudena' }),
    ]));
  });

  it('rejects a genuinely invented multi-word name', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const draft = naturalDraft();
    draft.scripts[2].blocks[0].text += ' El cronista Aurelio Valdés atribuyó el cambio a su propia intervención.';

    const report = validateNarrativeProseV5(
      draft,
      evidence,
      buildNarrativeClaimPlanV4(evidence)
    );

    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'unknown_proper_noun',
      sceneId: 'villa',
      message: expect.stringContaining('Aurelio Valdés'),
    }));
  });

  it('throws one repair-safe error containing the complete issue list', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const draft = naturalDraft();
    draft.introduction = 'Texto breve 9999.';
    draft.scripts[6].blocks[0].text += ' El supuesto autor Aurelio Valdés aparece aquí.';

    expect(() => materializeNarrativeProseV5(
      draft,
      evidence,
      buildNarrativeClaimPlanV4(evidence)
    )).toThrow(NarrativeProseValidationErrorV5);

    try {
      materializeNarrativeProseV5(draft, evidence, buildNarrativeClaimPlanV4(evidence));
    } catch (error) {
      expect(error).toBeInstanceOf(NarrativeProseValidationErrorV5);
      expect((error as NarrativeProseValidationErrorV5).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'word_count', path: 'introduction' }),
        expect.objectContaining({ code: 'unknown_number', path: 'introduction' }),
        expect.objectContaining({ code: 'unknown_proper_noun', sceneId: 'alcala' }),
      ]));
    }
  });
});
