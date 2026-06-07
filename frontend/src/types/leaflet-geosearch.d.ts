declare module 'leaflet-geosearch' {
  export class OpenStreetMapProvider {
    constructor(options?: Record<string, unknown>);
    search(params: { query: string }): Promise<{
      x: number;
      y: number;
      label: string;
      raw: {
        address?: {
          city?: string;
          town?: string;
          village?: string;
          country?: string;
          [key: string]: string | undefined;
        };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    }[]>;
  }
}
