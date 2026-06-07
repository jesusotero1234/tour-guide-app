# Audio Enhancements Implementation

This technical document outlines the implementation plan and code changes for three key audio enhancements in the Tour Guide App:

1. Audio URL Handling Fix
2. Audio Playback Order Enhancement 
3. Enhanced Audio Player Implementation

## 1. Audio URL Handling Fix

### Problem
The current implementation attempts to generate audio URLs in two places:
- Backend: `orchestrationService.ts` uses a method to fetch URLs that might not exist yet
- Frontend: `PlaceCard.tsx` tries to transform internal container URLs to public URLs

This results in inconsistent URL formats and audio playback failures.

### Solution
Simplify the flow by letting Supabase handle URL generation consistently:

1. In `orchestrationService.ts`:
   - Modify the `generateAudio` method to directly use the Supabase public URLs returned after upload
   - Remove URL transformation logic that's no longer needed

2. In `retrieveTour` method:
   - Use the Supabase storage URLs directly from the database instead of trying to generate new ones

### Code Changes

#### In `orchestrationService.ts`:

```typescript
private async generateAudio(places: any[], language: string): Promise<any[]> {
  const placesWithAudio = [];
  
  // Maintain the position index for proper audio ordering
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    try {
      // Add position information for proper sequencing
      const position = i;
      const isFirst = i === 0;
      const isLast = i === places.length - 1;
      
      // Validate place has an ID
      if (!place.id) {
        console.error(`Place ${place.name} has no ID, skipping audio generation`);
        placesWithAudio.push({
          ...place,
          audioUrl: '',
          position
        });
        continue;
      }
      
      // Step 1: Generate audio with TTS pod
      console.log(`Generating audio for place: ${place.name} (position: ${position})`);
      const ttsResponse = await axios.post(`${this.ttsServiceUrl}/tts/generate`, {
        text: place.description,
        language,
        metadata: {
          position,
          isFirst,
          isLast,
          placeName: place.name
        }
      });
      
      // Step 2: Upload audio to Supabase storage with position information
      console.log(`Uploading audio to Supabase for place: ${place.name}`);
      const uploadResponse = await axios.post(`${this.supabaseServiceUrl}/audio`, {
        place_id: place.id,
        language: language || 'en',
        format: ttsResponse.data.format || 'wav',
        audioData: ttsResponse.data.audioData,
        metadata: { 
          source: 'tts-service',
          placeId: place.id,
          placeName: place.name,
          position,
          isFirst,
          isLast
        }
      });
      
      // Use Supabase URL directly from upload response
      if (uploadResponse.data?.success && uploadResponse.data?.data?.url) {
        console.log(`Audio uploaded successfully for ${place.name}, URL: ${uploadResponse.data.data.url}`);
        placesWithAudio.push({
          ...place,
          audioUrl: uploadResponse.data.data.url,
          position
        });
      } else {
        console.error(`Failed to upload audio to Supabase for ${place.name}`, uploadResponse.data?.error);
        placesWithAudio.push({
          ...place,
          audioUrl: '',
          position
        });
      }
    } catch (error) {
      console.error(`Audio processing error for ${place.name}:`, error);
      placesWithAudio.push({
        ...place,
        audioUrl: '',
        position: i
      });
    }
  }
  
  return placesWithAudio;
}
```

