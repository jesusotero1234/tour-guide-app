export interface RawPoi {
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  name: string;
  lat: number;
  lng: number;
  tags: {
    name?: string;
    [nameWithLang: `name:${string}`]: string | undefined;
    wikipedia?: string;
    wikidata?: string;
    tourism?: string;
    historic?: string;
    building?: string;
    architect?: string;
    museum?: string;
    amenity?: string;
    shop?: string;
    man_made?: string;
    brand?: string;
    [key: string]: string | undefined;
  };
}
