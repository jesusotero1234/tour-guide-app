import { Place } from '@/types/api';
import { useState } from 'react';
import { AudioPlayer } from './AudioPlayer';

interface PlaceCardProps {
  place: Place;
  language?: string;
  onPlaybackStateChange?: (state: { isPlaying: boolean; isLoading: boolean; currentTime: number; duration: number }) => void;
}

export const PlaceCard = ({ place, language = 'en', onPlaybackStateChange }: PlaceCardProps) => {
  const [audioError, setAudioError] = useState<string | null>(null);

  // Function to get a usable audio URL - suitable for production and dev environments
  const getEffectiveAudioUrl = (): string => {
    if (!place.audioUrl) return '';
    
    // If it's already a valid URL (Supabase storage or https), use it directly
    if (place.audioUrl.includes('supabase.co/storage') || place.audioUrl.startsWith('https://')) {
      return place.audioUrl;
    }
    
    // In development, we might have a local URL like "http://host.containers.internal:3006/audio/place/[id]"
    if (place.audioUrl.includes('/audio/place/')) {
      const placeIdMatch = place.audioUrl.match(/\/audio\/place\/([^/]+)/);
      if (placeIdMatch && placeIdMatch[1]) {
        return `/api/audio/${placeIdMatch[1]}`;
      }
    }

    // Local backend audio URL (e.g. http://localhost:3001/audio/<placeId>-<lang>.wav).
    // Extract the full filename and proxy through Next.js to avoid CORS blocking
    // between different ports (3001 vs 3000).
    const localMatch = place.audioUrl.match(/\/audio\/([^/]+\.wav)$/);
    if (localMatch && localMatch[1]) {
      return `/api/audio/${localMatch[1]}`;
    }
    
    console.warn("Invalid audio URL format:", place.audioUrl);
    return '';
  };

  const handleAudioError = (error: string) => {
    setAudioError(error);
  };

  // Split description into paragraphs for better readability
  const paragraphs = place.description.split('\n\n').filter(p => p.trim().length > 0);

  // Get effective audio URL for this place
  const audioUrl = getEffectiveAudioUrl();

  const sectionOrder = ['arrival', 'history', 'significance', 'transition'];
  const sectionLabels: Record<string, Record<string, string>> = {
    en: { arrival: 'Arrival', history: 'Background', significance: 'Why It Matters', transition: 'Next' },
    es: { arrival: 'Llegada', history: 'Contexto', significance: 'A observar', transition: 'Siguiente parada' },
    fr: { arrival: 'Arrivée', history: 'Contexte', significance: 'À observer', transition: 'Étape suivante' },
    de: { arrival: 'Ankunft', history: 'Kontext', significance: 'Im Detail', transition: 'Nächste Station' },
    it: { arrival: 'Arrivo', history: 'Contesto', significance: 'Da osservare', transition: 'Tappa successiva' },
  };
  const labelLanguage = language.slice(0, 2).toLowerCase();
  const labels = sectionLabels[labelLanguage] || sectionLabels.en;
  const orderedSections = place.descriptionSections
    ? sectionOrder
        .map((key) => [key, place.descriptionSections?.[key]] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1]?.trim()))
    : [];

  return (
    <div className="mb-4 rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5 shadow-sm sm:p-6">
      <div className="mb-4 border-b border-darkBrown/15 pb-3">
        <h3 className="text-2xl font-serif font-bold text-darkBrown sm:text-[2rem]">
          {place.name}
        </h3>
        {place.nameInTourLanguage && (
          <p className="mt-1 font-serif text-sm italic text-darkBrown/60">
            {place.nameInTourLanguage}
          </p>
        )}
      </div>
      
      {place.imageUrl && (
        <div className="mx-auto mb-6 mt-6 w-full max-w-xl overflow-hidden rounded-2xl shadow-sm">
          <img 
            src={place.imageUrl} 
            alt={place.name}
            className="h-64 w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      
      <div className="mb-6 font-serif text-base leading-8 text-darkBrown">
        {orderedSections.length > 0 ? orderedSections.map(([key, text]) => (
          <div key={key} className="mt-4 first:mt-0">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-mutedGold">
              {labels[key] || key}
            </p>
            <p className="leading-8">{text}</p>
          </div>
        )) : paragraphs.map((paragraph, i) => (
          <p key={i} className={i === 0 ? 'leading-8' : 'mt-4 leading-8'}>
            {paragraph}
          </p>
        ))}
      </div>

      <div className="flex flex-col space-y-4 border-t border-darkBrown/15 pt-4">
        <div className="flex flex-col sm:items-center justify-between">
          <div className="w-full">
            <AudioPlayer 
              audioUrl={audioUrl}
              title={`Audio guide for ${place.name}`}
              onError={handleAudioError}
              onPlaybackStateChange={onPlaybackStateChange}
            />
          </div>
        </div>

        {audioError && (
          <div className="rounded-lg border border-danger/20 bg-danger-surface p-3 text-sm text-danger">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-5 w-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {audioError}
            </div>
            <div className="mt-2 text-xs text-danger/85">
              Try refreshing the page or check your internet connection.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
