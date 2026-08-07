import { readFileSync } from 'fs';
import { join } from 'path';
import {
  approveCityEditorialProfileV7,
  approveVisitSceneV7,
  CityEditorialProfileV1,
  editorialFingerprintV7,
  OfficialSourceExcerptV1,
  VisitSceneV1,
} from './EditorialProfileV7';
import { optimizeEditorialRouteV7 } from './EditorialRouteOptimizerV7';
import { StoryModulePlanV1 } from './EditorialStoryPlanV7';
import {
  walkingMatrixCandidateFingerprintV4,
  WalkingMatrixSnapshotV4,
} from './EditorialWalkingMatrixV4';
import {
  changedEditorialComponentsV7,
  createEditorialComponentFingerprintsV7,
  replayEditorialSnapshotV7,
  runEditorialWorkflowV7,
} from './EditorialWorkflowV7';

const source: OfficialSourceExcerptV1 = {
  sourceId: 'source', url: 'https://www.esmadrid.com/', title: 'Tourism Madrid',
  capturedAt: '2026-08-07T00:00:00.000Z', excerpt: 'Official Madrid tourism evidence.',
  contentFingerprint: editorialFingerprintV7('Official Madrid tourism evidence.'),
};

function draftScenes(): VisitSceneV1[] {
  return ['palace', 'villa', 'sol', 'alcala'].map((sceneId, index) => ({
    schemaVersion: 'visit-scene-v1', sceneId, status: 'review_required',
    primaryCanonicalId: `Q${index + 1}`, memberCanonicalIds: [`Q${index + 1}`],
    name: sceneId, observationPoint: { lat: 40.4 + index / 100, lng: -3.7 },
    facts: [{
      factId: `${sceneId}-fact`, ownerCanonicalId: `Q${index + 1}`, sourceId: source.sourceId,
      role: 'distinctive', value: `${sceneId} contributes a different chapter to the route.`,
    }],
    sourceIds: [source.sourceId], conflictsWithSceneIds: [], review: null,
  }));
}

function draftProfile(scenes: VisitSceneV1[], requiresStreetAudit = true): CityEditorialProfileV1 {
  const chapters = scenes.map((scene) => ({
    chapterId: `chapter-${scene.sceneId}`, title: scene.name, carrierSceneIds: [scene.sceneId],
  }));
  return {
    schemaVersion: 'city-editorial-profile-v1', cityKey: 'madrid', theme: 'history',
    productPromise: 'From historic town to modern capital', requestedDurationMinutes: 30,
    status: 'review_required', mustVisitCanonicalIds: [scenes[0].primaryCanonicalId],
    chapters, arcChapterIds: chapters.map((chapter) => chapter.chapterId),
    approvedSceneIds: scenes.map((scene) => scene.sceneId), sources: [source], overrides: [],
    requiresStreetAudit, review: null,
  };
}

function approvedProduct(): { profile: CityEditorialProfileV1; scenes: VisitSceneV1[] } {
  const scenes = draftScenes().map((scene) => approveVisitSceneV7(scene, {
    author: 'editor@example.com', reviewedAt: '2026-08-07T10:00:00.000Z',
    reason: `Approved scene ${scene.sceneId}.`, sourceIds: [source.sourceId],
  }));
  const profile = approveCityEditorialProfileV7(draftProfile(scenes), {
    author: 'editor@example.com', reviewedAt: '2026-08-07T10:30:00.000Z',
    reason: 'Approved product profile after blind review.', sourceIds: [source.sourceId],
  });
  return { profile, scenes };
}

