import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { LiveCityCandidatesV8Get, LiveCityCandidatesV8Wait } from './LiveCityCandidatesV8';
import { requestMediaWikiWithMaxlagPolicyV8 } from './MediaWikiRequestPolicyV8';
import { resolveWikidataEntityV8 } from './WikidataIdentityV8';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const DAY_MS = 24 * 60 * 60 * 1000;
interface Capture {
  sourceUrl: string;
  capturedAt: string;
  data: { entities: Record<string, Record<string, unknown>>; redirects?: unknown };
  redirectEvidence?: string;
  sha256: string;
}

/** Official linked-data reads for known QIDs; the caller still throttles requests by host. */
export async function readWikidataEntityDataV8(
  qid: string, get: LiveCityCandidatesV8Get, wait: LiveCityCandidatesV8Wait,
  cacheDirectory = process.env.NARRATIVE_WIKIDATA_ENTITY_CACHE_DIR
): Promise<{ data: Capture['data'] }> {
  if (!/^Q[1-9]\d*$/.test(qid)) throw new Error('Invalid Wikidata QID');
  const sourceUrl = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const file = cacheDirectory ? join(cacheDirectory, qid + '.json') : null;
  const validate = (capture: Capture) => {
    if (capture.sourceUrl !== sourceUrl || capture.sha256 !== digest([capture.data, capture.redirectEvidence ?? null])) {
      throw new Error('Wikidata capture identity or hash mismatch');
    }
    let data = capture.data;
    // JSON follows redirects without listing the edge. Require Wikidata's explicit RDF equivalence.
    if (!data.entities[qid] && Object.keys(data.entities).length === 1) {
      const canonical = Object.keys(data.entities)[0];
      const turtle = capture.redirectEvidence ?? '';
      const edge = new RegExp(`(?:^|\\n)wd:${qid}\\s+owl:sameAs\\s+wd:${canonical}\\s*\\.`);
      if (!/^Q[1-9]\d*$/.test(canonical)
        || !turtle.includes('@prefix wd: <http://www.wikidata.org/entity/> .')
        || !turtle.includes('@prefix owl: <http://www.w3.org/2002/07/owl#> .') || !edge.test(turtle)) {
        throw new Error('Unconfirmed Wikidata EntityData redirect');
      }
      data = { ...data, redirects: [{ from: qid, to: canonical }] };
    }
    const resolved = resolveWikidataEntityV8(data, qid, capture.capturedAt);
    if (resolved.status === 'resolved' && !resolved.identity.revision) throw new Error('EntityData revision missing');
    return { data };
  };
  if (file && existsSync(file)) {
    const capture = JSON.parse(readFileSync(file, 'utf8')) as Capture;
    const result = validate(capture);
    const age = Date.now() - Date.parse(capture.capturedAt);
    if (age >= 0 && age < DAY_MS) return result;
  }
  let data: Capture['data'];
  try {
    const response = await requestMediaWikiWithMaxlagPolicyV8(() => get(sourceUrl, {}), wait);
    data = response.data as Capture['data'];
    if (!data || typeof data !== 'object' || !data.entities || Array.isArray(data.entities)) {
      throw new Error('Invalid Wikidata EntityData response');
    }
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status !== 404) throw error;
    data = { entities: { [qid]: { id: qid, missing: true } } };
  }
  let redirectEvidence: string | undefined;
  if (!data.entities[qid] && Object.keys(data.entities).length === 1) {
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      () => get(sourceUrl.replace(/\.json$/, '.ttl'), { flavor: 'dump' }, { headers: { Accept: 'text/turtle' } }), wait);
    if (typeof response.data !== 'string') throw new Error('Invalid Wikidata redirect evidence');
    redirectEvidence = response.data;
  }
  const capture: Capture = { sourceUrl, capturedAt: new Date().toISOString(), data,
    ...(redirectEvidence ? { redirectEvidence } : {}), sha256: digest([data, redirectEvidence ?? null]) };
  const result = validate(capture);
  if (file && cacheDirectory) {
    mkdirSync(cacheDirectory, { recursive: true });
    const temporary = file + '.' + process.pid + '.tmp';
    writeFileSync(temporary, JSON.stringify(capture) + '\n', { mode: 0o600 });
    renameSync(temporary, file);
  }
  return result;
}
