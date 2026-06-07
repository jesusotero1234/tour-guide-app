import L from 'leaflet';

export function createNumberedMarkerIcon(position: number, isActive: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold shadow-md ${
      isActive
        ? 'border-mutedGold bg-darkBrown text-beige'
        : 'border-darkBrown bg-beige text-darkBrown'
    }">${position}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}
