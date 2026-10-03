const fs = require('node:fs');
const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const db = new PrismaClient();
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

(async () => {
  try {
    const ids = data.tours.map(row => row.id);
    const found = await db.tour.count({ where: { id: { in: ids } } });
    if (![0, ids.length].includes(found)) throw Error('Refusing partial rollback: found ' + found + '/' + ids.length);
    if (found) await db.$transaction(tx => tx.tour.deleteMany({ where: { id: { in: ids } } }), { timeout: 120000 });
    console.log(JSON.stringify({ removedTours: found }));
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
