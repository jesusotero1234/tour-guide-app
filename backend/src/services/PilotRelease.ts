import { getCityNames } from '../domain/cityNames';
import type { Tour } from '../domain/entities/Tour';
import type { TourAudioState } from './TourAudioService';
import type { WalkingRouteData } from './WalkingRouteService';
import { sha256 } from './AudioProvenance';
import { SOURCE_POLICY_VERSION, sourceUse } from './poi/SourceUsePolicy';
import { completeCueManifest } from './TourCues';
import { flexibleOrderEnabled } from '../config/pilot';

export interface PilotRelease {
  version: 1;
  approvalMode?: 'owner-authorized';
  authorizationReference?: string;
  status: 'approved' | 'withdrawn';
  reviewedBy: string;
  reviewedAt: string;
  fingerprint: string;
  sourcePolicy: string;
  scriptLicense: 'CC BY-SA 4.0';
  changes: string;
  checks: { text: boolean; audio: boolean; route: boolean; rights: boolean };
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}

export function validWalkingRoute(value: unknown): value is WalkingRouteData {
  const route = value as WalkingRouteData | null;
  return !!route && route.provider === 'fossgis-osrm-foot' && route.geometry?.type === 'LineString'
    && Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length >= 2
    && route.geometry.coordinates.every(p => Array.isArray(p) && p.length === 2
      && Number.isFinite(p[0]) && Math.abs(p[0]) <= 180 && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90)
    && Number.isFinite(route.distanceMeters) && route.distanceMeters >= 0
    && Number.isFinite(route.durationSeconds) && route.durationSeconds >= 0;
}

export function ownerAuthorized(tour: Tour): boolean {
  const release = tour.metadata?.pilotRelease;
  return release?.approvalMode === 'owner-authorized' && !!release.authorizationReference?.trim();
}

