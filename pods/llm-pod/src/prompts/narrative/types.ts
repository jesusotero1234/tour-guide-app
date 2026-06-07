export interface LongNarrativeSeeds {
  wikipediaLead?: string | null;
  wikipediaBody?: string | null;
  wikidataClaims?: Record<string, string> | null;
  osmTags?: Record<string, string>;
  wikivoyage?: string | null;
  enrichedContext?: string | null;
}

export interface LongNarrativePromptInput {
  localName: string;
  seeds: LongNarrativeSeeds;
  theme: string;
  language: string;
  nextStopName?: string;
  position: 'first' | 'middle' | 'last';
  retry?: boolean;
  seedQuality?: 'rich' | 'thin';
  targetWords?: string;
  cityName?: string;
  totalStops?: number;
  tourDurationMinutes?: number;
}

export interface SectionPrompt {
  system: string;
  user: string;
}

export function languageName(language: string): string {
  const code = language.slice(0, 2).toLowerCase();
  return ({
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
  } as Record<string, string>)[code] || language;
}

export function sectionSystem(language: string, retry = false, seedQuality: 'rich' | 'thin' = 'rich', targetWords = '70 to 90'): string {
  const targetLanguage = languageName(language);
  const thinGuard = seedQuality === 'thin'
    ? 'The public record is limited: say that clearly, use only provided tags/claims, and do not introduce countries, wars, dates, people, or events that are not present in the provided facts.'
    : '';
  return [
    `You are a warm, knowledgeable local guide leading a walking tour. You sound human, observant, and grounded, as if you know the city well and want the visitor to notice details they might otherwise miss. Write only in ${targetLanguage}.`,
    `The requested language code is ${language}; every sentence in the section must be ${targetLanguage}.`,
    'Write in present tense, directly addressing the visitor as "you" when natural. Use vivid but precise language: materials, light, scale, street sound, texture, atmosphere, or the feeling of standing there.',
    'Use a guide-like rhythm. Phrases such as "Notice how...", "Look up and you can see...", or "Imagine..." are welcome when they fit, but never force them.',
    'If facts support it, turn history into a micro-story with a clear human or civic stake rather than a dry list. If facts are thin, be honest and make the observation about visible or recorded cues.',
    'Connect the section to the tour theme so the stop feels like part of one walk, not an isolated encyclopedia note.',
    'Good style example: {"section":"Notice how the pale stone catches the afternoon light, making the doorway feel larger than it first appears. That quiet sense of ceremony is exactly why this stop belongs in our architecture walk: the building does not need to shout to show how the city wanted to present itself."}',
    'Avoid generic tourist filler such as "must-see destination", "steeped in history", or "hidden gem" unless concrete provided facts make the phrase meaningful.',
    'Use only the facts provided. Do not invent dates, people, events, coordinates, addresses, or statistics.',
    thinGuard,
    `Return strict JSON only: {"section":"your ${targetWords} word section"}.`,
    retry ? `Previous output failed quality checks. Rewrite in ${targetLanguage}, be specific, avoid generic tourist filler, avoid repetition, and stay close to the requested word range.` : '',
  ].filter(Boolean).join(' ');
}

export function compactRecord(record?: Record<string, string> | null): string {
  if (!record || Object.keys(record).length === 0) return 'none';
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
    .slice(0, 1200);
}
