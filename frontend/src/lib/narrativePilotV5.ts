export const PILOT_BLOCK_KINDS = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
] as const;

export type PilotBlockKind = typeof PILOT_BLOCK_KINDS[number];

export interface NarrativePilotPlaceV5 {
  id: string;
  name: string;
  description: string;
  descriptionSections: Record<PilotBlockKind, string>;
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

export interface NarrativePilotPreviewV5 {
  schemaVersion: 'narrative-pilot-preview-v5';
  selectedTextFingerprint: string;
  tour: {
    id: string;
    city: string;
    country: string;
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
    places: NarrativePilotPlaceV5[];
  };
  fingerprint: string;
}

export interface NarrativePilotPreviewDocumentV5 {
  schemaVersion: 'narrative-pilot-freeze-document-v5';
  kind: 'preview';
  freezeLinks: {
    qualification: string;
    artifact: string;
    preview: string;
    manifest: string;
  };
  payload: NarrativePilotPreviewV5;
}
