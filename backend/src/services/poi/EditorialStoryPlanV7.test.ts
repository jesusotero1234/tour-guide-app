import { VisitSceneV1 } from './EditorialProfileV7';
import {
  buildStoryPlanRequestV7,
  calculateEditorialDurationV7,
  requestStoryPlanV7,
  STORY_PLAN_INPUT_CHARACTER_LIMIT_V7,
  STORY_PLAN_SCHEMA_CHARACTER_LIMIT_V7,
  storyPlanResponseSchemaV7,
  StoryModulePlanV1,
  validateStoryModulePlanV1,
} from './EditorialStoryPlanV7';

function scenes(count = 5): VisitSceneV1[] {
  return Array.from({ length: count }, (_, index) => {
    const sceneId = `scene-${index + 1}`;
    const canonicalId = `Q${index + 1}`;
    return {
      schemaVersion: 'visit-scene-v1', sceneId, status: 'review_required',
      primaryCanonicalId: canonicalId, memberCanonicalIds: [canonicalId], name: `Scene ${index + 1}`,
      observationPoint: { lat: 40.4 + index / 100, lng: -3.7 },
      facts: [
        { factId: `${sceneId}-main`, ownerCanonicalId: canonicalId, sourceId: 'source', role: 'historical_context', value: `Historical fact for ${sceneId}.` },
        { factId: `${sceneId}-deep`, ownerCanonicalId: canonicalId, sourceId: 'source', role: 'distinctive', value: `Distinctive fact for ${sceneId}.` },
      ],
      sourceIds: ['source'], conflictsWithSceneIds: [], review: null,
    } satisfies VisitSceneV1;
  });
}

function plan(routeSceneIds: string[]): StoryModulePlanV1 {
  return {
    schemaVersion: 'story-module-plan-v1', routeSceneIds,
    promise: 'Follow Madrid from historic town to modern capital.',
    centralQuestion: 'How did Madrid become a modern capital?',
    scenes: routeSceneIds.map((sceneId, index) => ({
      sceneId,
      main: {
        moduleId: `${sceneId}-module-main`, title: `Main ${index + 1}`,
        contribution: `Contribution ${index + 1}`, targetWords: 180,
        primaryFactId: `${sceneId}-main`, evidenceFactIds: [`${sceneId}-main`],
      },
      deepDives: [],
      observation: {
        instruction: `Look directly at the visible feature in ${sceneId}.`,
        seconds: 45, evidenceFactIds: [`${sceneId}-main`],
      },
    })),
  };
}

describe('story plan v7 boundary', () => {
  it('sends only the fixed four-to-eight scene route and stays within both character limits', () => {
    const candidates = scenes();
    const request = buildStoryPlanRequestV7(
      ['scene-1', 'scene-2', 'scene-3', 'scene-4'], candidates, 'es'
    );

    expect(request.scenes.map((scene) => scene.sceneId)).toEqual([
      'scene-1', 'scene-2', 'scene-3', 'scene-4',
    ]);
    expect(JSON.stringify(request)).not.toContain('scene-5');
    expect(JSON.stringify(request).length).toBeLessThanOrEqual(STORY_PLAN_INPUT_CHARACTER_LIMIT_V7);
    expect(JSON.stringify(storyPlanResponseSchemaV7()).length)
      .toBeLessThanOrEqual(STORY_PLAN_SCHEMA_CHARACTER_LIMIT_V7);
  });

  it('rejects scene changes, invented facts, and repeated primary evidence', () => {
    const candidates = scenes(4);
    const request = buildStoryPlanRequestV7(
      candidates.map((scene) => scene.sceneId), candidates, 'es'
    );
    const valid = plan(request.routeSceneIds);
    expect(validateStoryModulePlanV1(valid, request)).toEqual(valid);

    expect(() => validateStoryModulePlanV1({
      ...valid, routeSceneIds: [...valid.routeSceneIds].reverse(),
    }, request)).toThrow('route order');

    const repeated = structuredClone(valid);
    repeated.scenes[0].deepDives.push({
      moduleId: 'repeated', title: 'Repeated story', contribution: 'Disguised repetition',
      targetWords: 200, primaryFactId: 'scene-1-main', evidenceFactIds: ['scene-1-main'],
    });
    expect(() => validateStoryModulePlanV1(repeated, request)).toThrow('primary fact');

    const invented = structuredClone(valid);
    invented.scenes[0].main.primaryFactId = 'invented';
    invented.scenes[0].main.evidenceFactIds = ['invented'];
    expect(() => validateStoryModulePlanV1(invented, request)).toThrow('invented evidence');
  });

  it('retries transport or malformed JSON once but never retries semantic violations', async () => {
    const candidates = scenes(4);
    const request = buildStoryPlanRequestV7(
      candidates.map((scene) => scene.sceneId), candidates, 'es'
    );
    const valid = plan(request.routeSceneIds);
    let malformedCalls = 0;
    const recovered = await requestStoryPlanV7(request, async () => {
      malformedCalls += 1;
      return malformedCalls === 1 ? '{bad json' : JSON.stringify(valid);
    });
    let semanticCalls = 0;
    const semantic = await requestStoryPlanV7(request, async () => {
      semanticCalls += 1;
      return JSON.stringify({ ...valid, routeSceneIds: [...valid.routeSceneIds].reverse() });
    });

    expect(recovered.status).toBe('valid');
    expect(recovered.attempts).toHaveLength(2);
    expect(semantic.status).toBe('semantic_error');
    expect(semanticCalls).toBe(1);
  });
});

describe('real duration v7', () => {
  it('uses walking, narration words, and explicit observations without stop dwell or hidden buffers', () => {
    const story = plan(['scene-1', 'scene-2', 'scene-3', 'scene-4']);
    const estimated = calculateEditorialDurationV7({
      requestedDurationMinutes: 30,
      walkingSeconds: 600,
      plan: story,
      wordsPerMinute: 120,
    });
    const actual = calculateEditorialDurationV7({
      requestedDurationMinutes: 30,
      walkingSeconds: 600,
      plan: story,
      audioByModuleId: Object.fromEntries(story.scenes.map((item) => [
        item.main.moduleId, { seconds: 100, fingerprint: `audio-${item.sceneId}` },
      ])),
    });

    expect(estimated).toMatchObject({
      walkingSeconds: 600, narrationSeconds: 360, observationSeconds: 180,
      totalSeconds: 1140, totalMinutes: 19, narrationSource: 'word_estimate',
    });
    expect(actual).toMatchObject({
      walkingSeconds: 600, narrationSeconds: 400, observationSeconds: 180,
      totalSeconds: 1180, totalMinutes: 19.67, narrationSource: 'audio_actual',
    });
  });
});
