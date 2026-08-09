import { readFileSync } from 'fs';
import { join } from 'path';
import {
  NarrativeScriptRequestV1,
  NarrativeScriptResponseV1,
  narrativeContentFingerprintsV1,
  narrativeScriptResponseSchemaV1,
  validateNarrativeScriptRequestV1,
  validateNarrativeScriptResponseV1,
  validateNarrativeScriptsV1,
} from './NarrativePilotV1';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

function load<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES, ...parts), 'utf8')) as T;
}

function fixture() {
  const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
  const response = load<NarrativeScriptResponseV1>(
    'narrative-pilot-v1', 'paris-premium-es.response.json'
  );
  return { route, response, request: buildParisNarrativeScriptRequestV1(route) };
}

describe('Paris grounded narrative contracts v1', () => {
  it('uses a DeepSeek strict-compatible schema node at every level', () => {
    function assertSchemaNode(raw: unknown): void {
      const node = raw as Record<string, unknown>;
      expect(node.type !== undefined || node.anyOf !== undefined || node.$ref !== undefined).toBe(true);
      if (node.properties) {
        Object.values(node.properties as Record<string, unknown>).forEach(assertSchemaNode);
      }
      if (node.items) assertSchemaNode(node.items);
      if (Array.isArray(node.anyOf)) node.anyOf.forEach(assertSchemaNode);
    }

    const schema = narrativeScriptResponseSchemaV1();
    assertSchemaNode(schema);
    expect(JSON.stringify(schema)).toContain('"pattern":"^.{255,280}$"');
    expect(JSON.stringify(schema)).toContain('"pattern":"^.{130,160}$"');
  });

  it('locks the three requested scenes to their real v7 positions and neighbours', () => {
    const { route, request } = fixture();

    expect(request).toMatchObject({
      language: 'es-ES',
      promise: 'Desde la isla medieval hasta el Palais-Royal, descubrir cómo espacios sagrados y reales acabaron formando parte de la ciudad pública.',
      centralQuestion: '¿Cómo consiguió París convertir símbolos del poder en lugares que hoy siente como propios?',
      scenes: [
        { sceneId: 'notre-dame', routePosition: 1, previousSceneId: null, nextSceneId: 'sainte-chapelle' },
        { sceneId: 'louvre', routePosition: 6, previousSceneId: 'samaritaine', nextSceneId: 'carrousel' },
        { sceneId: 'palais-royal', routePosition: 8, previousSceneId: 'carrousel', nextSceneId: null },
      ],
    });
    expect(request.scenes.every((scene) => scene.evidenceFacts.length === 4)).toBe(true);
    expect(request.routeFingerprint).toBe(route.snapshot.fingerprints.route);

    const unsupportedLanguage = { ...request, language: 'fr-FR' } as unknown as NarrativeScriptRequestV1;
    expect(() => validateNarrativeScriptRequestV1(unsupportedLanguage))
      .toThrow('invalid narrative script request metadata');
  });

  it('validates exactly three grounded Spanish scripts of 220 to 260 words', () => {
    const { request, response } = fixture();

    const scripts = validateNarrativeScriptResponseV1(response, request);
    expect(scripts.map((script) => script.sceneId)).toEqual([
      'notre-dame', 'louvre', 'palais-royal',
    ]);
    expect(scripts.every((script) => script.wordCount >= 220 && script.wordCount <= 260)).toBe(true);
  });

  it('rejects route mutations, invented evidence, dates, proper names, and events', () => {
    const { request, response } = fixture();
    const scripts = response.scripts;

    const reordered = structuredClone(scripts);
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    expect(() => validateNarrativeScriptsV1(reordered, request)).toThrow('scene order');
    expect(() => validateNarrativeScriptsV1(scripts.slice(0, 2), request)).toThrow('scene count');

    const inventedEvidence = structuredClone(scripts);
    inventedEvidence[0].blocks[0].evidenceFactIds = ['invented-fact'];
    expect(() => validateNarrativeScriptsV1(inventedEvidence, request)).toThrow('invented evidence');

    const inventedDate = structuredClone(scripts);
    inventedDate[1].blocks[0].text = inventedDate[1].blocks[0].text.replace('1190', '1889');
    expect(() => validateNarrativeScriptsV1(inventedDate, request)).toThrow('unsupported date');

    const inventedPerson = structuredClone(scripts);
    inventedPerson[1].blocks[0].text = inventedPerson[1].blocks[0].text
      .replace('Philippe Auguste', 'general Napoleón');
    expect(() => validateNarrativeScriptsV1(inventedPerson, request)).toThrow('unsupported proper name');

    const inventedEvent = structuredClone(scripts);
    inventedEvent[1].blocks[0].text = inventedEvent[1].blocks[0].text
      .replace('fortaleza', 'coronación');
    expect(() => validateNarrativeScriptsV1(inventedEvent, request))
      .toThrow('unsupported event coronación');

    const english = structuredClone(scripts);
    english[0].blocks[0].text = english[0].blocks[0].text.replace(' la ', ' the ');
    expect(() => validateNarrativeScriptsV1(english, request)).toThrow('not Spanish');
  });

  it('rejects wrong transitions, equivalent openings, repeated phrases, and filler facts', () => {
    const { request, response } = fixture();
    const scripts = response.scripts;

    const wrongTransition = structuredClone(scripts);
    wrongTransition[0].transition.targetSceneId = 'louvre';
    expect(() => validateNarrativeScriptsV1(wrongTransition, request)).toThrow('transition');

    const sameOpening = structuredClone(scripts);
    sameOpening[1].openingType = sameOpening[0].openingType;
    expect(() => validateNarrativeScriptsV1(sameOpening, request)).toThrow('opening');

    const repeatedPhrase = structuredClone(scripts);
    repeatedPhrase[1].blocks[0].text = `${repeatedPhrase[0].blocks[0].text} ${repeatedPhrase[1].blocks[0].text}`;
    expect(() => validateNarrativeScriptsV1(repeatedPhrase, request)).toThrow('repeated phrase');

    const filler = structuredClone(scripts);
    const repeatedFactId = filler[0].blocks[0].evidenceFactIds[0];
    filler[0].blocks.forEach((block) => { block.evidenceFactIds = [repeatedFactId]; });
    expect(() => validateNarrativeScriptsV1(filler, request)).toThrow('filler');

    const noLook = structuredClone(scripts);
    noLook[1].blocks[1].text = noLook[1].blocks[1].text.replace('Observa', 'Piensa');
    expect(() => validateNarrativeScriptsV1(noLook, request)).toThrow('visual instruction');

    const wrongReportedCount = structuredClone(scripts);
    wrongReportedCount[0].wordCount -= 1;
    expect(validateNarrativeScriptsV1(wrongReportedCount, request)[0].wordCount)
      .toBe(scripts[0].wordCount);

    const tooLong = structuredClone(scripts);
    tooLong[0].blocks[4].text += ` ${'detalle '.repeat(50)}`;
    tooLong[0].wordCount += 50;
    expect(() => validateNarrativeScriptsV1(tooLong, request)).toThrow('actual words');
  });

  it('fingerprints route, evidence, and text independently', () => {
    const { request, response } = fixture();
    const saved = narrativeContentFingerprintsV1(request, response.scripts);

    const changedRoute = structuredClone(request);
    changedRoute.routeFingerprint = 'changed-route';
    expect(narrativeContentFingerprintsV1(changedRoute, response.scripts)).toEqual({
      ...saved, route: 'changed-route',
    });

    const changedEvidence = structuredClone(request);
    changedEvidence.scenes[0].evidenceFacts[0].excerpt += ' Cambio.';
    const evidenceFingerprint = narrativeContentFingerprintsV1(changedEvidence, response.scripts);
    expect(evidenceFingerprint.route).toBe(saved.route);
    expect(evidenceFingerprint.evidence).not.toBe(saved.evidence);
    expect(evidenceFingerprint.text).toBe(saved.text);

    const changedText = structuredClone(response.scripts);
    changedText[0].blocks[0].text += ' Cambio.';
    const textFingerprint = narrativeContentFingerprintsV1(request, changedText);
    expect(textFingerprint.route).toBe(saved.route);
    expect(textFingerprint.evidence).toBe(saved.evidence);
    expect(textFingerprint.text).not.toBe(saved.text);
  });
});
