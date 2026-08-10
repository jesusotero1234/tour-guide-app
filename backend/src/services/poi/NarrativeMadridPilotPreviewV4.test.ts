import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import {
  buildNarrativePilotPreviewV4,
  validateNarrativePilotPreviewV4,
} from './NarrativeMadridPilotPreviewV4';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

function text(): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4', introduction: 'Introducción validada para el piloto.',
    scripts: evidence.scenes.map((scene, index) => ({
      sceneId: scene.sceneId, name: scene.name,
      blocks: plan.scenes[index].blocks.map((block) => ({
        blockId: block.blockId, kind: block.kind,
        text: `Narración validada de ${scene.name} para ${block.kind}.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[index].transition, bodyWordCount: 170,
    })),
    totalWordCount: 1250, durationSeconds: 3600, durationMinutes: 60,
  };
}

describe('NarrativeMadridPilotPreviewV4', () => {
  it('serializes seven standard places in exact V7 order without audio or publish state', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const preview = validateNarrativePilotPreviewV4(
      buildNarrativePilotPreviewV4(evidence, text()),
      evidence
    );

    expect(preview.tour).toMatchObject({
      title: 'Madrid: de villa a capital',
      durationMinutes: 60,
      status: 'review',
    });
    expect(preview.tour.places.map((place) => place.name))
      .toEqual(evidence.scenes.map((scene) => scene.name));
    expect(preview.tour.places.map((place) => [place.latitude, place.longitude]))
      .toEqual(evidence.scenes.map((scene) => [
        scene.observationPoint.lat, scene.observationPoint.lng,
      ]));
    expect(preview.tour.places.every((place, index) => (
      place.position === index
      && Object.keys(place.descriptionSections).length === 5
      && !('audioUrl' in place)
      && place.metadata.narrationMeta.verifiedRate === 1
      && place.metadata.narrationMeta.criticalFailCount === 0
      && place.metadata.narrationMeta.sectionsFallbacked === 0
    ))).toBe(true);
  });

  it('rejects changed preview content or fingerprint', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const preview = buildNarrativePilotPreviewV4(evidence, text());
    preview.tour.durationMinutes = 120 as 60;
    expect(() => validateNarrativePilotPreviewV4(preview, evidence)).toThrow();
  });
});
