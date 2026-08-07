import { readFileSync } from 'fs';
import { join } from 'path';
import {
  applyNarrativePilotReviewsV1,
  blindNarrativeReviewPacketV1,
  changedNarrativePilotComponentsV1,
  createFrozenNarrativePilotArtifactV1,
  evidenceNarrativeReviewPacketV1,
  NarrativePilotArtifactV1,
  NarrativePilotFreezeManifestV1,
  NarrativePilotHumanReviewV1,
  NarrativeScriptRequestV1,
  narrativePilotFingerprintsV1,
  replayNarrativePilotArtifactV1,
  validateNarrativeScriptRequestV1,
  validateNarrativeScriptsV1,
} from './NarrativePilotV1';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';

const ROUTE_FIXTURE = join(
  __dirname, '..', '..', '..', 'fixtures', 'editorial-v7', 'paris-history-en-120.json'
);
const PILOT_FIXTURE = join(
  __dirname, '..', '..', '..', 'fixtures', 'narrative-pilot-v1', 'paris-premium-es.response.json'
);

function routeFixture(): EditorialWorkbenchV7 {
  return JSON.parse(readFileSync(ROUTE_FIXTURE, 'utf8')) as EditorialWorkbenchV7;
}

function pilotFixture(): NarrativePilotArtifactV1 {
  const manifest = JSON.parse(readFileSync(
    join(__dirname, '..', '..', '..', 'fixtures', 'narrative-pilot-v1', 'paris-premium-es.manifest.json'),
    'utf8'
  )) as NarrativePilotFreezeManifestV1;
  return createFrozenNarrativePilotArtifactV1(
    buildParisNarrativeScriptRequestV1(routeFixture()),
    JSON.parse(readFileSync(PILOT_FIXTURE, 'utf8')),
    manifest
  );
}

function review(reviewerId: string, wouldPay = true): NarrativePilotHumanReviewV1 {
  return {
    reviewerId,
    blind: {
      wouldPay,
      scores: {
        curiosity: 4,
        humanTension: 4,
        lookingUtility: 4,
        naturalness: 4,
        progression: 4,
      },
      sceneScores: [
        { sceneId: 'notre-dame', score: 4 },
        { sceneId: 'louvre', score: 4 },
        { sceneId: 'palais-royal', score: 4 },
      ],
    },
    evidenceCheck: { factualErrors: [], misleadingOmissions: [], notes: 'Sin incidencias.' },
  };
}

