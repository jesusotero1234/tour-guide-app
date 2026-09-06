import axios from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import { TourImageCandidate } from '../domain/entities/TourImage';
import { requestMediaWikiWithMaxlagPolicyV8, narrativeHttpHeadersV8 } from './poi/MediaWikiRequestPolicyV8';

type Row = Record<string, any>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

export function plainImageText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name: string) =>
      ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[name] || ''))
    .replace(/\s+/g, ' ').trim();
}

function safeUrl(value: unknown, hosts: string[]): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port) return null;
    return url.href;
  } catch { return null; }
}

export function candidateFromPage(raw: unknown, entityId: string, identityEvidence: TourImageCandidate['identityEvidence']): TourImageCandidate | null {
  const page = row(raw), info = row(array(page.imageinfo)[0]), metadata = row(info.extmetadata);
  const field = (name: string) => plainImageText(row(metadata[name]).value);
  if (!/^Q[1-9]\d*$/.test(entityId) || !Number.isSafeInteger(page.pageid) || page.pageid <= 0) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(info.mime) ||
      !Number.isFinite(info.width) || !Number.isFinite(info.height) || info.width < 640 || info.height < 360) return null;
  const url = safeUrl(info.thumburl || info.url, ['upload.wikimedia.org', 'thumb.wikimedia.org']);
  const sourceUrl = safeUrl(info.descriptionurl, ['commons.wikimedia.org']);
  if (!url || !sourceUrl || !new URL(sourceUrl).pathname.startsWith('/wiki/File:')) return null;
  const author = field('Artist');
  if (!author || field('Restrictions')) return null;
  const name = field('LicenseShortName').toUpperCase();
  let license: string, expectedPath: string;
  if (/^CC0(?: 1\.0)?$/.test(name)) {
    license = 'CC0 1.0'; expectedPath = '/publicdomain/zero/1.0/';
  } else {
    const match = /^CC (BY(?:-SA)?) (1\.0|2\.0|2\.5|3\.0|4\.0)$/.exec(name);
    if (!match) return null;
    license = 'CC ' + match[1] + ' ' + match[2];
    expectedPath = '/licenses/' + match[1].toLowerCase() + '/' + match[2] + '/';
  }
  const licenseUrl = safeUrl(field('LicenseUrl').replace(/^http:/, 'https:'), ['creativecommons.org']);
  if (!licenseUrl) return null;
  const parsedLicenseUrl = new URL(licenseUrl);
  if (parsedLicenseUrl.search || parsedLicenseUrl.hash) return null;
  const normalizedPath = parsedLicenseUrl.pathname.replace(/\/deed\.[a-z]+(?:-[a-z]+)*\/?$/i, '/').replace(/\/$/, '');
  if (normalizedPath !== expectedPath.slice(0, -1)) return null;
  const canonicalLicenseUrl = 'https://creativecommons.org' + expectedPath;
  return {
    id: String(page.pageid), entityId, identityEvidence, title: plainImageText(page.title).slice(0, 300),
    description: field('ImageDescription').slice(0, 2000), url, sourceUrl, author,
    license, licenseUrl: canonicalLicenseUrl, attribution: field('Attribution') || author,
    width: info.width, height: info.height,
  };
}

function claimValues(entity: unknown, property: string): any[] {
  const claims = row(row(entity).claims || row(entity).statements);
  return array(claims[property]).filter(c => row(c).rank !== 'deprecated')
    .map(c => row(row(row(c).mainsnak).datavalue).value);
}

/** Returns candidates, never a claim that the photograph suits a paragraph. */
export class CommonsImageCandidates {
  private async get(endpoint: string, params: Row, signal?: AbortSignal): Promise<Row> {
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      async () => {
        signal?.throwIfAborted();
        const res = await axios.get(endpoint, {
          params: { format: 'json', ...params }, signal, timeout: 8000, maxRedirects: 0,
          headers: { ...narrativeHttpHeadersV8(), ...(process.env.WIKIMEDIA_USER_AGENT ? { 'User-Agent': process.env.WIKIMEDIA_USER_AGENT } : {}) },
        });
        return { data: res.data, status: res.status, headers: { 'retry-after': res.headers?.['retry-after']?.toString() } };
      },
      (ms) => delay(ms, undefined, { signal }),
      { maxAttempts: 3, maxTotalWaitMs: 20000 }
    );
    return row(response.data);
  }
  async find(entityId: string, signal?: AbortSignal): Promise<TourImageCandidate[]> {
    if (!/^Q[1-9]\d*$/.test(entityId)) return [];
    signal?.throwIfAborted();
    const candidates = new Map<string, TourImageCandidate>();
    const add = (page: unknown, evidence: TourImageCandidate['identityEvidence']) => {
      const candidate = candidateFromPage(page, entityId, evidence);
      if (candidate && !candidates.has(candidate.id)) candidates.set(candidate.id, candidate);
    };
    const imageParams = { action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 1000 };
    try {
      const data = await this.get(WIKIDATA, { action: 'wbgetentities', ids: entityId, props: 'claims' }, signal);
      const filenames = claimValues(row(data.entities)[entityId], 'P18').filter(v => typeof v === 'string').slice(0, 3);
      if (filenames.length) {
        const images = await this.get(COMMONS, { ...imageParams, titles: filenames.map(v => 'File:' + v.replace(/^File:/, '')).join('|') }, signal);
        Object.values(row(row(images.query).pages)).forEach(page => add(page, 'wikidata-p18'));
      }
    } catch { signal?.throwIfAborted(); }
    try {
      const data = await this.get(COMMONS, { ...imageParams, generator: 'search', gsrsearch: 'haswbstatement:P180=' + entityId, gsrnamespace: 6, gsrlimit: 3 }, signal);
      const pages = Object.values(row(row(data.query).pages)).map(row).filter(p => Number.isSafeInteger(p.pageid) && p.pageid > 0).slice(0, 3);
      if (pages.length) {
        const claims = await this.get(COMMONS, { action: 'wbgetentities', ids: pages.map(p => 'M' + p.pageid).join('|') }, signal);
        for (const page of pages) {
          if (claimValues(row(claims.entities)['M' + page.pageid], 'P180').some(v => row(v).id === entityId)) add(page, 'commons-depicts');
        }
      }
    } catch { signal?.throwIfAborted(); }
    return [...candidates.values()].slice(0, 4);
  }
}
