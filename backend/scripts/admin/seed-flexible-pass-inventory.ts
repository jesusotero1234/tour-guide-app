import 'dotenv/config';
import { prismaClient } from '../../src/infrastructure/db/prismaClient';
import { conceptDiscoveryService } from '../../src/services/cityIntelligence/ConceptDiscoveryService';
import { orchestrationService } from '../../src/services/orchestrationService';
import { evaluateTourContentReadiness } from '../../src/services/tourReadiness/contentReadiness';

type InventoryTarget = {
  city: string;
  country: string;
  countryCode: string;
  language: string;
};

type InventoryTourStatus = {
  id: string;
  conceptSlug: string | null;
  theme: string;
  language: string;
  stopCount: number;
  audioComplete: boolean;
  contentReady: boolean;
  passEligible: boolean;
};

const FLEXIBLE_PASS_MIN_STOP_COUNT = 5;

const DEFAULT_TARGETS: InventoryTarget[] = [
  { city: 'Madrid', country: 'Spain', countryCode: 'ES', language: 'es' },
  { city: 'Valencia', country: 'Spain', countryCode: 'ES', language: 'es' },
];

function parseTargetsFromArgs(): InventoryTarget[] {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return DEFAULT_TARGETS;
  }

  const parsed: InventoryTarget[] = [];
  for (const arg of args) {
    const [city, countryCode = 'ES', language = 'es', country = 'Spain'] = arg.split('|');
    if (!city) {
      continue;
    }
    parsed.push({ city, country, countryCode: countryCode.toUpperCase(), language: language.toLowerCase() });
  }
  return parsed.length > 0 ? parsed : DEFAULT_TARGETS;
}

async function getCityInventoryStatus(target: InventoryTarget): Promise<InventoryTourStatus[]> {
  const tours = await prismaClient.tour.findMany({
    where: {
      city: target.city,
      countryCode: target.countryCode,
      language: target.language,
      metadata: {
        path: ['conceptSlug'],
        not: null,
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      theme: true,
      language: true,
      metadata: true,
      places: { select: { id: true } },
    },
  });

  const statuses: InventoryTourStatus[] = [];
  for (const tour of tours) {
    const hydrated = await orchestrationService.retrieveTour(tour.id);
    const audioComplete = hydrated.places.length > 0 && hydrated.places.every((place) => Boolean(place.audioUrl));
    const contentReady = evaluateTourContentReadiness(hydrated.places).ready;
    statuses.push({
      id: tour.id,
      conceptSlug: (tour.metadata as { conceptSlug?: string } | null)?.conceptSlug ?? null,
      theme: tour.theme,
      language: tour.language,
      stopCount: hydrated.places.length,
      audioComplete,
      contentReady,
      passEligible: audioComplete && contentReady && hydrated.places.length >= FLEXIBLE_PASS_MIN_STOP_COUNT,
    });
  }

  return statuses;
}

async function ensureInventoryForTarget(target: InventoryTarget) {
  const discovery = await conceptDiscoveryService.getCityConcepts({
    city: target.city,
    countryCode: target.countryCode,
    language: target.language,
    includeLowConfidence: false,
  });

  const generationResults: Array<{ conceptSlug: string; status: 'generated' | 'failed'; reason?: string; tourId?: string }> = [];

  for (const concept of discovery.concepts) {
    try {
      const tour = await orchestrationService.generateTourFromConcept({
        conceptSlug: concept.slug,
        city: target.city,
        country: target.country,
        countryCode: target.countryCode,
        language: target.language,
        durationMinutes: concept.suggestedDurationMinutes,
      });

      generationResults.push({
        conceptSlug: concept.slug,
        status: 'generated',
        tourId: tour.id,
      });
    } catch (error) {
      generationResults.push({
        conceptSlug: concept.slug,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const inventoryStatus = await getCityInventoryStatus(target);
  const flexiblePassOptions = await orchestrationService.listFlexiblePassCities(target.language);
  const cityPass = flexiblePassOptions.find((entry) => entry.city === target.city && entry.countryCode === target.countryCode && entry.language === target.language);

  return {
    target,
    discoveredConcepts: discovery.concepts.map((concept) => ({
      slug: concept.slug,
      confidence: concept.confidence,
      routeType: concept.routeType,
      suggestedDurationMinutes: concept.suggestedDurationMinutes,
    })),
    generationResults,
    inventoryStatus,
    flexiblePassEligible: Boolean(cityPass),
    eligibleTourCount: inventoryStatus.filter((tour) => tour.passEligible).length,
  };
}

async function main(): Promise<void> {
  const targets = parseTargetsFromArgs();
  const results = [];

  for (const target of targets) {
    console.log(`[seed-flexible-pass-inventory] processing ${target.city}/${target.countryCode}/${target.language}`);
    results.push(await ensureInventoryForTarget(target));
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
}

main()
  .catch(async (error) => {
    console.error('[seed-flexible-pass-inventory] failed:', error);
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