function matrix(scenes: VisitSceneV1[], reachable = true): WalkingMatrixSnapshotV4 {
  const sites = scenes.map((scene) => ({
    siteId: scene.sceneId, lat: scene.observationPoint.lat, lng: scene.observationPoint.lng,
  }));
  return {
    schemaVersion: 'walking-matrix-v1',
    provider: { id: 'fossgis-osrm-foot', capturedAt: '2026-08-07T00:00:00.000Z' },
    candidateFingerprint: walkingMatrixCandidateFingerprintV4(sites), sites,
    legs: sites.map((_, from) => sites.map((__, to) => {
      if (from === to) return { meters: 0, seconds: 0, reachable: true };
      return reachable
        ? { meters: 200 + Math.abs(from - to), seconds: 160 + Math.abs(from - to), reachable: true }
        : { meters: null, seconds: null, reachable: false };
    })),
  };
}

function plan(sceneIds: string[]): StoryModulePlanV1 {
  return {
    schemaVersion: 'story-module-plan-v1', routeSceneIds: sceneIds,
    promise: 'Follow Madrid from historic town to modern capital.',
    centralQuestion: 'How did Madrid become a capital?',
    scenes: sceneIds.map((sceneId) => ({
      sceneId,
      main: {
        moduleId: `${sceneId}-main`, title: sceneId, contribution: `Contribution of ${sceneId}`,
        targetWords: 180, primaryFactId: `${sceneId}-fact`, evidenceFactIds: [`${sceneId}-fact`],
      },
      deepDives: [], observation: {
        instruction: `Look at the visible feature of ${sceneId}.`, seconds: 45,
        evidenceFactIds: [`${sceneId}-fact`],
      },
    })),
  };
}

describe('editorial workflow v7 publication gates', () => {
  it('returns draft_only for an unreviewed product even when its route and plan are valid', async () => {
    const scenes = draftScenes();
    const profile = draftProfile(scenes, false);
    const result = await runEditorialWorkflowV7({
      profile, scenes, matrix: matrix(scenes), language: 'es',
      generateStoryPlan: async (request) => JSON.stringify(plan(request.routeSceneIds)),
    });

    expect(result.status).toBe('draft_only');
    expect(result.route?.sceneIds).toEqual(['palace', 'villa', 'sol', 'alcala']);
  });

  it('never calls the narrative planner when hard route coverage is infeasible', async () => {
    const { profile, scenes } = approvedProduct();
    let calls = 0;
    const result = await runEditorialWorkflowV7({
      profile, scenes, matrix: matrix(scenes, false), language: 'es',
      generateStoryPlan: async () => { calls += 1; return '{}'; },
    });

    expect(result.status).toBe('infeasible');
    expect(calls).toBe(0);
    expect(result.storyPlanCall).toBeNull();
  });

  it('turns semantic model failure into review_required without a legacy fallback', async () => {
    const { profile, scenes } = approvedProduct();
    const result = await runEditorialWorkflowV7({
      profile, scenes, matrix: matrix(scenes), language: 'es',
      generateStoryPlan: async (request) => JSON.stringify({
        ...plan(request.routeSceneIds), routeSceneIds: [...request.routeSceneIds].reverse(),
      }),
    });

    expect(result).toMatchObject({ status: 'review_required', reason: 'story_plan_semantic_error' });
    expect(result.storyPlanCall?.attempts).toHaveLength(1);

    const implementation = readFileSync(join(__dirname, 'EditorialWorkflowV7.ts'), 'utf8')
      + readFileSync(join(__dirname, 'EditorialRouteOptimizerV7.ts'), 'utf8');
    expect(implementation).not.toMatch(/EditorialSelectionWorkflowV5|EditorialEvaluationManifest|fixtures\/oracle|greedy|jury/i);
  });

  it('returns verified only with approved profile, scenes, route, street audit, and real audio', async () => {
    const { profile, scenes } = approvedProduct();
    const walking = matrix(scenes);
    const optimization = optimizeEditorialRouteV7(profile, scenes, walking);
    expect(optimization.status).toBe('selected');
    if (optimization.status !== 'selected') return;
    const routeFingerprint = editorialFingerprintV7(optimization.route);
    const story = plan(optimization.route.sceneIds);
    const result = await runEditorialWorkflowV7({
      profile, scenes, matrix: walking, language: 'es',
      generateStoryPlan: async () => JSON.stringify(story),
      audioByModuleId: Object.fromEntries(story.scenes.map((item) => [
        item.main.moduleId, { seconds: 220, fingerprint: `audio-${item.sceneId}` },
      ])),
      routeReview: {
        author: 'route-editor@example.com', reviewedAt: '2026-08-07T11:00:00.000Z',
        reason: 'Approved route geometry and editorial resolution.', sourceIds: [source.sourceId],
        approvedFingerprint: routeFingerprint,
      },
      streetAudit: {
        status: 'approved', auditor: 'auditor@example.com', auditedAt: '2026-08-07T12:00:00.000Z',
        reason: 'Crossings, surfaces, steps, accessibility and comfort checked in person.',
        routeFingerprint,
      },
      createdAt: '2026-08-07T13:00:00.000Z',
    });

    expect(result.status).toBe('verified');
    expect(result.duration?.narrationSource).toBe('audio_actual');
    expect(result.snapshot.status).toBe('verified');
    expect(replayEditorialSnapshotV7(result.snapshot)).toEqual(result.snapshot);
    const tampered = structuredClone(result.snapshot);
    tampered.storyPlanCall!.attempts[0].rawOutput = '{}';
    expect(() => replayEditorialSnapshotV7(tampered)).toThrow('raw story output');
  });

  it('keeps an otherwise valid route in review when a required human gate is absent', async () => {
    const { profile, scenes } = approvedProduct();
    const result = await runEditorialWorkflowV7({
      profile, scenes, matrix: matrix(scenes), language: 'es',
      generateStoryPlan: async (request) => JSON.stringify(plan(request.routeSceneIds)),
    });

    expect(result).toMatchObject({ status: 'review_required', reason: 'real_audio_required' });
  });
});

