import { normalizeNarrativeIdentityTextV8 } from './NarrativeAuthoritiesV7';

export interface NarrativeHistoricalPageContextV8 {
  pageId: string;
  logicalPageNumber: number;
  headerLineId: string;
  headerText: string;
}
const normalized = (text: string) => normalizeNarrativeIdentityTextV8(text.replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2'));
const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);

/** Conservative fallback: a matching page heading is context, never new factual prose. */
export function resolveNarrativeHistoricalPageContextV8(
  hit: Record<string, unknown>, raw: unknown, cityName: string, aliases: string[]
): NarrativeHistoricalPageContextV8 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const page = raw as Record<string, unknown>;
  if (hit.pageStart !== hit.pageEnd || page.documentId !== hit.documentId
    || page.logicalPageNumber !== hit.pageStart || !digest(page.pageId)
    || page.sourceUrl !== hit.sourceUrl || page.sourceIsExactRecord !== true
    || page.rightsStatus !== 'reviewed_reusable' || page.rightsIsExplicitlyReusable !== true
    || page.coverageAcceptedForProduct !== true || page.continuityBreakBefore !== false
    || page.contentClass !== 'normal' || typeof page.originalText !== 'string'
    || page.originalText.length > 150000 || !Array.isArray(page.lines) || page.lines.length > 5000
    || typeof hit.text !== 'string' || !Array.isArray(hit.sectionPath)) return null;
  const city = normalized(cityName);
  const section = hit.sectionPath.at(-1);
  if (!city || typeof section !== 'string' || !aliases.some(alias => {
    const name = normalized(alias);
    return name.length >= 3 && name !== city
      && (' ' + normalized(section) + ' ').includes(' ' + name + ' ');
  })) return null;
  const pageText = normalized(page.originalText), chunkText = normalized(hit.text);
  const offset = pageText.indexOf(chunkText);
  if (chunkText.length < 40 || offset < 0) return null;
  const lines = page.lines.filter((line): line is Record<string, unknown> =>
    !!line && typeof line === 'object' && !Array.isArray(line));
  const header = lines.find(line => line.role === 'header' && typeof line.originalText === 'string'
    && normalized(line.originalText) === city && typeof line.confidence === 'number'
    && line.confidence >= 0.9 && digest(line.lineId));
  if (!header) return null;
  // ponytail: reject ambiguous uppercase entry changes; richer verified entry metadata can relax this later.
  const ambiguousEntry = lines.some(line => {
    if (line.role !== 'body' || typeof line.originalText !== 'string'
      || !/^[\p{Lu}][\p{Lu}\s-]{2,50}[.,:]/u.test(line.originalText.trim())) return false;
    const text = normalized(line.originalText);
    const position = pageText.indexOf(text);
    return position >= 0 && position < offset && text !== city && !normalized(section).startsWith(text);
  });
  if (ambiguousEntry) return null;
  return { pageId: page.pageId, logicalPageNumber: page.logicalPageNumber as number,
    headerLineId: header.lineId as string, headerText: header.originalText as string };
}
