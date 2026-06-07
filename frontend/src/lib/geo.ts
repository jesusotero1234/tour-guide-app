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

export function formatDistance(meters: number) {
  if (meters < 1000) {
    return `${Math.round(meters / 10) * 10}m away`;
  }

  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}km away`;
}

export function getDistanceLabel(from: GeoPoint, to: GeoPoint) {
  const meters = haversineDistanceMeters(from, to);

  if (meters <= 60) {
    return 'You are near this stop';
  }

  return formatDistance(meters);
}

export function getMapsUrl(point: GeoPoint, label?: string) {
  const destination = label
    ? `${point.latitude},${point.longitude} (${encodeURIComponent(label)})`
    : `${point.latitude},${point.longitude}`;

  return `https://www.google.com/maps/search/?api=1&query=${destination}`;
}
