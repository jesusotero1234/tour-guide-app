import { overpassQueryCache } from '../../src/infrastructure/poi/OverpassQueryCache';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'cleanup' && args.length === 0) {
    console.log(`Removed ${await overpassQueryCache.cleanup()} old cache entries.`);
  } else if (command === 'expire' && args.length === 1 && args[0].startsWith('--city=') && args[0].slice(7).trim()) {
    console.log(`Expired ${await overpassQueryCache.expireCity(args[0].slice(7))} entries. They will refresh on the next Overpass lookup; previous data is preserved until then.`);
  } else {
    throw new Error('Usage: tsx scripts/admin/overpass-cache.ts expire --city=Q2807 | cleanup');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
