import templates from './tour-cue-templates.json';

/**
 * Link clips between stops (plan 03). They depend on the destination, not on where the visitor comes from:
 * `first:<placeId>` after the introduction, `next:<placeId>` after any other stop, `finish` at the end.
 * The wording lives in tour-cue-templates.json, shared with the Python tooling; changing it needs no code change
 * (the user validates it before the render, README decision 1).
 */
export type CueKind = 'first' | 'next' | 'finish';
export const CUE_LANGUAGES = ['es', 'en', 'fr', 'de', 'it'] as const;

const table = templates as Record<string, Record<CueKind, string>>;

export function cueText(kind: CueKind, language: string, name?: string): string {
  const row = table[language];
  if (!row) throw new Error('No link-clip templates for language ' + language);
  const template = row[kind];
  if (kind === 'finish') return template;
  const place = name?.trim();
  if (!place) throw new Error('A place name is required for ' + kind + ' clips');
  return template.split('{name}').join(place);
}

export interface CueManifestEntry { kind: CueKind; placeId?: string; text: string; version: string }

/** N first, N next and one finish, each once, for exactly the stops of the tour. */
export function completeCueManifest(manifest: unknown, placeIds: string[]): manifest is CueManifestEntry[] {
  if (!Array.isArray(manifest) || manifest.length !== placeIds.length * 2 + 1) return false;
  const seen = new Set<string>();
  for (const entry of manifest as Array<Partial<CueManifestEntry>>) {
    if (!entry || !['first', 'next', 'finish'].includes(entry.kind as string)) return false;
    if (typeof entry.text !== 'string' || !entry.text.trim() || typeof entry.version !== 'string' || !/^[a-f0-9.]+$/.test(entry.version)) return false;
    const key = entry.kind === 'finish' ? 'finish' : entry.kind + ':' + entry.placeId;
    if (entry.kind === 'finish' ? entry.placeId !== undefined : !placeIds.includes(entry.placeId as string)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
