import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildNarrativeScriptRequestFromCaseV2,
  loadNarrativeBenchmarkCaseV2,
  narrativeEvidenceProvenanceFingerprintV2,
} from './NarrativeBenchmarkCaseV2';

const ROOT = join(__dirname, '..', '..', '..');
const CASES = [
  'paris-history-es.json', 'madrid-history-es.json', 'berlin-history-es.json',
].map((name) => loadNarrativeBenchmarkCaseV2(join(
  ROOT, 'fixtures', 'narrative-benchmark-v2', 'cases', name
)));

describe('Closed multi-city narrative cases v2', () => {
  it('loads Paris, Madrid, and Berlin through one generic contract', () => {
    expect(CASES.map((testCase) => [testCase.caseId, testCase.city])).toEqual([
      ['paris-history-es', 'París'],
      ['madrid-history-es', 'Madrid'],
      ['berlin-history-es', 'Berlín'],
    ]);
    expect(CASES.every((testCase) => testCase.theme === 'history'
      && testCase.language === 'es-ES')).toBe(true);
  });

  it('contains the exact three planned scenes and four official facts per scene', () => {
    expect(CASES.map((testCase) => testCase.scenes.map((scene) => scene.sceneId))).toEqual([
      ['notre-dame', 'louvre', 'palais-royal'],
      ['palacio-real', 'plaza-mayor', 'puerta-de-alcala'],
      ['checkpoint-charlie', 'reichstag', 'museumsinsel'],
    ]);
    expect(CASES.flatMap((testCase) => testCase.scenes)
      .every((scene) => scene.evidenceFacts.length === 4)).toBe(true);
  });

  it('stores original-language fragments, Spanish normalizations, dates, URLs, and hashes offline', () => {
    const facts = CASES.flatMap((testCase) => testCase.scenes)
      .flatMap((scene) => scene.evidenceFacts);
    expect(facts).toHaveLength(36);
    expect(facts.every((fact) => fact.originalExcerpt !== fact.normalizedEs)).toBe(true);
    expect(facts.every((fact) => ['de', 'en', 'es', 'fr'].includes(fact.originalLanguage))).toBe(true);
    expect(facts.every((fact) => fact.capturedAt === '2026-08-09T00:00:00.000Z')).toBe(true);
    expect(facts.every((fact) => /^[a-f0-9]{64}$/.test(fact.fingerprint))).toBe(true);
    expect(new Set(CASES.map(narrativeEvidenceProvenanceFingerprintV2)).size).toBe(3);
  });

  it('uses only the specified official source domains and builds valid v1 requests offline', () => {
    const hosts = new Set(CASES.flatMap((testCase) => testCase.scenes)
      .flatMap((scene) => scene.evidenceFacts)
      .map((fact) => new URL(fact.sourceUrl).hostname));
    expect(hosts).toEqual(new Set([
      'www.notredamedeparis.fr', 'presse.louvre.fr', 'www.domaine-palais-royal.fr',
      'www.patrimonionacional.es', 'patrimonioypaisaje.madrid.es',
      'www.berlin.de', 'www.bundestag.de', 'www.smb.museum',
    ]));
    expect(CASES.map((testCase) => buildNarrativeScriptRequestFromCaseV2(testCase).scenes.length))
      .toEqual([3, 3, 3]);
  });

  it('keeps every v2 engine module free of city literals and branches', () => {
    const modules = [
      'NarrativeClaimPlanV1.ts', 'NarrativeProseV2.ts', 'NarrativePilotCriticV2.ts',
      'NarrativePilotDeepSeekV2.ts', 'NarrativePilotGemmaV2.ts', 'AutonomousNarrativeV2.ts',
    ];
    const source = modules.map((name) => readFileSync(join(__dirname, name), 'utf8')).join('\n');
    expect(source).not.toMatch(/paris|madrid|berlin|parís|madrile|berlín/i);
  });
});
