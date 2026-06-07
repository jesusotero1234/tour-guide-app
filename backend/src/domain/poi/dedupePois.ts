import { RawPoi } from './RawPoi';

// OSM frequently maps a single landmark as several elements sharing one wikidata
// id (e.g. a node for the label + a relation for the building footprint). Dedup by
// osmType:osmId keeps both, so the same landmark can occupy multiple tour stops
// (observed: "Palacio Real" + "Palacio Real de Madrid", both Q171517). This collapses
// elements that share a wikidata id down to the single richest representation.

const GEOMETRY_RANK: Record<RawPoi['osmType'], number> = {
  relation: 2,
  way: 1,
  node: 0,
};

function tagCount(poi: RawPoi): number {
  return Object.values(poi.tags).filter((value) => typeof value === 'string' && value.length > 0).length;
}

/**
 * Returns true if `candidate` is a richer representation of the same landmark than
 * `incumbent`: more tags wins; ties break toward area geometry (relation > way > node).
 */
function isRicher(candidate: RawPoi, incumbent: RawPoi): boolean {
  const candidateTags = tagCount(candidate);
  const incumbentTags = tagCount(incumbent);
  if (candidateTags !== incumbentTags) {
    return candidateTags > incumbentTags;
  }
  return GEOMETRY_RANK[candidate.osmType] > GEOMETRY_RANK[incumbent.osmType];
}

/**
 * Collapses POIs that share a `wikidata` tag to one element each, keeping the richest
 * representation. POIs without a wikidata tag are never merged (they are kept as-is,
 * in order). Stable: the first-seen position of each kept POI is preserved.
 */
export function dedupeByWikidata(pois: RawPoi[]): RawPoi[] {
  const indexByWikidata = new Map<string, number>();
  const result: RawPoi[] = [];

  for (const poi of pois) {
    const wikidata = poi.tags.wikidata;
    if (!wikidata) {
      result.push(poi);
      continue;
    }

    const existingIndex = indexByWikidata.get(wikidata);
    if (existingIndex === undefined) {
      indexByWikidata.set(wikidata, result.length);
      result.push(poi);
      continue;
    }

    if (isRicher(poi, result[existingIndex])) {
      result[existingIndex] = poi;
    }
  }

  return result;
}
