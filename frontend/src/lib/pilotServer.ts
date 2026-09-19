import { readFile } from 'node:fs/promises';
import type { Language } from '@/types/api';
const noticeFields = ['hosting', 'processors', 'transfers', 'retention', 'legalBases', 'rights'] as const;
export interface PilotNotice {
  operatorName: string; contactEmail: string; hosting: string; processors: string;
  transfers: string; retention: string; legalBases: string; rights: string;
  contentLanguage: Language;
}
export async function readPilotNotice(language: Language = 'es'): Promise<PilotNotice | null> {
  try {
    if (!process.env.PILOT_NOTICE_FILE) return null;
    const text = await readFile(process.env.PILOT_NOTICE_FILE, 'utf8');
    if (text.length > 32768) return null;
    const data = JSON.parse(text);
    if (!['operatorName','contactEmail','hosting','processors','transfers','retention','legalBases','rights'].every(key => typeof data[key] === 'string' && data[key].trim())
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) return null;
    // Existing notices use Spanish. Only switch when every legal section is translated.
    const translation = data.translations?.[language];
    const complete = translation && noticeFields.every(key => typeof translation[key] === 'string' && translation[key].trim());
    const content = complete ? translation : data;
    return {
      operatorName: data.operatorName, contactEmail: data.contactEmail,
      ...Object.fromEntries(noticeFields.map(key => [key, content[key]])),
      contentLanguage: complete ? language : 'es',
    } as PilotNotice;
  } catch { return null; }
}
