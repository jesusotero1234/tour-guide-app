import { PoiEnrichmentSnapshot } from './PoiEnrichmentSnapshot';
import {
  NarrativeEvidenceRouteSceneV3,
  buildNarrativeEvidenceCaseFromWorkbenchV3,
  buildNarrativeEvidenceCaseFromOfficialFactsV3,
  compileNarrativeEvidenceSceneV3,
  selectNarrativeRouteEvidenceV3,
} from './NarrativeEvidenceV3';
import { WikimediaSourceRevisionV6 } from './EditorialProminenceV6';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import { WikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  loadNarrativeBenchmarkCaseV2,
  narrativeBenchmarkRouteFingerprintV2,
  narrativeSourceFactFingerprintV2,
} from './NarrativeBenchmarkCaseV2';
import { buildNarrativeScriptRequestV3 } from './NarrativeContractsV3';

function snapshot(body: string): PoiEnrichmentSnapshot {
  return {
    schemaVersion: 1,
    city: 'Ciudad Prueba',
    theme: 'history',
    language: 'es',
    capturedAt: '2026-08-10T10:00:00.000Z',
    wikidata: {
      Q900001: {
        wikidataId: 'Q900001',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q900001',
        nameTranslations: { es: 'Puerta de Prueba' },
        wikidataClaims: {
          inception: '1778-00-00',
          architect: 'Ana Pérez',
          instanceOf: 'puerta monumental',
        },
      },
    },
    wikipedia: {
      'es:Puerta de Prueba': {
        description: body.split('\n')[0],
        body,
        language: 'es',
        wikipediaUrl: 'https://es.wikipedia.org/wiki/Puerta_de_Prueba',
      },
    },
  };
}

const revisions: WikimediaSourceRevisionV6[] = [
  {
    sourceId: 'eswiki:Puerta de Prueba',
    project: 'es.wikipedia.org',
    title: 'Puerta de Prueba',
    revisionId: 123,
    revisionTimestamp: '2026-08-09T10:00:00.000Z',
  },
  {
    sourceId: 'wikidata:Q900001',
    project: 'www.wikidata.org',
    title: 'Q900001',
    revisionId: 456,
    revisionTimestamp: '2026-08-09T11:00:00.000Z',
  },
];

const routeScene = {
  sceneId: 'unknown-gate',
  name: 'Puerta de Prueba',
  ownerCanonicalId: 'Q900001',
  contribution: 'Explica cómo una entrada urbana se convirtió en monumento.',
};

