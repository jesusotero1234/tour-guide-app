import { pilotEnabled } from '../../config/pilot';

export const SOURCE_POLICY_VERSION = 'source-use-20260908-1';
export interface SourceUse {
  status: 'permitted' | 'restricted' | 'pending';
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  reason?: string;
}

/** Source identity is not an assertion that every embedded third-party work is reusable. */
export function sourceUse(rawUrl: string): SourceUse {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { status: 'pending', reason: 'Invalid source URL' }; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return { status: 'pending', reason: 'Invalid source origin' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (['catedraldesevilla.es', 'alcazarsevilla.org'].some(domain => host === domain || host.endsWith('.' + domain))) {
    return { status: 'restricted', reason: 'Written permission/use review required' };
  }
  if (/^[a-z-]+\.wikipedia\.org$/.test(host) && url.pathname.startsWith('/wiki/')) {
    return { status: 'permitted', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution: 'Wikipedia contributors; authors and revision history linked from the article' };
  }
  if (host === 'www.wikidata.org' && /^\/wiki\/Q\d+$/.test(url.pathname)) {
    return { status: 'permitted', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'Wikidata contributors' };
  }
  return { status: 'pending', reason: 'Source permissions have not been documented' };
}

export function assertWebCaptureAllowed(rawUrl: string): void {
  if (sourceUse(rawUrl).status === 'restricted') throw new Error('SOURCE_USE_RESTRICTED');
  // Firecrawl follows redirects/subresources internally; checking finalUrl would be too late.
  if (pilotEnabled()) throw new Error('GENERIC_WEB_CAPTURE_DISABLED');
}