#### In `retrieveTour` method:
```typescript
async retrieveTour(id: string): Promise<TourResponse> {
  try {
    const response = await axios.get(`${this.supabaseServiceUrl}/tours/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to retrieve tour');
    }
    
    const tourData = response.data.data;
    
    // Get all places with their associated audio URLs at once
    const placesResponse = await axios.get(`${this.supabaseServiceUrl}/places/tour/${id}/with-audio`);
    
    if (!placesResponse.data.success) {
      throw new Error(placesResponse.data.error?.message || 'Failed to retrieve places');
    }
    
    // Places come with their audio URLs directly from Supabase
    const places = placesResponse.data.data;
    
    // Sort places by position to maintain proper order
    places.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
    
    // Map to the expected format
    return {
      id: tourData.id,
      city: tourData.city,
      theme: tourData.theme,
      language: tourData.language,
      places: places.map((place: any) => ({
        id: place.id,
        name: place.name,
        description: place.description,
        coordinates: place.coordinates,
        audioUrl: place.audio_url || '',
        position: place.position || 0
      })),
      route: places.map((place: any) => place.coordinates),
      created_at: tourData.created_at
    };
  } catch (error) {
    console.error('Error retrieving tour:', error);
    throw new Error(`Failed to retrieve tour: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

## 2. Audio Playback Order Enhancement

### Problem
Audio files aren't being properly ordered, causing them to play out of sequence (e.g., goodbye message appearing first).

### Solution
1. Save places with explicit position information in the database
2. Include position data in the audio metadata
3. Retrieve places in the correct order based on their position

### Code Changes

#### In `saveTour` method:

```typescript
private async saveTour(tourData: any): Promise<any> {
  try {
    // Step 1: Create tour first without places
    const tourResponse = await axios.post(`${this.supabaseServiceUrl}/tours`, {
      tour: {
        city: tourData.city,
        theme: tourData.theme,
        language: tourData.language,
        metadata: {
          ...tourData.metadata,
          placeCount: tourData.places.length
        }
      }
    });
    
    if (!tourResponse.data || !tourResponse.data.success) {
      throw new Error(tourResponse.data?.error?.message || 'Unknown storage error');
    }
    
    const tourId = tourResponse.data.data.id;
    console.log(`Created tour with ID: ${tourId}`);
    
    // Step 2: Now create places with the tour ID and position information
    const placesWithIds = [];
    for (let i = 0; i < tourData.places.length; i++) {
      const place = tourData.places[i];
      const position = i;
      const isFirst = i === 0;
      const isLast = i === tourData.places.length - 1;
      
      try {
        // Create a properly formatted place object with position
        const placeData = {
          tour_id: tourId,
          name: place.name,
          description: place.description,
          lat: place.coordinates.lat,
          lng: place.coordinates.lng,
          position: position, // Explicit position in sequence
          importance_score: isFirst || isLast ? 0.9 : (place.importance_score || 0.5),
          metadata: {
            isFirst,
            isLast,
            position
          }
        };
        
        console.log(`Creating place: ${place.name} for tour: ${tourId} at position: ${position}`);
        const placeResponse = await axios.post(`${this.supabaseServiceUrl}/places`, {
          place: placeData
        });
        
        if (placeResponse.data && placeResponse.data.success) {
          placesWithIds.push({
            ...place,
            id: placeResponse.data.data.id,
            position
          });
          console.log(`Created place with ID: ${placeResponse.data.data.id} at position: ${position}`);
        } else {
          console.error(`Failed to create place: ${place.name}`, placeResponse.data?.error);
          placesWithIds.push({
            ...place,
            position
          });
        }
      } catch (placeError) {
        console.error(`Error creating place: ${place.name}`, placeError);
        placesWithIds.push({
          ...place,
          position
        });
      }
    }
    
    // Return the tour with places that have IDs and positions
    return {
      success: true,
      data: {
        id: tourId,
        places: placesWithIds
      }
    };
  } catch (error) {
    console.error('Storage service error:', error);
    throw new Error(`Storage service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

## 3. Enhanced Audio Player Implementation

### Requirements
Replace the simple audio button with a full-featured audio player that includes:
- Visual timeline/progress bar
- Time display (current/total)
- Volume control
- Playback speed options
- Visual feedback and better UX

### Implementation

#### Create new `AudioPlayer.tsx` component:

```tsx
import React, { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  onError?: (error: string) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, title, onError }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  // Initialize audio element
  useEffect(() => {
    if (!audioUrl) {
      if (onError) onError('No audio URL provided');
      setIsLoading(false);
      return;
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    // Setup event listeners
    const setAudioData = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    
    const setAudioTime = () => {
      setCurrentTime(audio.currentTime);
    };
    
    const handleAudioEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    
    const handleAudioError = (e: ErrorEvent) => {
      console.error('Audio error:', e);
      setIsLoading(false);
      if (onError) onError(`Failed to load audio: ${e.message || 'Unknown error'}`);
    };
    
    // Add event listeners
    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleAudioEnd);
    audio.addEventListener('error', handleAudioError as EventListener);
    
    // Cleanup function
    return () => {
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleAudioEnd);
      audio.removeEventListener('error', handleAudioError as EventListener);
      
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, [audioUrl, onError]);
  
  // Handle play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(error => {
          console.error('Error playing audio:', error);
          if (onError) onError(`Failed to play audio: ${error.message}`);
        });
    }
  };
  
  // Handle seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    
    const seekTime = Number(e.target.value);
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };
  
  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    
    const newVolume = Number(e.target.value);
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
  };
  
  // Handle playback rate change
  const handlePlaybackRateChange = (rate: number) => {
    if (!audioRef.current) return;
    
    audioRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };
  
  // Format time to mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-100 p-4 rounded-lg shadow-sm w-full">
      {title && <div className="text-sm font-medium mb-2 text-gray-700">{title}</div>}
      
      {/* Progress bar */}
      <div className="flex items-center mb-3">
        <span className="text-xs text-gray-500 w-12">{formatTime(currentTime)}</span>
        <div className="mx-2 flex-grow">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={isLoading}
            className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <span className="text-xs text-gray-500 w-12">{formatTime(duration)}</span>
      </div>
      
      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className={`p-2 rounded-full ${isLoading ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
          
          {/* Volume Control */}
          <div className="hidden sm:flex items-center space-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={handleVolumeChange}
              className="w-16 h-1 bg-gray-300 rounded-lg appearance-none"
            />
          </div>
        </div>
        
        {/* Playback Speed */}
        <div className="flex items-center">
          <select
            value={playbackRate}
            onChange={(e) => handlePlaybackRateChange(Number(e.target.value))}
            className="text-xs bg-white border border-gray-300 rounded px-1 py-0.5"
          >
            <option value={0.5}>0.5x</option>
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
        </div>
      </div>
    </div>
  );
};
```

#### Update the PlaceCard component to use AudioPlayer:

```tsx
import { Place, Language } from '@/types/api';
import { useState } from 'react';
import { AudioPlayer } from './AudioPlayer';

interface PlaceCardProps {
  place: Place;
  language: Language;
}

export const PlaceCard = ({ place, language }: PlaceCardProps) => {
  const [audioError, setAudioError] = useState<string | null>(null);

  // Split description into paragraphs for better readability
  const paragraphs = place.description.split('\n\n').filter(p => p.trim().length > 0);

  const handleAudioError = (error: string) => {
    setAudioError(error);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4">
      {/* Enhanced heading with larger font */}
      <h3 className="text-2xl font-bold text-gray-900 mb-4 border-b pb-2">
        {place.name}
      </h3>
      
      {/* Description with better formatting */}
      <div className="mb-6 space-y-4">
        {paragraphs.map((paragraph, i) => (
          <p key={i} className="text-gray-600 leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="flex flex-col space-y-4">
        <div className="flex flex-col sm:items-center justify-between">
          <div className="flex flex-col mb-3">
            <div className="font-medium text-gray-700 mb-1">Location</div>
            <div className="text-sm text-gray-500">
              {place.coordinates.lat.toFixed(6)}, {place.coordinates.lng.toFixed(6)}
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-2 w-fit">
              {language.toUpperCase()}
            </span>
          </div>
          
          {/* Audio Player */}
          <div className="w-full">
            <AudioPlayer 
              audioUrl={place.audioUrl || ''}
              title={`Audio guide for ${place.name}`}
              onError={handleAudioError}
            />
          </div>
        </div>

        {/* Audio error message */}
        {audioError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {audioError}
            </div>
            <div className="mt-2 text-xs text-red-600">
              Try refreshing the page or check your internet connection.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

## Implementation Approach

To implement these changes, follow this sequence:

1. Backend (Fix URL & Ordering):
   - Update the `orchestrationService.ts` file first with position information
   - Modify `generateAudio` to use Supabase URLs directly
   - Fix `saveTour` to include position data
   - Update `retrieveTour` to get sorted places with audio

2. Frontend (Audio Player):
   - Create the new `AudioPlayer.tsx` component
   - Update `PlaceCard.tsx` to use the new audio player
   - Remove URL transformation logic that's no longer needed

3. Testing:
   - Generate a new tour to check if places are saved with proper position data
   - Verify audio files play in the correct sequence
   - Test the audio player controls to ensure they work properly

## Benefits

1. **Consistent Audio URLs**: URLs come directly from Supabase, avoiding translation errors
2. **Proper Audio Sequence**: Places are ordered correctly via explicit position indexes
3. **Enhanced User Experience**: New audio player provides better controls and feedback
4. **Maintainability**: Cleaner separation of concerns between backend and frontend

## Fallback Plan

If issues arise with the audio player implementation, the basic audio functionality can be restored by:
1. Reverting PlaceCard.tsx to previous version but keeping the URL handling fixes
2. Keeping the backend position ordering improvements

This ensures the core functionality will work while allowing for incremental improvements to the UI.
