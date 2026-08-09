import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  NarrativeBenchmarkCaseV2,
  NarrativeSourceFactV2,
  buildNarrativeScriptRequestFromCaseV2,
  loadNarrativeBenchmarkCaseV2,
  narrativeBenchmarkRouteFingerprintV2,
  narrativeEvidenceProvenanceFingerprintV2,
  narrativeSourceFactFingerprintV2,
  validateNarrativeBenchmarkCaseV2,
} from './NarrativeBenchmarkCaseV2';
import { validateNarrativeScriptRequestV1 } from './NarrativePilotV1';

function fact(sceneId: string, index: number): NarrativeSourceFactV2 {
  const content = {
    factId: `${sceneId}-fact-${index}`,
    ownerCanonicalId: `unknown-owner-${sceneId}`,
    originalExcerpt: `Fragmento original ${index} de ${sceneId}`,
    originalLanguage: 'zz',
    normalizedEs: `Hecho histórico ${index} normalizado para la escena ${sceneId}.`,
    sourceUrl: `https://official.example/${sceneId}`,
    sourceTitle: `Archivo oficial ${sceneId}`,
    capturedAt: '2026-08-09T00:00:00.000Z',
  };
  return { ...content, fingerprint: narrativeSourceFactFingerprintV2(content) };
}

function syntheticCase(): NarrativeBenchmarkCaseV2 {
  const routeSceneIds = ['xanadu-one', 'xanadu-two', 'xanadu-three'];
  const scenes = routeSceneIds.map((sceneId, index) => ({
    sceneId,
    name: `Lugar X ${index + 1}`,
    routePosition: index + 1,
    previousSceneId: routeSceneIds[index - 1] ?? null,
    nextSceneId: routeSceneIds[index + 1] ?? null,
    contribution: `Contribución desconocida ${index + 1}`,
    allowedProperNouns: ['Xanadú', `Lugar X ${index + 1}`],
    evidenceFacts: [1, 2, 3, 4].map((factIndex) => fact(sceneId, factIndex)),
  }));
  const value = {
    schemaVersion: 'narrative-benchmark-case-v2' as const,
    caseId: 'xanadu-history-es',
    city: 'Xanadú',
    theme: 'history' as const,
    language: 'es-ES' as const,
    promise: 'Comprender tres lugares desconocidos mediante evidencia cerrada.',
    centralQuestion: '¿Cómo cambió esta ciudad desconocida?',
    routeFingerprint: '',
    routeSceneIds,
    scenes,
  };
  value.routeFingerprint = narrativeBenchmarkRouteFingerprintV2(value);
  return value;
}

describe('NarrativeBenchmarkCaseV2', () => {
  it('builds the preserved v1 request from an unknown city without engine changes', () => {
    const testCase = validateNarrativeBenchmarkCaseV2(syntheticCase());
    const request = buildNarrativeScriptRequestFromCaseV2(testCase);

    expect(validateNarrativeScriptRequestV1(request)).toEqual(request);
    expect(request).toMatchObject({
      language: 'es-ES',
      routeSceneIds: ['xanadu-one', 'xanadu-two', 'xanadu-three'],
      scenes: [
        { sceneId: 'xanadu-one', previousSceneId: null, nextSceneId: 'xanadu-two' },
        { sceneId: 'xanadu-two', previousSceneId: 'xanadu-one', nextSceneId: 'xanadu-three' },
        { sceneId: 'xanadu-three', previousSceneId: 'xanadu-two', nextSceneId: null },
      ],
    });
  });

  it('keeps original fragment, language, Spanish normalization, URL, date, and fingerprint', () => {
    const testCase = validateNarrativeBenchmarkCaseV2(syntheticCase());
    expect(testCase.scenes[0].evidenceFacts[0]).toEqual(expect.objectContaining({
      originalExcerpt: 'Fragmento original 1 de xanadu-one',
      originalLanguage: 'zz',
      normalizedEs: 'Hecho histórico 1 normalizado para la escena xanadu-one.',
      sourceUrl: 'https://official.example/xanadu-one',
      capturedAt: '2026-08-09T00:00:00.000Z',
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('maps Spanish normalizations to v1 excerpts with independent fact fingerprints', () => {
    const testCase = syntheticCase();
    const request = buildNarrativeScriptRequestFromCaseV2(testCase);
    const source = testCase.scenes[0].evidenceFacts[0];
    const mapped = request.scenes[0].evidenceFacts[0];

    expect(mapped.excerpt).toBe(source.normalizedEs);
    expect(mapped.fingerprint).not.toBe(source.fingerprint);
    expect(mapped).not.toHaveProperty('originalExcerpt');
    expect(mapped).not.toHaveProperty('originalLanguage');
  });

  it('rejects changed source provenance fingerprints', () => {
    const changed = syntheticCase();
    changed.scenes[0].evidenceFacts[0].originalExcerpt += ' alterado';
    expect(() => validateNarrativeBenchmarkCaseV2(changed)).toThrow('source fact fingerprint');
  });

  it('rejects changed route fingerprints and invalid route neighbours', () => {
    const changedRoute = syntheticCase();
    changedRoute.scenes[0].name += ' alterado';
    expect(() => validateNarrativeBenchmarkCaseV2(changedRoute)).toThrow('route fingerprint');

    const changedNeighbour = syntheticCase();
    changedNeighbour.scenes[1].previousSceneId = null;
    changedNeighbour.routeFingerprint = narrativeBenchmarkRouteFingerprintV2(changedNeighbour);
    expect(() => validateNarrativeBenchmarkCaseV2(changedNeighbour)).toThrow('route neighbours');
  });

  it('loads the same generic JSON contract from disk', () => {
    const directory = mkdtempSync(join(tmpdir(), 'narrative-case-v2-'));
    const path = join(directory, 'unknown-city.json');
    const value = syntheticCase();
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

    expect(loadNarrativeBenchmarkCaseV2(path)).toEqual(value);
  });

  it('fingerprints provenance independently from route and generated request evidence', () => {
    const original = syntheticCase();
    const saved = narrativeEvidenceProvenanceFingerprintV2(original);
    const changed = structuredClone(original);
    changed.scenes[0].evidenceFacts[0].originalExcerpt += ' cambio permitido para comparar';
    const { fingerprint: _old, ...content } = changed.scenes[0].evidenceFacts[0];
    changed.scenes[0].evidenceFacts[0].fingerprint = narrativeSourceFactFingerprintV2(content);

    expect(narrativeEvidenceProvenanceFingerprintV2(changed)).not.toBe(saved);
    expect(changed.routeFingerprint).toBe(original.routeFingerprint);
  });
});