describe('NarrativeEvidenceV3', () => {
  it('compiles exact Spanish excerpts and cross-backs sensitive historical facts', () => {
    const body = [
      'La puerta de piedra presenta cinco arcos visibles desde la plaza.',
      'Fue inaugurada en 1778 para ordenar la entrada a la ciudad.',
      'La arquitecta Ana Pérez dirigió la obra para el consejo municipal.',
    ].join('\n');

    const result = compileNarrativeEvidenceSceneV3({
      scene: routeScene,
      snapshot: snapshot(body),
      sourceRevisions: revisions,
    });

    expect(result.readiness).toEqual({
      ready: true,
      missingRoles: [],
      roleCounts: { observable: 1, historical: 1, human: 1 },
    });
    expect(result.evidenceFacts.map((fact) => fact.role)).toEqual([
      'observable', 'historical', 'human',
    ]);
    expect(result.evidenceFacts[1]).toMatchObject({
      originalExcerpt: 'Fue inaugurada en 1778 para ordenar la entrada a la ciudad.',
      normalizedEs: 'Fue inaugurada en 1778 para ordenar la entrada a la ciudad.',
      relationSupport: ['direct', 'chronology'],
      sensitive: true,
      allowsCausality: false,
    });
    expect(result.evidenceFacts[1].sources.map((source) => source.kind)).toEqual([
      'wikipedia', 'wikidata',
    ]);
    expect(result.evidenceFacts[1].sources[0]).toMatchObject({
      sourceId: 'eswiki:Puerta de Prueba',
      revisionId: '123',
      excerpt: 'Fue inaugurada en 1778 para ordenar la entrada a la ciudad.',
    });
    expect(result.evidenceFacts[1].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails readiness instead of inventing a missing human transformation', () => {
    const result = compileNarrativeEvidenceSceneV3({
      scene: routeScene,
      snapshot: snapshot([
        'La puerta de piedra presenta cinco arcos visibles desde la plaza.',
        'Fue inaugurada en 1778.',
      ].join('\n')),
      sourceRevisions: revisions,
    });

    expect(result.readiness.ready).toBe(false);
    expect(result.readiness.missingRoles).toContain('human');
    expect(result.evidenceFacts.every((fact) => fact.allowsCausality === false)).toBe(true);
  });

  it('selects a distributed three-scene route and substitutes unready scenes generically', () => {
    const ready = (sceneId: string): NarrativeEvidenceRouteSceneV3 => ({
      sceneId,
      name: sceneId,
      ownerCanonicalId: `Q-${sceneId}`,
      contribution: sceneId,
      evidenceFacts: [],
      readiness: {
        ready: true,
        missingRoles: [],
        roleCounts: { observable: 1, historical: 1, human: 1 },
      },
    });
    const unavailable = ready('unavailable');
    unavailable.readiness = {
      ready: false,
      missingRoles: ['human'],
      roleCounts: { observable: 1, historical: 1, human: 0 },
    };

    const selected = selectNarrativeRouteEvidenceV3([
      ready('first'), unavailable, ready('second'), ready('third'), ready('last'),
    ]);

    expect(selected.scenes.map((scene) => scene.sceneId)).toEqual(['first', 'third', 'last']);
    expect(selected.rejectedSceneIds).toEqual(['unavailable']);
  });

  it('rejects a route with fewer than three evidence-ready scenes', () => {
    const result = compileNarrativeEvidenceSceneV3({
      scene: routeScene,
      snapshot: snapshot('La puerta de piedra presenta cinco arcos visibles desde la plaza.'),
      sourceRevisions: revisions,
    });

    expect(() => selectNarrativeRouteEvidenceV3([result, result]))
      .toThrow('requires at least three evidence-ready scenes');
  });

  it('builds the Madrid pilot case from generic route and source snapshots', () => {
    const root = join(__dirname, '..', '..', '..');
    const workbench = JSON.parse(readFileSync(join(
      root, 'fixtures', 'editorial-v7', 'madrid-history-es-120.json'
    ), 'utf8')) as EditorialWorkbenchV7;
    const sources = JSON.parse(readFileSync(join(
      root, 'fixtures', 'sources', 'madrid-history-es.json'
    ), 'utf8')) as PoiEnrichmentSnapshot;
    const core = JSON.parse(readFileSync(join(
      root, 'fixtures', 'editorial-v6', 'core', 'editorial-core-v6-madrid-20260807-e',
      'madrid-history-es-120.json'
    ), 'utf8')) as { prominence: WikimediaProminenceSnapshotV6 };

    const result = buildNarrativeEvidenceCaseFromWorkbenchV3(
      workbench, sources, core.prominence
    );

    expect(result.caseId).toBe('madrid-history-es-120:narrative-v3');
    expect(result.language).toBe('es-ES');
    expect(result.scenes.map((scene) => scene.sceneId)).toEqual([
      'palace', 'mayor', 'alcala',
    ]);
    expect(result.scenes.every((scene) => scene.readiness.ready)).toBe(true);
    expect(result.scenes.every((scene) => scene.evidenceFacts.length === 3)).toBe(true);
    expect(result.routeFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sourceSnapshotFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('loads all calibration cities through one official-fact compiler without city branches', () => {
    const root = join(__dirname, '..', '..', '..');
    const cases = ['paris', 'madrid', 'berlin'].map((city) => (
      loadNarrativeBenchmarkCaseV2(join(
        root, 'fixtures', 'narrative-benchmark-v2', 'cases', `${city}-history-es.json`
      ))
    ));

    const compiled = cases.map(buildNarrativeEvidenceCaseFromOfficialFactsV3);

    expect(compiled.map((value) => value.city)).toEqual(['París', 'Madrid', 'Berlín']);
    expect(compiled.every((value) => value.scenes.length === 3)).toBe(true);
    expect(compiled.every((value) => value.scenes.every((scene) => (
      scene.readiness.ready
      && scene.evidenceFacts.map((fact) => fact.role).join(',') === 'observable,historical,human'
    )))).toBe(true);
  });

  it('is invariant to official-fact order and accepts a fourth city with unknown IDs', () => {
    const root = join(__dirname, '..', '..', '..');
    const original = loadNarrativeBenchmarkCaseV2(join(
      root, 'fixtures', 'narrative-benchmark-v2', 'cases', 'madrid-history-es.json'
    ));
    const permuted = structuredClone(original);
    permuted.scenes.forEach((scene) => scene.evidenceFacts.reverse());
    const originalCompiled = buildNarrativeEvidenceCaseFromOfficialFactsV3(original);
    const permutedCompiled = buildNarrativeEvidenceCaseFromOfficialFactsV3(permuted);
    expect(permutedCompiled.scenes.map((scene) => scene.evidenceFacts.map((fact) => ({
      role: fact.role, text: fact.normalizedEs,
    })))).toEqual(originalCompiled.scenes.map((scene) => scene.evidenceFacts.map((fact) => ({
      role: fact.role, text: fact.normalizedEs,
    }))));

    const unknown = structuredClone(original);
    unknown.caseId = 'xanadu-history-es';
    unknown.city = 'Xanadú';
    unknown.routeSceneIds = ['obelisk-x', 'forum-y', 'gate-z'];
    unknown.scenes.forEach((scene, index) => {
      scene.sceneId = unknown.routeSceneIds[index];
      scene.name = `Lugar desconocido ${index + 1}`;
      scene.previousSceneId = unknown.routeSceneIds[index - 1] ?? null;
      scene.nextSceneId = unknown.routeSceneIds[index + 1] ?? null;
      scene.evidenceFacts.forEach((fact, factIndex) => {
        fact.factId = `${scene.sceneId}-fact-${factIndex + 1}`;
        fact.ownerCanonicalId = `QX-${index + 1}`;
        const { fingerprint: _fingerprint, ...content } = fact;
        fact.fingerprint = narrativeSourceFactFingerprintV2(content);
      });
    });
    unknown.routeFingerprint = narrativeBenchmarkRouteFingerprintV2(unknown);

    const request = buildNarrativeScriptRequestV3(
      buildNarrativeEvidenceCaseFromOfficialFactsV3(unknown)
    );
    expect(request.city).toBe('Xanadú');
    expect(request.routeSceneIds).toEqual(['obelisk-x', 'forum-y', 'gate-z']);
  });
});
