import manifestJson from '../../../fixtures/narrative-madrid-v6/reference.json';
import {
  auditNarrativeMadridCorpusV6,
  loadNarrativeMadridDocumentsV6,
  validateNarrativeMadridCorpusV6,
} from './NarrativeMadridCorpusV6';
import {
  buildMadridNarrativeArcV6,
  buildMadridNarrativeRouteBriefV6,
  buildTrustedMadridDossiersV6,
  extractApprovedMadridScriptV6,
} from './NarrativeMadridTrustedFixturesV6';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { narrativeFingerprintV6 } from './NarrativeContractsV6';

describe('narrative v6 trusted Madrid fixtures', () => {
  const manifest = validateNarrativeMadridCorpusV6(manifestJson);
  const documents = loadNarrativeMadridDocumentsV6(
    manifest,
    (path) => readFileSync(resolve(process.cwd(), '..', path), 'utf8')
  );

  it('materializes immutable human dossiers and route without leaking holdout into decisions', () => {
    expect(auditNarrativeMadridCorpusV6(manifest, documents).hardWarnings).toEqual([]);
    const route = buildMadridNarrativeRouteBriefV6(manifest);
    const dossiers = buildTrustedMadridDossiersV6(manifest, documents);

    expect(route.stops).toHaveLength(7);
    expect(dossiers).toHaveLength(7);
    expect(dossiers.every((dossier) => dossier.sufficiency.isSufficient)).toBe(true);
    expect(dossiers.find((dossier) => dossier.stopId === 'palace')?.propositions).toHaveLength(10);
    expect(dossiers.find((dossier) => dossier.stopId === 'palace')?.authorizedNumbers)
      .toEqual(expect.arrayContaining(['15', '1561', '1734', '1735', '1736', '1993']));
    expect(dossiers.find((dossier) => dossier.stopId === 'palace')?.authorizedNames.join(' '))
      .toContain('Corte');
    expect(dossiers.find((dossier) => dossier.stopId === 'cibeles')?.limits.join(' '))
      .toContain('sin convertir a Carlos III en sujeto directo de un encargo de Aranda');
    const palace = manifest.stops.find((stop) => stop.stopId === 'palace');
    expect(dossiers.find((dossier) => dossier.stopId === 'palace')?.fingerprint).toBe(
      narrativeFingerprintV6({
        dossierFingerprint: palace?.dossier.sha256,
        ledgerFingerprint: palace?.ledger.sha256,
      })
    );
    expect(buildMadridNarrativeArcV6(manifest).stops).toHaveLength(7);
    expect(extractApprovedMadridScriptV6(documents.palace.script)).toContain(
      'Estás frente al Palacio Real'
    );
  });
});