export function validatePilotMaterial(tour: Tour, audio: TourAudioState): void {
  if (tour.status !== 'published' || !tour.introduction?.trim() || tour.places.length < 2 || tour.places.length > 40
    || !validWalkingRoute(tour.metadata?.pilotWalkingRoute)) throw new Error('PILOT_MATERIAL_INCOMPLETE');
  if (tour.metadata?.codexAuthor?.legs.some(leg => leg.type === 'self_transfer')) throw new Error('PILOT_EXTERNAL_TRANSFER');
  // A tour that declares itself order-flexible must carry every link clip and its walking legs. The files and the legs rows
  // are verified where they are served (and by `verify` before publishing): admission runs for every tour on every catalogue
  // request and must not query for them.
  if (flexibleOrderEnabled() && tour.metadata?.orderFlexible === true && (!completeCueManifest(tour.metadata.cueManifest, tour.places.map(p => p.id))
    || !/^[a-f0-9]{64}$/.test(tour.metadata.walkingLegsSha256 ?? ''))) throw new Error('PILOT_ORDER_INCOMPLETE');
  if (audio.status !== 'completed' || tour.places.some(place => !audio.audioVersions?.[place.id] || !audio.audioUrls[place.id])) throw new Error('PILOT_AUDIO_INCOMPLETE');
  for (const place of tour.places) {
    const pictures = place.metadata?.tourImages;
    if (pictures?.images.length) {
      const safeUrl = (raw: string, host: string, path: RegExp) => {
        try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname === host && path.test(u.pathname); }
        catch { return false; }
      };
      if (pictures.version !== 1 || pictures.status !== 'ready' || pictures.sourceText !== place.description
        || pictures.images.some(p => ![p.author,p.attribution,p.license,p.changes,p.alt].every(v => typeof v === 'string' && v.trim())
          || !(safeUrl(p.url, 'upload.wikimedia.org', /^\//)
            || safeUrl(p.url, 'thumb.wikimedia.org', /^\/wikipedia\/commons\/thumb\//))
          || !safeUrl(p.sourceUrl, 'commons.wikimedia.org', /^\/wiki\/File:/)
          || !safeUrl(p.licenseUrl, 'creativecommons.org', /^\/(licenses|publicdomain)\//))) throw new Error('PILOT_IMAGE_CREDITS_PENDING');
    }
    const credits = place.metadata?.sourceCredits;
    if (!place.description.trim() || !credits || credits.version !== SOURCE_POLICY_VERSION || !credits.items.length) throw new Error('PILOT_SOURCES_INCOMPLETE');
    for (const credit of credits.items) {
      const use = sourceUse(credit.url);
      const ownerResearch = ownerAuthorized(tour) && credit.status === 'pending' && use.status === 'pending'
        && (() => { try { const u = new URL(credit.url); return u.protocol === 'https:' && !u.username && !u.password && !u.port; } catch { return false; } })();
      if ((!ownerResearch && (credit.status !== 'permitted' || use.status !== 'permitted')) || credit.license !== use.license
        || credit.licenseUrl !== use.licenseUrl || !credit.attribution.trim() || !credit.title.trim()
        || !Number.isFinite(Date.parse(credit.capturedAt))) throw new Error('PILOT_SOURCE_USE_PENDING');
    }
  }
}

export function pilotFingerprint(tour: Tour, audio: TourAudioState): string {
  return sha256(JSON.stringify(ordered({
    version: 1, sourcePolicy: SOURCE_POLICY_VERSION, tourId: tour.id, blueprintId: tour.blueprintId,
    blueprintFingerprint: tour.metadata?.codexAuthor?.blueprintFingerprint,
    city: tour.city, country: tour.country, countryCode: tour.countryCode, language: tour.language,
    theme: tour.theme, durationMinutes: tour.durationMinutes, introduction: tour.introduction,
    ...(tour.metadata?.catalogTitle ? { catalogTitle: tour.metadata.catalogTitle } : {}),
    // Fields added after the first publication enter the hash only when they have a value. Writing them as null or
    // undefined would change the fingerprint of every tour already published, and the catalogue would empty out.
    ...(tour.introductionSpokenText ? { introductionSpokenText: tour.introductionSpokenText } : {}),
    ...(tour.metadata?.orderFlexible === true ? { orderFlexible: true } : {}),
    ...(tour.metadata?.cueManifest?.length ? { cues: [...tour.metadata.cueManifest].sort((a, b) => (a.kind + (a.placeId ?? '')).localeCompare(b.kind + (b.placeId ?? ''))) } : {}),
    ...(tour.metadata?.walkingLegsSha256 ? { walkingLegsSha256: tour.metadata.walkingLegsSha256 } : {}),
    ...(audio.introduction ? { introductionAudio: { version: audio.introduction.version, text: audio.introduction.text } } : {}),
    geometry: tour.metadata?.pilotWalkingRoute,
    places: [...tour.places].sort((a, b) => a.position - b.position).map(place => ({
      id: place.id, name: place.name, nameInTourLanguage: place.nameInTourLanguage, position: place.position,
      description: place.description, latitude: place.latitude, longitude: place.longitude,
      ...(place.spokenText ? { spokenText: place.spokenText } : {}),
      sources: place.metadata?.sourceCredits, images: place.metadata?.tourImages,
      audioVersion: audio.audioVersions?.[place.id], transcript: audio.transcripts?.[place.id],
    })),
  })));
}

export function admittedToPilot(tour: Tour, audio: TourAudioState): boolean {
  try {
    validatePilotMaterial(tour, audio);
    const review = tour.metadata?.pilotRelease;
    return !!review && review.version === 1 && review.status === 'approved'
      && review.sourcePolicy === SOURCE_POLICY_VERSION && review.scriptLicense === 'CC BY-SA 4.0'
      && !!review.reviewedBy?.trim() && !!review.changes?.trim()
      && Number.isFinite(Date.parse(review.reviewedAt)) && Date.parse(review.reviewedAt) <= Date.now()
      && (ownerAuthorized(tour) || ['text', 'audio', 'route', 'rights'].every(key => review.checks?.[key as keyof PilotRelease['checks']] === true))
      && review.fingerprint === pilotFingerprint(tour, audio);
  } catch { return false; }
}

/** Public DTO: internal review identities, captures and model prompts never cross this boundary. */
export function presentPilotTour(tour: Tour, audio: TourAudioState, localReview = false) {
  const release = tour.metadata?.pilotRelease;
  return {
    id: tour.id, city: tour.city, country: tour.country, countryCode: tour.countryCode,
    cityNames: getCityNames(tour.city, tour.countryCode),
    theme: tour.theme, language: tour.language, durationMinutes: tour.durationMinutes,
    ...(tour.metadata?.catalogTitle ? { title: tour.metadata.catalogTitle } : {}),
    ...(tour.metadata?.orderFlexible === true && flexibleOrderEnabled() ? { orderFlexible: true } : {}),
    status: tour.status, introduction: tour.introduction, createdAt: tour.createdAt, updatedAt: tour.updatedAt,
    ...(audio.introduction ? { introductionAudio: audio.introduction } : {}),
    pilot: localReview ? undefined : { approvalMode: release!.approvalMode ?? 'human-reviewed', reviewedAt: release!.reviewedAt, version: release!.fingerprint,
      scriptLicense: release!.scriptLicense, changes: release!.changes },
    localReview,
    places: tour.places.map(place => ({
      id: place.id, tourId: tour.id, name: place.name, nameInTourLanguage: place.nameInTourLanguage,
      description: place.description, position: place.position, latitude: place.latitude, longitude: place.longitude,
      coordinates: { lat: place.latitude, lng: place.longitude }, audioUrl: audio.audioUrls[place.id],
      audioVersion: audio.audioVersions?.[place.id], imageUrl: '',
      metadata: {
        sourceCredits: place.metadata?.sourceCredits ? {
          version: place.metadata.sourceCredits.version, items: place.metadata.sourceCredits.items.map(c => ({
            sourceId: c.sourceId, title: c.title, url: c.url, attribution: c.attribution, capturedAt: c.capturedAt,
            revisionUrl: c.revisionUrl, license: c.license, licenseUrl: c.licenseUrl, status: c.status, usage: c.usage,
          }))
        } : { version: undefined, items: [] },
        tourImages: place.metadata?.tourImages ? {
          version: place.metadata.tourImages.version, sourceText: place.metadata.tourImages.sourceText,
          status: place.metadata.tourImages.status, images: place.metadata.tourImages.images.map(p => ({
            id: p.id, role: p.role, paragraphId: p.paragraphId, paragraphIndex: p.paragraphIndex,
            paragraphText: p.paragraphText, caption: p.caption, alt: p.alt, url: p.url,
            sourceUrl: p.sourceUrl, sourceTitle: p.sourceTitle, author: p.author, license: p.license,
            licenseUrl: p.licenseUrl, attribution: p.attribution, changes: p.changes,
            width: p.width, height: p.height, entityId: p.entityId, identityEvidence: p.identityEvidence, verifiedAt: p.verifiedAt,
          })),
        } : undefined,
      },
    })),
    route: tour.places.map(place => ({ lat: place.latitude, lng: place.longitude })),
  };
}
