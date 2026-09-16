import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface NarrativeTemporalRuleV8 { text: string; fingerprint: string }

export function narrativeAuthorAssetRootV8(): string {
  const bundled = resolve(__dirname, '../../docs/operations');
  return process.env.NARRATIVE_AUTHOR_ASSET_ROOT
    || (existsSync(bundled) ? bundled : resolve(__dirname, '../../../docs/operations'));
}

export function parseNarrativeTemporalRuleV8(document: string): NarrativeTemporalRuleV8 {
  const start = '<!-- temporal-rule:start -->', end = '<!-- temporal-rule:end -->';
  if (document.split(start).length !== 2 || document.split(end).length !== 2
    || document.indexOf(end) < document.indexOf(start)) throw new Error('Invalid temporal rule boundaries');
  const text = document.slice(document.indexOf(start) + start.length, document.indexOf(end)).trim();
  if (!text) throw new Error('Empty temporal rule');
  return { text, fingerprint: createHash('sha256').update(text).digest('hex') };
}

export function loadNarrativeTemporalRuleV8(root = narrativeAuthorAssetRootV8()): NarrativeTemporalRuleV8 {
  return parseNarrativeTemporalRuleV8(readFileSync(resolve(root, '../tours/regla-editorial-fechas-audioguias.md'), 'utf8'));
}

export function activeNarrativeTemporalRuleV8(): NarrativeTemporalRuleV8 | null {
  const mode = process.env.NARRATIVE_TEMPORAL_RULE;
  if (!mode || mode === 'off') return null;
  if (mode !== 'selected') throw new Error('NARRATIVE_TEMPORAL_RULE must be off or selected');
  return loadNarrativeTemporalRuleV8();
}
