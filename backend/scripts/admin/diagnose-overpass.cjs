// Diagnostics share generation's gate, cache and acquisition budgets.
require('dotenv/config');
const fs = require('node:fs'), path = require('node:path');
const { requestOverpass, OverpassCoordinatorError } = require('../../src/infrastructure/poi/OverpassCoordinator');
const { buildQuery } = require('../../src/infrastructure/poi/OverpassPoiFetcher');
const { THEME_TAG_MAP } = require('../../src/domain/poi/themeTags');
const { overpassQueryCache } = require('../../src/infrastructure/poi/OverpassQueryCache');
async function main() {
  const base = path.resolve(__dirname, '../../tmp/pilot-batch-europe-20260920/hamburg');
  const city = JSON.parse(fs.readFileSync(path.join(base, 'source-diagnostic-v1/city.json'), 'utf8'));
  const directory = path.join(base, 'source-diagnostic-shared-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(directory, { recursive: true });
  process.env.SOURCE_ACQUISITION_DIR = directory;
  const queries = [
    ['real', buildQuery(city, 'history', THEME_TAG_MAP.history.priorityGroups[0])],
    ['control', `[out:json][timeout:60];${city.osmType}(${city.osmId});out tags;`],
  ];
  for (const [name, query] of queries) {
    try {
      const result = await requestOverpass({ cityKey: city.wikidataId || `${city.osmType}:${city.osmId}`,
        query, cacheDirectory: overpassQueryCache.directory, ttlMs: overpassQueryCache.ttlMs });
      fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify({ name, query, ...result }, null, 2));
      console.log(JSON.stringify({ name, status: result.status, endpoint: result.endpoint, cacheHit: result.cacheHit }));
    } catch (error) {
      const result = error instanceof OverpassCoordinatorError ? error.result : { status: 'error', message: error.message };
      fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify({ name, query, ...result }, null, 2));
      console.log(JSON.stringify({ name, ...result }));
      return; // A diagnostic never creates its own recovery loop.
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
