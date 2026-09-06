export interface NarrativeSecondaryContrastV8 {
  left: string;
  right: string;
}

const CONNECTORS: string[] = [
  'a diferencia de',
  'en contraste con',
  'unlike',
  'in contrast to',
  'in contrast with',
  'contrairement à',
  'a differenza di',
  'ao contrário de',
  'im gegensatz zu',
];

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function boundaryMatches(text: string, needle: string): RegExpMatchArray[] {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'))];
}

function hasWordBoundaryMatch(text: string, needle: string): boolean {
  return boundaryMatches(text, needle).length > 0;
}

function containsConnectorBetween(text: string, left: string, right: string): boolean {
  return boundaryMatches(text, left).some(leftMatch => boundaryMatches(text, right).some(rightMatch => {
    const leftEnd = leftMatch.index! + left.length;
    if (rightMatch.index! <= leftEnd) return false;
    const between = text.slice(leftEnd, rightMatch.index!);
    return CONNECTORS.some(conn => hasWordBoundaryMatch(between, normalize(conn)));
  }));
}

export function validatesSecondaryContrastV8(input: {
  text: string;
  role: string;
  interpretation: string;
  coverage: unknown;
  quotes: string[];
}): boolean {
  if (input.role !== 'distinctive_trait') return false;
  if (input.interpretation !== 'direct') return false;

  if (typeof input.text !== 'string') return false;
  if (!Array.isArray(input.quotes)) return false;

  const cov = input.coverage;
  if (cov === null || cov === undefined || typeof cov !== 'object' || Array.isArray(cov)) return false;

  const keys = Object.keys(cov);
  if (keys.length !== 2) return false;
  if (!keys.includes('left') || !keys.includes('right')) return false;

  const leftRaw = (cov as Record<string, unknown>).left;
  const rightRaw = (cov as Record<string, unknown>).right;
  if (typeof leftRaw !== 'string' || typeof rightRaw !== 'string') return false;

  const left = leftRaw.trim();
  const right = rightRaw.trim();

  if (left.length < 6 || left.length > 200) return false;
  if (right.length < 6 || right.length > 200) return false;

  const leftWords = left.split(/\s+/).filter(Boolean);
  const rightWords = right.split(/\s+/).filter(Boolean);
  if (leftWords.length < 2 || rightWords.length < 2) return false;

  const normLeft = normalize(left);
  const normRight = normalize(right);

  if (normLeft === normRight) return false;
  if (normLeft.includes(normRight) || normRight.includes(normLeft)) return false;

  const normText = normalize(input.text);
  if (!hasWordBoundaryMatch(normText, normLeft)) return false;
  if (!hasWordBoundaryMatch(normText, normRight)) return false;
  if (!containsConnectorBetween(normText, normLeft, normRight)) return false;

  const validQuote = input.quotes.some(q => {
    if (typeof q !== 'string') return false;
    const normQ = normalize(q);
    if (!hasWordBoundaryMatch(normQ, normLeft)) return false;
    if (!hasWordBoundaryMatch(normQ, normRight)) return false;
    if (!containsConnectorBetween(normQ, normLeft, normRight)) return false;
    return true;
  });

  if (!validQuote) return false;

  return true;
}
