import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { audioIdentity, type AudioIdentity } from '../AudioProvenance';
import { tourProjectRoot } from '../LocalVoxCpmRenderer';

/** The voice that renders a language here, computed from the same files the backend uses to compute rendererKey. */
export function voiceIdentity(language: string): AudioIdentity {
  const presetPath = resolve(process.env.VOXCPM_PRESET_PATH || join(tourProjectRoot(), `pods/voxcpm-pod/presets/guide-${language}-a.json`));
  const presetBytes = readFileSync(presetPath);
  const preset = JSON.parse(presetBytes.toString('utf8')) as { reference: string };
  return audioIdentity(presetBytes, readFileSync(resolve(dirname(presetPath), preset.reference)));
}
