import { readFile } from 'node:fs/promises';
export interface PilotNotice {
  operatorName: string; contactEmail: string; hosting: string; processors: string;
  transfers: string; retention: string; legalBases: string; rights: string;
}
export async function readPilotNotice(): Promise<PilotNotice | null> {
  try {
    if (!process.env.PILOT_NOTICE_FILE) return null;
    const text = await readFile(process.env.PILOT_NOTICE_FILE, 'utf8');
    if (text.length > 32768) return null;
    const data = JSON.parse(text);
    if (!['operatorName','contactEmail','hosting','processors','transfers','retention','legalBases','rights'].every(key => typeof data[key] === 'string' && data[key].trim())
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) return null;
    return Object.fromEntries(['operatorName','contactEmail','hosting','processors','transfers','retention','legalBases','rights'].map(key => [key, data[key]])) as unknown as PilotNotice;
  } catch { return null; }
}
