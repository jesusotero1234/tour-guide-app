import 'dotenv/config';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { prismaClient } from '../../src/infrastructure/db/prismaClient';
import { Theme } from '../../src/domain/poi/themeTags';
import { inspectCity } from '../validation/inspect-osm-tours-batch';

type AuditSpec = {
  city: string;
  theme: Theme;
  language: string;
  durationMinutes: number;
};

type AuditedStop = {
  index: number;
  name: string;
  wikidataId: string | null;
  landmarkTier: string | null;
  fameScore: number | null;
  category: string | null;
};

type TourAuditResult = Awaited<ReturnType<typeof inspectCity>>;

type PairOverlap = {
  leftKey: string;
  rightKey: string;
  sharedNormalizedNames: string[];
  sharedWikidataIds: string[];
  sharedStopCountByName: number;
  sharedStopCountByWikidata: number;
  effectiveSharedStopCount: number;
  overlapRatio: number;
};

const AUDIT_SPECS: AuditSpec[] = [
  { city: 'Madrid', theme: 'history', language: 'es', durationMinutes: 60 },
  { city: 'Madrid', theme: 'history', language: 'es', durationMinutes: 120 },
  { city: 'Madrid', theme: 'history', language: 'es', durationMinutes: 240 },
  { city: 'Madrid', theme: 'architecture', language: 'es', durationMinutes: 120 },
  { city: 'Madrid', theme: 'food', language: 'es', durationMinutes: 120 },
  { city: 'Valencia', theme: 'history', language: 'es', durationMinutes: 120 },
  { city: 'Valencia', theme: 'history', language: 'es', durationMinutes: 240 },
  { city: 'Valencia', theme: 'architecture', language: 'es', durationMinutes: 120 },
];

function buildTourKey(spec: AuditSpec): string {
  return `${spec.city}|${spec.language}|${spec.theme}|${spec.durationMinutes}`;
}

function normalizeStopName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNameSet(stops: AuditedStop[]): Set<string> {
  return new Set(
    stops
      .map((stop) => normalizeStopName(stop.name))
      .filter((name) => name.length > 0)
  );
}

function getWikidataSet(stops: AuditedStop[]): Set<string> {
  return new Set(
    stops
      .map((stop) => stop.wikidataId)
      .filter((wikidataId): wikidataId is string => typeof wikidataId === 'string' && wikidataId.length > 0)
  );
}

function intersectSets(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => right.has(value)).sort();
}

function computePairOverlap(left: AuditSpec, leftResult: TourAuditResult, right: AuditSpec, rightResult: TourAuditResult): PairOverlap {
  const leftStops = (leftResult.stops ?? []) as AuditedStop[];
  const rightStops = (rightResult.stops ?? []) as AuditedStop[];
  const sharedNormalizedNames = intersectSets(getNameSet(leftStops), getNameSet(rightStops));
  const sharedWikidataIds = intersectSets(getWikidataSet(leftStops), getWikidataSet(rightStops));
  const effectiveSharedStopCount = Math.max(sharedNormalizedNames.length, sharedWikidataIds.length);
  const denominator = Math.min(leftStops.length, rightStops.length) || 1;

  return {
    leftKey: buildTourKey(left),
    rightKey: buildTourKey(right),
    sharedNormalizedNames,
    sharedWikidataIds,
    sharedStopCountByName: sharedNormalizedNames.length,
    sharedStopCountByWikidata: sharedWikidataIds.length,
    effectiveSharedStopCount,
    overlapRatio: Number((effectiveSharedStopCount / denominator).toFixed(3)),
  };
}

async function main(): Promise<void> {
  const results: Array<{ spec: AuditSpec; result: TourAuditResult }> = [];

  for (const spec of AUDIT_SPECS) {
    console.log(`[multi-route-overlap] Inspecting ${buildTourKey(spec)}`);
    const result = await inspectCity(spec.city, spec.theme, spec.language, spec.durationMinutes);
    results.push({ spec, result });
  }

  const byCity = new Map<string, Array<{ spec: AuditSpec; result: TourAuditResult }>>();
  for (const entry of results) {
    const cityEntries = byCity.get(entry.spec.city) ?? [];
    cityEntries.push(entry);
    byCity.set(entry.spec.city, cityEntries);
  }

  const overlaps: PairOverlap[] = [];
  for (const cityEntries of byCity.values()) {
    for (let i = 0; i < cityEntries.length; i++) {
      for (let j = i + 1; j < cityEntries.length; j++) {
        overlaps.push(computePairOverlap(
          cityEntries[i].spec,
          cityEntries[i].result,
          cityEntries[j].spec,
          cityEntries[j].result
        ));
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    specs: AUDIT_SPECS,
    tours: results.map(({ spec, result }) => ({
      key: buildTourKey(spec),
      city: spec.city,
      theme: spec.theme,
      language: spec.language,
      durationMinutes: spec.durationMinutes,
      rawPoiCount: result.rawPoiCount,
      candidateCount: result.candidateCount,
      stopCount: result.stopCount,
      degraded: result.degraded,
      degradationReason: result.degradationReason,
      coverageRatio: result.coverageRatio,
      estimatedTourMinutes: result.estimatedTourMinutes,
      confidence: result.confidence,
      stops: result.stops,
    })),
    overlaps,
  };

  const outputDir = path.resolve(__dirname, 'output');
  await mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `multi-route-overlap-${timestamp}.json`);
  await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');

  console.log('[multi-route-overlap] Summary');
  for (const overlap of overlaps) {
    console.log(
      `- ${overlap.leftKey} vs ${overlap.rightKey}: ${Math.round(overlap.overlapRatio * 100)}% overlap ` +
      `(name=${overlap.sharedStopCountByName}, wikidata=${overlap.sharedStopCountByWikidata})`
    );
  }
  console.log(`[multi-route-overlap] Wrote ${outputPath}`);
}

main()
  .catch(async (error) => {
    console.error('[multi-route-overlap] failed:', error);
    try {
      await prismaClient.$disconnect();
    } catch {
      // ignore disconnect failures
    }
    process.exit(1);
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });
