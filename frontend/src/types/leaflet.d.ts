declare module 'leaflet' {
  export interface LatLng {
    lat: number;
    lng: number;
  }

  export interface LeafletMouseEvent {
    latlng: LatLng;
  }

  export interface IconOptions {
    iconUrl?: string;
    iconRetinaUrl?: string;
    shadowUrl?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
    shadowSize?: [number, number];
    className?: string;
  }

  export class Icon {
    constructor(options: IconOptions);
    static Default: {
      prototype: {
        _getIconUrl: string;
      };
      mergeOptions(options: IconOptions): void;
    };
  }

  export interface DivIconOptions {
    className?: string;
    html?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type LatLngBounds = any;

  export interface Map {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fitBounds(bounds: any, options?: { padding?: [number, number]; maxZoom?: number }): void;
    remove(): this;
  }

  export function icon(options: IconOptions): Icon;
  export function divIcon(options: DivIconOptions): Icon;
  export function latLngBounds(latlngs: [number, number][]): LatLngBounds;

  const L: {
    icon: typeof icon;
    divIcon: typeof divIcon;
    latLngBounds: typeof latLngBounds;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map: (id: string | HTMLElement, options?: Record<string, any>) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tileLayer: (url: string, options?: Record<string, any>) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    polyline: (latlngs: [number, number][], options?: Record<string, any>) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    marker: (latlng: [number, number], options?: Record<string, any>) => any;
    Icon: {
      Default: {
        prototype: {
          _getIconUrl?: string;
        };
        mergeOptions(options: IconOptions): void;
      };
      new (options: IconOptions): Icon;
    };
  };

  export default L;
}
