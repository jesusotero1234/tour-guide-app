// Fresh shared evidence for the Barcelona preparation comparison; no LLM calls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WikidataAuthorityProviderV7, resolveWikidataQidFromWikipediaV8 } = require('../../src/services/poi/NarrativeAuthoritiesV7');
const { captureWikipediaArticleV8 } = require('../../src/services/poi/NarrativeSourcesV7');
const { narrationTargetForSecondsV8 } = require('../../src/services/poi/NarrativeDurationTargetsV8');
const titles = ['Templo Expiatorio de la Sagrada Familia', 'Casa Milà', 'Casa Batlló', 'Palacio de la Música Catalana', 'Catedral de la Santa Cruz y Santa Eulalia de Barcelona', 'Basílica de Santa María del Mar'];
async function main() {
  const out = path.resolve(process.argv[2] || 'tmp/narrative-v8/barcelona-mini-deepseek-20260910');
  if (fs.existsSync(out)) throw Error('Source output directory must be new');
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const data = { city: 'Barcelona', cityQid: 'Q1492', language: 'es', collectedAt: new Date().toISOString(), status: 'collecting', stops: [] };
  const save = () => fs.writeFileSync(path.join(out, 'sources.private.json'), JSON.stringify(data, null, 2)+'\n', { mode: 0o600 });
  const authorities = new WikidataAuthorityProviderV7();
  save();
  try {
    for (const title of titles) {
      const qid = await resolveWikidataQidFromWikipediaV8({ title, language: 'es' });
      if (!qid || data.stops.some(s => s.qid === qid)) throw Error('Missing or duplicate identity: '+title);
      const registry = await authorities.resolveAuthorities({ qid, cityQid: data.cityQid, language: 'es' });
      const sitelink = await authorities.resolveWikipediaSitelinkV8({ qid, language: 'es' });
      if (!sitelink.title) throw Error('No Spanish Wikipedia page: '+title);
      const capture = await captureWikipediaArticleV8({ title: sitelink.title, language: sitelink.language, expectedQid: qid });
      if (!capture?.content?.trim()) throw Error('Empty Wikipedia capture: '+title);
      data.stops.push({ qid, name: title, target: narrationTargetForSecondsV8(qid, 300), registry,
        identity: { qid, labels: registry.labels, aliases: registry.aliases, wikipediaTitle: sitelink.title, wikipediaLanguage: sitelink.language, revision: sitelink.revision },
        capture, contentSha256: crypto.createHash('sha256').update(capture.content).digest('hex') });
      save();
      console.log(JSON.stringify({ stop: title, qid, characters: capture.content.length, authorities: registry.authorities.length }));
    }
    data.status = 'complete';
  } catch (error) { data.status = 'incomplete'; data.error = String(error.message); throw error; }
  finally { save(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
