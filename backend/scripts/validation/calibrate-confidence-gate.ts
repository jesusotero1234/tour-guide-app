import 'dotenv/config';
import { prismaClient } from '../../src/infrastructure/db/prismaClient';
import { Theme } from '../../src/domain/poi/themeTags';
import { getVerifiedCityThemes } from '../../src/services/tourQuality/VerifiedCities';
import { inspectCity } from './inspect-osm-tours-batch';

interface NumericSummary {
  min: number;
  max: number;
  avg: number;
}

function summarize(values: number[]): NumericSummary | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: Number(Math.min(...values).toFixed(3)),
    max: Number(Math.max(...values).toFixed(3)),
    avg: Number((total / values.length).toFixed(3)),
  };
}

async function main(): Promise<void> {
  const theme = (process.argv[2] || 'history') as Theme;
  const language = process.argv[3] || 'es';
  const durationMinutes = Number(process.argv[4] || '240');
  const verifiedCities = getVerifiedCityThemes(theme);

  if (verifiedCities.length === 0) {
    throw new Error(`No verified cities registered for theme "${theme}"`);
  }

  const results = [] as Array<{
    city: string;
    countryCode: string;
    passed: boolean;
    stage: 'input' | 'output';
    score: number;
    reasons: string[];
    rawPoiCount: number;
    candidateCount: number;
    stopCount: number;
    coverageRatio: number;
  }>;

  for (const { canonicalCity, countryCode } of verifiedCities) {
    const inspected = await inspectCity(canonicalCity, theme, language, durationMinutes);
    results.push({
      city: canonicalCity,
      countryCode,
      passed: inspected.confidence.passed,
      stage: inspected.confidence.stage,
      score: inspected.confidence.score,
      reasons: inspected.confidence.reasons,
      rawPoiCount: inspected.rawPoiCount,
      candidateCount: inspected.candidateCount,
      stopCount: inspected.stopCount,
      coverageRatio: inspected.coverageRatio,
    });
  }

  const summary = {
    theme,
    language,
    durationMinutes,
    cityCount: results.length,
    provisionalPassCount: results.filter((result) => result.passed).length,
    provisionalFailCount: results.filter((result) => !result.passed).length,
    score: summarize(results.map((result) => result.score)),
    rawPoiCount: summarize(results.map((result) => result.rawPoiCount)),
    candidateCount: summarize(results.map((result) => result.candidateCount)),
    stopCount: summarize(results.map((result) => result.stopCount)),
    coverageRatio: summarize(results.map((result) => result.coverageRatio)),
  };

  console.log(JSON.stringify({ summary, results }, null, 2));
  await prismaClient.$disconnect();
}

main().catch(async (error) => {
  console.error('[calibrate-confidence-gate] failed:', error);
  try { await prismaClient.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
