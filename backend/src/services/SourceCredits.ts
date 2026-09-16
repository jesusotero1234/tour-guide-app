import type { TourBlueprintSnapshot } from './TourBlueprint';
import { SOURCE_POLICY_VERSION, sourceUse } from './poi/SourceUsePolicy';

export interface SourceCredit {
  sourceId: string;
  title: string;
  url: string;
  attribution: string;
  capturedAt: string;
  revisionUrl?: string;
  license?: string;
  licenseUrl?: string;
  status: 'permitted' | 'restricted' | 'pending';
  usage: 'research';
}
export interface SourceCredits { version: string; items: SourceCredit[] }

/** Re-check stored evidence too: changing providers must not revive restricted caches. */
export function assertBlueprintSources(snapshot: TourBlueprintSnapshot): void {
  for (const handoff of snapshot.checkpoint.research) {
    for (const capture of handoff.result.captures) {
      if (sourceUse(capture.requestedUrl).status !== 'permitted' || sourceUse(capture.finalUrl).status !== 'permitted') {
        throw new Error('SOURCE_USE_PENDING: ' + capture.sourceId);
      }
    }
    const credits = buildSourceCredits(snapshot, handoff.routeStopId);
    if (!credits.items.length || credits.items.some(item => item.status !== 'permitted')) throw new Error('SOURCE_USE_PENDING');
  }
}

export function buildSourceCredits(snapshot: TourBlueprintSnapshot, stopId: string): SourceCredits {
  const handoff = snapshot.checkpoint.research.find(stop => stop.routeStopId === stopId);
  if (!handoff) throw new Error('SOURCE_STOP_MISSING');
  const result = handoff.result;
  if (result.status !== 'sufficient') throw new Error('SOURCE_RESEARCH_INSUFFICIENT');
  const items = result.dossier.sources.map(source => {
    const capture = result.captures.find(item => item.sourceId === source.sourceId);
    if (!capture) throw new Error('SOURCE_CAPTURE_MISSING');
    const use = sourceUse(capture.finalUrl);
    let revisionUrl: string | undefined;
    if (capture.wikimediaRevision && use.license === 'CC BY-SA 4.0') {
      const url = new URL(capture.finalUrl);
      url.searchParams.set('oldid', String(capture.wikimediaRevision.revisionId));
      revisionUrl = url.toString();
    }
    return {
      sourceId: source.sourceId, title: capture.title, url: capture.finalUrl,
      attribution: use.attribution ?? new URL(capture.finalUrl).hostname,
      capturedAt: capture.capturedAt, ...(revisionUrl ? { revisionUrl } : {}),
      ...(use.license ? { license: use.license, licenseUrl: use.licenseUrl } : {}),
      status: use.status, usage: 'research' as const,
    };
  });
  return { version: SOURCE_POLICY_VERSION, items };
}
