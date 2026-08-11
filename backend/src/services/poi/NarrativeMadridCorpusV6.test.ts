import { readFileSync } from 'fs';
import path from 'path';
import reference from '../../../fixtures/narrative-madrid-v6/reference.json';
import {
  auditNarrativeMadridCorpusV6,
  loadNarrativeMadridDocumentsV6,
  validateNarrativeMadridCorpusV6,
} from './NarrativeMadridCorpusV6';

describe('Madrid narrative v6 reference corpus', () => {
  it('freezes all approved dossiers, scripts and ledgers with an intact global arc', () => {
    const manifest = validateNarrativeMadridCorpusV6(reference);
    const documents = loadNarrativeMadridDocumentsV6(
      manifest,
      (relativePath) => readFileSync(path.resolve(process.cwd(), '..', relativePath), 'utf8')
    );
    const audit = auditNarrativeMadridCorpusV6(manifest, documents);

    expect(manifest.developmentStopIds).toEqual([
      'palace', 'almudena', 'villa', 'mayor', 'cibeles',
    ]);
    expect(manifest.validationStopIds).toEqual(['sol', 'alcala']);
    expect(audit.verifiedDocuments).toBe(21);
    expect(audit.hardWarnings).toEqual([]);
    expect(audit.repeatedPassages).toEqual([]);
    expect(audit.stops.every((stop) => stop.estimatedSeconds >= 120
      && stop.estimatedSeconds <= 210)).toBe(true);
    expect(audit.corpusFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not leak validation-stop repairs into the development decision corpus', () => {
    const manifest = validateNarrativeMadridCorpusV6(reference);
    const development = new Set(manifest.developmentStopIds);

    expect(manifest.decisions.every((decision) => (
      decision.sourceStopIds.every((stopId) => development.has(stopId))
    ))).toBe(true);
  });

  it('rejects a changed document until its human fingerprint is renewed', () => {
    const manifest = validateNarrativeMadridCorpusV6(reference);

    expect(() => loadNarrativeMadridDocumentsV6(manifest, (relativePath) => (
      relativePath.endsWith('/palace/script.md')
        ? 'Texto cambiado sin gate humano.'
        : readFileSync(path.resolve(process.cwd(), '..', relativePath), 'utf8')
    ))).toThrow('palace script fingerprint mismatch');
  });
});
