import { isAbsolute, join, resolve } from 'path';

/**
 * Where the working data of the pipeline lives (the OSM cache, the static OSM fallback, the Overpass coordination, the narrative runs and
 * their inputs). By default it is `<base>/tmp`, exactly as before; with `TOUR_DATA_DIR` set (an absolute path) all of it moves together.
 * The specific variables (OVERPASS_CACHE_DIR, OVERPASS_COORDINATOR_DIR, STATIC_OSM_FALLBACK_DIR) still win for their own folder.
 * Plan 07 section 7.6: most of what is called "tmp" is live data (about 18 GB), not temporary files.
 */
export function tourDataPath(base: string, ...parts: string[]): string {
  const configured = process.env.TOUR_DATA_DIR;
  if (configured && !isAbsolute(configured)) throw new Error('TOUR_DATA_DIR must be an absolute path');
  return join(configured ? resolve(configured) : join(base, 'tmp'), ...parts);
}
