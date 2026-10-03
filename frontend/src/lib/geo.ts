export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(from: GeoPoint, to: GeoPoint) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

export function getMapsUrl(point: GeoPoint, label?: string) {
  const destination = label
    ? `${point.latitude},${point.longitude} (${encodeURIComponent(label)})`
    : `${point.latitude},${point.longitude}`;

  return `https://www.google.com/maps/search/?api=1&query=${destination}`;
}

/**
 * A distance as a person says it: "350 m", "1,2 km" (the decimal mark follows the language). Under 100 m it rounds to 5 m, up to
 * 1 km to 10 m, beyond that to a tenth of a kilometre.
 */
export function formatDistanceLabel(meters: number, language: string): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.max(5, Math.round(meters / 5) * 5) : Math.round(meters / 10) * 10;
    return rounded >= 1000 ? formatDistanceLabel(rounded, language) : `${new Intl.NumberFormat(language).format(rounded)} m`;
  }
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(Math.round(meters / 100) / 10)} km`;
}

/** Whole minutes on foot for a number of seconds, never less than one. */
export const walkingMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** True on iPhone, iPad and Mac, where Apple Maps is the app people have; false everywhere else. */
export function prefersAppleMaps(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Walking directions to a point in Apple Maps. */
export const appleMapsDirectionsUrl = (point: GeoPoint) => 'https://maps.apple.com/?' + new URLSearchParams({ daddr: `${point.latitude},${point.longitude}`, dirflg: 'w' });

/** Walking directions to a point in Google Maps. */
export const googleMapsDirectionsUrl = (point: GeoPoint) => 'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', destination: `${point.latitude},${point.longitude}`, travelmode: 'walking', dir_action: 'navigate' });
