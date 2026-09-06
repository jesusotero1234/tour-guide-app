/** Resolve only identity equivalences explicitly supplied by Wikibase, never by labels. */
export interface WikidataIdentityResolutionV8 {
  requestedId: string;
  canonicalId: string;
  redirectChain: string[];
  resolvedAt: string;
  revision: { revisionId: number; timestamp: string } | null;
}
export type ResolvedWikidataEntityV8 =
  | { status: 'missing'; identity: WikidataIdentityResolutionV8 }
  | { status: 'resolved'; identity: WikidataIdentityResolutionV8; entity: Record<string, unknown> };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Wikidata ' + label);
  return value as Record<string, unknown>;
}
function qid(value: unknown): string {
  if (typeof value !== 'string' || !/^Q[1-9]\d*$/u.test(value)) throw new Error('Invalid Wikidata QID');
  return value;
}

export function resolveWikidataEntityV8(
  response: unknown, requestedId: string, resolvedAt = new Date().toISOString()
): ResolvedWikidataEntityV8 {
  qid(requestedId);
  const root = record(response, 'response');
  if (root.error !== undefined || (root.success !== undefined && root.success !== 1)) throw new Error('Wikidata request failed');
  const raw = root.entities;
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Wikidata entities');
  const entries: Array<[string, Record<string, unknown>]> = Array.isArray(raw)
    ? raw.map(value => { const e = record(value, 'entity'); return [qid(e.id), e]; })
    : Object.entries(raw).map(([key, value]) => [qid(key), record(value, 'entity')]);
  const byKey = new Map(entries), edges = new Map<string, string>();
  const addRedirects = (value: unknown) => {
    if (value === undefined) return;
    for (const item of Array.isArray(value) ? value : [value]) {
      const edge = record(item, 'redirect'), from = qid(edge.from), to = qid(edge.to);
      if (edges.has(from) && edges.get(from) !== to) throw new Error('Conflicting Wikidata redirects');
      edges.set(from, to);
    }
  };
  addRedirects(root.redirects);
  for (const [, entity] of entries) addRedirects(entity.redirects);
  const chain = [requestedId], seen = new Set(chain);
  let canonicalId = requestedId;
  while (edges.has(canonicalId)) {
    const next = edges.get(canonicalId)!;
    if (seen.has(next)) throw new Error('Cyclic Wikidata redirect');
    if (chain.length > 8) throw new Error('Wikidata redirect limit exceeded');
    chain.push(next); seen.add(next); canonicalId = next;
  }
  // Some wbgetentities responses key the resolved entity by the requested alias.
  const entity = byKey.get(requestedId)?.id === canonicalId
    ? byKey.get(requestedId)!
    : byKey.get(canonicalId) ?? entries.find(([, e]) => e.id === canonicalId)?.[1];
  if (!entity) throw new Error('Wikidata entity ' + requestedId + ' omitted or identity mismatch');
  if (entity.id !== canonicalId) throw new Error('Unconfirmed Wikidata identity mismatch');
  const missing = entity.missing === true || entity.missing === '' || entity.missing === 1;
  const revision = Number.isInteger(entity.lastrevid) && Number(entity.lastrevid) > 0
    && typeof entity.modified === 'string' && Number.isFinite(Date.parse(entity.modified))
    ? { revisionId: Number(entity.lastrevid), timestamp: entity.modified } : null;
  const identity = { requestedId, canonicalId, redirectChain: chain, resolvedAt, revision };
  if (missing) return { status: 'missing', identity };
  if (Object.prototype.hasOwnProperty.call(entity, 'missing')) throw new Error('Invalid Wikidata missing marker');
  if (chain.length > 1 && !revision) throw new Error('Wikidata redirected entity lacks revision');
  return { status: 'resolved', identity, entity };
}