describe('editorial workflow v7 fingerprints', () => {
  it('reports only the changed raw component for profile, matrix, text, or audio changes', () => {
    const { profile, scenes } = approvedProduct();
    const walking = matrix(scenes);
    const route = optimizeEditorialRouteV7(profile, scenes, walking);
    expect(route.status).toBe('selected');
    if (route.status !== 'selected') return;
    const story = plan(route.route.sceneIds);
    const audio = Object.fromEntries(story.scenes.map((item) => [
      item.main.moduleId, { seconds: 180, fingerprint: `audio-${item.sceneId}` },
    ]));
    const baseline = createEditorialComponentFingerprintsV7({
      profile, scenes, matrix: walking, route: route.route, plan: story, audioByModuleId: audio,
    });

    expect(changedEditorialComponentsV7(baseline, createEditorialComponentFingerprintsV7({
      profile: { ...profile, productPromise: `${profile.productPromise}!` },
      scenes, matrix: walking, route: route.route, plan: story, audioByModuleId: audio,
    }))).toEqual(['profile']);
    expect(changedEditorialComponentsV7(baseline, createEditorialComponentFingerprintsV7({
      profile, scenes, matrix: { ...walking, legs: walking.legs.map((row, index) => (
        index === 0 ? row.map((leg, column) => column === 1 ? { ...leg, meters: 999 } : leg) : row
      )) }, route: route.route, plan: story, audioByModuleId: audio,
    }))).toEqual(['matrix']);
    expect(changedEditorialComponentsV7(baseline, createEditorialComponentFingerprintsV7({
      profile, scenes, matrix: walking, route: route.route,
      plan: { ...story, promise: `${story.promise}!` }, audioByModuleId: audio,
    }))).toEqual(['plan']);
    expect(changedEditorialComponentsV7(baseline, createEditorialComponentFingerprintsV7({
      profile, scenes, matrix: walking, route: route.route, plan: story,
      audioByModuleId: { ...audio, 'palace-main': { seconds: 181, fingerprint: 'changed' } },
    }))).toEqual(['audio']);
  });
});
