import { getCityNames } from '../domain/cityNames';
import type { Tour } from '../domain/entities/Tour';
import type { TourImage } from '../domain/entities/TourImage';
import type { TourAudioState } from './TourAudioService';

const INTRODUCTION_LIMIT = 320;
const COMMONS_FILE = '/wiki/File:';

/** A URL the card may load: https, no credentials or port, on one of the allowed hosts. */
function allowedUrl(value: string, hosts: string[], pathPrefix?: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.port === '' && hosts.includes(url.hostname)
      && (!pathPrefix || url.pathname.startsWith(pathPrefix));
  } catch { return false; }
}

/**
 * The same checks the browser makes before it shows a photo (frontend `isVerifiedImage`): the text it was chosen for is still the stop's
 * text, and every credit and every link is present and on a Wikimedia or Creative Commons host.
 */
function verifiedImage(image: TourImage, paragraphs: string[]): boolean {
  if (!image || typeof image !== 'object') return false;
  if (!Number.isInteger(image.paragraphIndex) || image.paragraphIndex < 0 || image.paragraphIndex >= paragraphs.length) return false;
  if (image.paragraphText !== paragraphs[image.paragraphIndex]) return false;
  if (image.role !== 'primary' && image.role !== 'detail') return false;
  if (!image.attribution || !image.author || !image.license || !image.sourceUrl || !image.url || !image.alt || !image.caption) return false;
  return allowedUrl(image.url, ['upload.wikimedia.org', 'thumb.wikimedia.org'])
    && allowedUrl(image.sourceUrl, ['commons.wikimedia.org'], COMMONS_FILE)
    && allowedUrl(image.licenseUrl, ['creativecommons.org']);
}

function coverOf(places: Tour['places']) {
  for (const place of places) {
    const set = place.metadata?.tourImages;
    if (!set || set.version !== 1 || set.status !== 'ready' || set.sourceText !== place.description || !Array.isArray(set.images)) continue;
    const paragraphs = place.description.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    const p = set.images.find(image => verifiedImage(image, paragraphs) && image.role === 'primary');
    if (p) {
      return {
        id: p.id, role: p.role, paragraphId: p.paragraphId, paragraphIndex: p.paragraphIndex, paragraphText: p.paragraphText, caption: p.caption,
        alt: p.alt, url: p.url, sourceUrl: p.sourceUrl, sourceTitle: p.sourceTitle, author: p.author, license: p.license, licenseUrl: p.licenseUrl,
        attribution: p.attribution, changes: p.changes, width: p.width, height: p.height, entityId: p.entityId, identityEvidence: p.identityEvidence,
        verifiedAt: p.verifiedAt,
      };
    }
  }
  return undefined;
}

function shortened(text: string | undefined): string | undefined {
  if (!text || text.length <= INTRODUCTION_LIMIT) return text;
  const cut = text.slice(0, INTRODUCTION_LIMIT);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), INTRODUCTION_LIMIT / 2)).trimEnd() + '…';
}

/** What a catalogue card needs and nothing else: the tour's page is where the stops, the audio and the credits are read. */
export function presentPilotTourSummary(tour: Tour, audio: TourAudioState, localReview = false) {
  const places = [...tour.places].sort((a, b) => a.position - b.position);
  const first = places[0];
  const sampleAudioUrl = audio.introduction?.audioUrl || places.map(place => audio.audioUrls[place.id]).find(Boolean);
  const cover = coverOf(places);
  return {
    id: tour.id, city: tour.city, country: tour.country, countryCode: tour.countryCode,
    cityNames: getCityNames(tour.city, tour.countryCode),
    theme: tour.theme, language: tour.language, durationMinutes: tour.durationMinutes,
    ...(tour.metadata?.catalogTitle ? { title: tour.metadata.catalogTitle } : {}),
    introduction: shortened(tour.introduction),
    localReview,
    stopCount: places.length,
    ...(first ? { start: { latitude: first.latitude, longitude: first.longitude } } : {}),
    ...(cover ? { cover } : {}),
    ...(sampleAudioUrl ? { sampleAudioUrl } : {}),
  };
}
