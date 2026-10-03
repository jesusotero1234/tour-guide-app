// One-time regeneration of the published catalogue (plan 04). See `catalog-regeneration help` and docs/plans/20261001-audio-paradas-ui-backend/04-regeneracion-y-publicacion.md
require('dotenv/config');
const { main } = require('../../src/services/regeneration/cli');
main(process.argv.slice(2), __filename).then(code => process.exit(code), error => { console.error(error.message); process.exit(1); });
