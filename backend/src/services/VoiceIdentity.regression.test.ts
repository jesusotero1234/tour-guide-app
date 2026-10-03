import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tourProjectRoot } from './LocalVoxCpmRenderer';

/**
 * presetSha256 and referenceSha256 are part of rendererKey (TourAudioService.snapshot). The backend reads the preset from the
 * repository on every request, so editing a preset or its reference WAV changes rendererKey for that language: all of its
 * audio stops validating and its tours leave the API until the audio is regenerated (plan 02 section 2.6).
 * If this test fails you changed a voice file. That is only acceptable as part of a deliberate regeneration.
 */
const VOICES: Record<string, { reference: string; preset: string; referenceSha256: string }> = {
  es: { reference: 'guide-es-a.wav', preset: '67dbd1447aa4fa254f1954a363aa6073c3518523cfc6555f84949195764c0ff6', referenceSha256: '475753e08fe9bb194991fd4d7b50b62a0d65d9e371b94db43a28567160ab65bb' },
  en: { reference: 'guide-en-a.wav', preset: '6ab0b25fcff235e4db1c6199b046bcbe2c3f5a25eb2321c12777daa8e6fd8bbf', referenceSha256: 'baa4820e4f130c8593157436fd8df83feb6fa74b392317799f9c1912ec40ce8e' },
  fr: { reference: 'guide-fr-recovered.wav', preset: '539bb5a679dbd8c9f29943b3419cb49d6763dd5a53b397e0649fef27b80d8fd8', referenceSha256: 'ef2f9dbdf01a3b396cc7a23367e1d92401950ae5a1736f2281870c964fe47154' },
  de: { reference: 'guide-de-a.wav', preset: '5babb270628901bda3c053e8686c754ce77f6b50e87bc12db059a2a8fc7bcb75', referenceSha256: 'be60e102576be4449c189468310e43945021927a3396da4a2a4019c210a0c779' },
  it: { reference: 'guide-it-a.wav', preset: '20ce4b9a26cf6c0cd3486e6a83e3aa8318ebe13e2d942a9f73e7247f90fa17fb', referenceSha256: 'c0e9b8008b8524e0ea91c39531a493fc9ad4d42b2dbc364a320af1275d793534' },
};
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('the production voices never change bytes', () => {
  const presets = join(tourProjectRoot(), 'pods/voxcpm-pod/presets');
  it.each(Object.keys(VOICES))('%s preset and reference', language => {
    const voice = VOICES[language];
    const presetFile = join(presets, `guide-${language}-a.json`);
    expect(sha(presetFile)).toBe(voice.preset);
    expect(JSON.parse(readFileSync(presetFile, 'utf8')).reference).toBe(voice.reference);
    expect(sha(join(presets, voice.reference))).toBe(voice.referenceSha256);
  });
});
