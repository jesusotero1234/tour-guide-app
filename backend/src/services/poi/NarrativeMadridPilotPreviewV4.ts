import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { buildNarrativeCriticRequestV4 } from './NarrativeCriticV4';
import {
  NarrativeEvidenceCaseV4,
  validateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import { NarrativeBlockKindV1 } from './NarrativePilotV1';
import { NarrativeTourTextV4, narrativeTourTextFingerprintV4 } from './NarrativeProseV4';

export const NARRATIVE_PILOT_PREVIEW_SCHEMA_VERSION_V4 =
  'narrative-pilot-preview-v4' as const;

export interface NarrativePilotPreviewPlaceV4 {
  id: string;
  name: string;
  description: string;
  descriptionSections: Record<NarrativeBlockKindV1, string>;
  observation: string;
  position: number;
  latitude: number;
  longitude: number;
  metadata: {
    narrationMeta: {
      fingerprint: string;
      verifiedRate: 1;
      criticalFailCount: 0;
      sectionsFallbacked: 0;
    };
  };
}

export interface NarrativePilotPreviewV4 {
  schemaVersion: typeof NARRATIVE_PILOT_PREVIEW_SCHEMA_VERSION_V4;
  selectedTextFingerprint: string;
  tour: {
    id: string;
    city: string;
    country: 'España';
    countryCode: 'ES';
    theme: 'history';
    title: string;
    subtitle: string;
    experienceLabel: string;
    promise: string;
    centralQuestion: string;
    language: 'es-ES';
    durationMinutes: 60;
    distanceMeters: number;
    status: 'review';
    introduction: string;
    places: NarrativePilotPreviewPlaceV4[];
  };
  fingerprint: string;
}

function previewFingerprint(
  preview: Omit<NarrativePilotPreviewV4, 'fingerprint'>
): string {
  return editorialFingerprintV7(preview);
}

export function buildNarrativePilotPreviewV4(
  evidence: NarrativeEvidenceCaseV4,
  text: NarrativeTourTextV4
): NarrativePilotPreviewV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  buildNarrativeCriticRequestV4(evidence, buildNarrativeClaimPlanV4(evidence), text);
  const selectedTextFingerprint = narrativeTourTextFingerprintV4(text);
  const content: Omit<NarrativePilotPreviewV4, 'fingerprint'> = {
    schemaVersion: NARRATIVE_PILOT_PREVIEW_SCHEMA_VERSION_V4,
    selectedTextFingerprint,
    tour: {
      id: 'madrid-history-pilot-v4',
      city: 'Madrid',
      country: 'España',
      countryCode: 'ES',
      theme: 'history',
      title: evidence.title,
      subtitle: evidence.subtitle,
      experienceLabel: evidence.experienceLabel,
      promise: evidence.promise,
      centralQuestion: evidence.centralQuestion,
      language: 'es-ES',
      durationMinutes: 60,
      distanceMeters: evidence.route.walkingMeters,
      status: 'review',
      introduction: text.introduction,
      places: evidence.scenes.map((scene, index) => {
        const script = text.scripts[index];
        const descriptionSections = Object.fromEntries(script.blocks.map((block) => [
          block.kind, block.text,
        ])) as Record<NarrativeBlockKindV1, string>;
        const observable = scene.evidenceFacts.find((fact) => fact.role === 'observable');
        if (!observable || observable.visibility.kind !== 'on_site') {
          throw new Error(`narrative pilot preview ${scene.sceneId} lacks an observation cue`);
        }
        return {
          id: `madrid-history-v4-${scene.sceneId}`,
          name: scene.name,
          description: script.blocks.map((block) => block.text).join('\n\n'),
          descriptionSections,
          observation: observable.visibility.cueEs,
          position: index,
          latitude: scene.observationPoint.lat,
          longitude: scene.observationPoint.lng,
          metadata: {
            narrationMeta: {
              fingerprint: editorialFingerprintV7({
                sceneId: scene.sceneId,
                textFingerprint: selectedTextFingerprint,
                descriptionSections,
              }),
              verifiedRate: 1,
              criticalFailCount: 0,
              sectionsFallbacked: 0,
            },
          },
        };
      }),
    },
  };
  return { ...content, fingerprint: previewFingerprint(content) };
}

export function validateNarrativePilotPreviewV4(
  preview: NarrativePilotPreviewV4,
  evidence?: NarrativeEvidenceCaseV4
): NarrativePilotPreviewV4 {
  const { fingerprint, ...content } = preview;
  if (preview.schemaVersion !== NARRATIVE_PILOT_PREVIEW_SCHEMA_VERSION_V4
    || preview.tour.status !== 'review' || preview.tour.durationMinutes !== 60
    || preview.tour.places.length !== 7 || preview.tour.places.some((place, index) => (
      place.position !== index || !place.id || !place.name || !place.description
      || Object.keys(place.descriptionSections).sort().join(',')
        !== ['closing', 'human_conflict', 'interpretation', 'look', 'opening'].join(',')
      || !place.observation || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)
      || place.metadata.narrationMeta.verifiedRate !== 1
      || place.metadata.narrationMeta.criticalFailCount !== 0
      || place.metadata.narrationMeta.sectionsFallbacked !== 0
      || !/^[a-f0-9]{64}$/.test(place.metadata.narrationMeta.fingerprint)
      || 'audioUrl' in place
    ))) {
    throw new Error('narrative pilot preview v4 is invalid');
  }
  if (fingerprint !== previewFingerprint(content)) {
    throw new Error('narrative pilot preview fingerprint changed');
  }
  if (evidence) {
    validateNarrativeEvidenceCaseV4(evidence);
    preview.tour.places.forEach((place, index) => {
      const scene = evidence.scenes[index];
      if (place.name !== scene.name || place.latitude !== scene.observationPoint.lat
        || place.longitude !== scene.observationPoint.lng) {
        throw new Error(`narrative pilot preview ${scene.sceneId} route changed`);
      }
    });
  }
  return preview;
}
