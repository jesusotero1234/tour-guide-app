import { readFile } from 'node:fs/promises';
/** Operational attestations are supplied by the responsible person, never inferred from passing tests. */
export async function pilotLaunchReady(): Promise<boolean> {
  try {
    const path = process.env.PILOT_NOTICE_FILE;
    if (!path) return false;
    const bytes = await readFile(path, 'utf8');
    if (bytes.length > 32768) return false;
    const data = JSON.parse(bytes);
    const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
    return ['operatorName', 'contactEmail', 'hosting', 'processors', 'transfers', 'retention', 'legalBases', 'rights'].every(key => text(data[key]))
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)
      && data.launchReview?.acceptedForPilot === true
      && ['legalReference', 'voiceOriginReference', 'aiTransparencyReference'].every(key => text(data.launchReview[key]));
  } catch { return false; }
}
