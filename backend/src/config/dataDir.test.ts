import { tourDataPath } from './dataDir';

describe('tourDataPath', () => {
  const saved = process.env.TOUR_DATA_DIR;
  afterEach(() => { if (saved === undefined) delete process.env.TOUR_DATA_DIR; else process.env.TOUR_DATA_DIR = saved; });

  it('is <base>/tmp by default, as it always was', () => {
    delete process.env.TOUR_DATA_DIR;
    expect(tourDataPath('/app/backend', 'source-control/overpass')).toBe('/app/backend/tmp/source-control/overpass');
    expect(tourDataPath('/app/backend')).toBe('/app/backend/tmp');
  });
  it('moves everything with TOUR_DATA_DIR', () => {
    process.env.TOUR_DATA_DIR = '/data/nomuvia';
    expect(tourDataPath('/app/backend', 'osm-cache')).toBe('/data/nomuvia/osm-cache');
    expect(tourDataPath('/anywhere', 'narrative-v8', 'run-1')).toBe('/data/nomuvia/narrative-v8/run-1');
  });
  it('refuses a relative path, which would depend on where the process was started', () => {
    process.env.TOUR_DATA_DIR = 'data';
    expect(() => tourDataPath('/app/backend', 'x')).toThrow('absolute');
  });
});