describe('Paris premium narrative pilot v1', () => {
  it('locks the three requested scenes to their real v7 positions and neighbours', () => {
    const request = buildParisNarrativeScriptRequestV1(routeFixture());

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
    expect(request.routeFingerprint).toBe(routeFixture().snapshot.fingerprints.route);

    const unsupportedLanguage = {
      ...request, language: 'fr-FR',
    } as unknown as NarrativeScriptRequestV1;
    expect(() => validateNarrativeScriptRequestV1(unsupportedLanguage))
      .toThrow('invalid narrative script request metadata');
  });

  it('replays exactly three grounded Spanish scripts of 220 to 260 words', () => {
    const artifact = pilotFixture();
    const request = buildParisNarrativeScriptRequestV1(routeFixture());

    const scripts = validateNarrativeScriptsV1(artifact.scripts, request);
    expect(scripts.map((script) => script.sceneId)).toEqual([
      'notre-dame', 'louvre', 'palais-royal',
    ]);
    expect(scripts.map((script) => script.wordCount)).toEqual(
      expect.arrayContaining([expect.any(Number)])
    );
    expect(scripts.every((script) => script.wordCount >= 220 && script.wordCount <= 260)).toBe(true);
    expect(replayNarrativePilotArtifactV1(artifact, request)).toEqual(artifact);
  });

  it('rejects route mutations, invented evidence, dates, and proper names', () => {
    const artifact = pilotFixture();
    const request = buildParisNarrativeScriptRequestV1(routeFixture());

    const reordered = structuredClone(artifact.scripts);
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    expect(() => validateNarrativeScriptsV1(reordered, request)).toThrow('scene order');
    expect(() => validateNarrativeScriptsV1(artifact.scripts.slice(0, 2), request))
      .toThrow('scene count');
    expect(() => validateNarrativeScriptsV1([...artifact.scripts, artifact.scripts[0]], request))
      .toThrow('scene count');

    const inventedEvidence = structuredClone(artifact.scripts);
    inventedEvidence[0].blocks[0].evidenceFactIds = ['invented-fact'];
    expect(() => validateNarrativeScriptsV1(inventedEvidence, request)).toThrow('invented evidence');

    const inventedDate = structuredClone(artifact.scripts);
    inventedDate[1].blocks[0].text = inventedDate[1].blocks[0].text.replace('1190', '1889');
    expect(() => validateNarrativeScriptsV1(inventedDate, request)).toThrow('unsupported date');

    const inventedPerson = structuredClone(artifact.scripts);
    inventedPerson[1].blocks[0].text = inventedPerson[1].blocks[0].text
      .replace('Philippe Auguste', 'general Napoleón');
    expect(() => validateNarrativeScriptsV1(inventedPerson, request)).toThrow('unsupported proper name');

    const inventedEvent = structuredClone(artifact.scripts);
    inventedEvent[1].blocks[0].text = inventedEvent[1].blocks[0].text
      .replace('fortaleza', 'coronación');
    expect(() => validateNarrativeScriptsV1(inventedEvent, request)).toThrow('unsupported event');

    const english = structuredClone(artifact.scripts);
    english[0].blocks[0].text = english[0].blocks[0].text.replace(' la ', ' the ');
    expect(() => validateNarrativeScriptsV1(english, request)).toThrow('not Spanish');
  });

  it('rejects wrong transitions, equivalent openings, repeated phrases, and filler facts', () => {
    const artifact = pilotFixture();
    const request = buildParisNarrativeScriptRequestV1(routeFixture());

    const wrongTransition = structuredClone(artifact.scripts);
    wrongTransition[0].transition.targetSceneId = 'louvre';
    expect(() => validateNarrativeScriptsV1(wrongTransition, request)).toThrow('transition');

    const sameOpening = structuredClone(artifact.scripts);
    sameOpening[1].openingType = sameOpening[0].openingType;
    expect(() => validateNarrativeScriptsV1(sameOpening, request)).toThrow('opening');

    const repeatedPhrase = structuredClone(artifact.scripts);
    repeatedPhrase[1].blocks[0].text = `${repeatedPhrase[0].blocks[0].text} ${repeatedPhrase[1].blocks[0].text}`;
    expect(() => validateNarrativeScriptsV1(repeatedPhrase, request)).toThrow('repeated phrase');

    const filler = structuredClone(artifact.scripts);
    const repeatedFactId = filler[0].blocks[0].evidenceFactIds[0];
    filler[0].blocks.forEach((block) => { block.evidenceFactIds = [repeatedFactId]; });
    expect(() => validateNarrativeScriptsV1(filler, request)).toThrow('filler');

    const noLook = structuredClone(artifact.scripts);
    noLook[1].blocks[1].text = noLook[1].blocks[1].text.replace('Observa', 'Piensa');
    expect(() => validateNarrativeScriptsV1(noLook, request)).toThrow('visual instruction');
  });

  it('invalidates only the changed route, evidence, prompt, model, or text layer', () => {
    const artifact = pilotFixture();
    const request = buildParisNarrativeScriptRequestV1(routeFixture());
    const unchanged = narrativePilotFingerprintsV1(
      request, artifact.scripts, artifact.fingerprints.prompt, artifact.fingerprints.model
    );
    expect(changedNarrativePilotComponentsV1(artifact.fingerprints, unchanged)).toEqual([]);

    const changedRoute = structuredClone(request);
    changedRoute.routeFingerprint = 'changed-route';
    expect(changedNarrativePilotComponentsV1(
      artifact.fingerprints,
      narrativePilotFingerprintsV1(
        changedRoute, artifact.scripts, artifact.fingerprints.prompt, artifact.fingerprints.model
      )
    )).toEqual(['route']);

    const changedEvidence = structuredClone(request);
    changedEvidence.scenes[0].evidenceFacts[0].excerpt += ' Cambio.';
    changedEvidence.scenes[0].evidenceFacts[0].fingerprint = 'changed-evidence';
    expect(changedNarrativePilotComponentsV1(
      artifact.fingerprints,
      narrativePilotFingerprintsV1(
        changedEvidence, artifact.scripts, artifact.fingerprints.prompt, artifact.fingerprints.model
      )
    )).toEqual(['evidence']);

    expect(changedNarrativePilotComponentsV1(artifact.fingerprints, {
      ...artifact.fingerprints, prompt: 'changed-prompt',
    })).toEqual(['prompt']);
    expect(changedNarrativePilotComponentsV1(artifact.fingerprints, {
      ...artifact.fingerprints, model: 'changed-model',
    })).toEqual(['model']);
    expect(changedNarrativePilotComponentsV1(artifact.fingerprints, {
      ...artifact.fingerprints, text: 'changed-text',
    })).toEqual(['text']);
  });

  it('separates blind text review from the later evidence check', () => {
    const artifact = pilotFixture();
    const blind = blindNarrativeReviewPacketV1(artifact);
    const evidence = evidenceNarrativeReviewPacketV1(artifact);

    expect(JSON.stringify(blind)).not.toMatch(/source|model|prompt|fingerprint|evidence/i);
    expect(blind.scripts).toHaveLength(3);
    expect(evidence.scenes.every((scene) => scene.evidenceFacts.length === 4)).toBe(true);
  });

  it('approves only a passing three-reviewer gate and otherwise names one revision layer', () => {
    const artifact = pilotFixture();
    const approved = applyNarrativePilotReviewsV1(
      artifact, [review('reviewer-a'), review('reviewer-b'), review('reviewer-c')]
    );
    expect(approved).toMatchObject({ status: 'approved', nextRevisionLayer: null });

    const failedReviews = [review('reviewer-a', false), review('reviewer-b', false), review('reviewer-c')];
    expect(() => applyNarrativePilotReviewsV1(artifact, failedReviews)).toThrow('revision layer');
    const failed = applyNarrativePilotReviewsV1(artifact, failedReviews, 'style');
    expect(failed).toMatchObject({ status: 'review_required', nextRevisionLayer: 'style' });

    const criticalReviews = [review('reviewer-a'), review('reviewer-b'), review('reviewer-c')];
    criticalReviews[0].evidenceCheck.factualErrors.push({
      sceneId: 'louvre', severity: 'critical', detail: 'Fecha incompatible con la fuente.',
    });
    const critical = applyNarrativePilotReviewsV1(artifact, criticalReviews, 'evidence');
    expect(critical).toMatchObject({ status: 'review_required', nextRevisionLayer: 'evidence' });
  });
});
