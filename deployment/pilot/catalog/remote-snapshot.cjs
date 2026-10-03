// Reads the published catalogue with the backend's own code and writes it to a JSON file (plan 04 section 4). READ ONLY.
// Runs on the server, from the release directory that contains this script, with /etc/tour-guide/backend.env (user nomuvia_app,
// which only has SELECT). It needs a release whose backend/dist already carries services/regeneration, so it runs after the
// backend release of plan 04 section 10.2 step 1, which does not change any served data.
//   node remote-snapshot.cjs <out.json> [tourId,tourId]
const fs = require('node:fs');
const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const { dumpCatalog } = require('./backend/dist/services/regeneration/manifest');

const [out, only] = process.argv.slice(2);
if (!out) { console.error('usage: node remote-snapshot.cjs <out.json> [tourId,tourId]'); process.exit(2); }
const db = new PrismaClient();
(async () => {
  try {
    const dump = await dumpCatalog(db, 'production', undefined, only ? only.split(',') : undefined);
    fs.writeFileSync(out, JSON.stringify(dump), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ out, tours: dump.tours.length, stops: dump.tours.reduce((n, t) => n + t.places.length, 0), notAdmitted: dump.notAdmitted.length }));
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
