# Audio Playback Error Handling

This document outlines the solution to the audio playback error: "Failed to load because no supported source was found" that was occurring in the tour guide app, as well as best practices for handling audio in web applications.

## Problem Description

Users were encountering an unhandled runtime error when attempting to play audio in the PlaceCard component:

```
Unhandled Runtime Error
Error: Failed to load because no supported source was found.
```

This error occurs when the browser's HTMLAudioElement attempts to load an audio file but fails due to various possible reasons:

- Invalid URL format
- Missing or inaccessible audio file
- CORS (Cross-Origin Resource Sharing) restrictions
- Unsupported audio format
- Network connectivity issues

## Solution Implemented

We implemented a more robust audio handling approach in the PlaceCard component with:

1. **Better Error Handling**: Added specific error states and user feedback
2. **Loading States**: Added visual indicator when audio is loading
3. **Resource Management**: Added cleanup on component unmount
4. **Enhanced UX**: Improved button states and error messaging

### Key Code Improvements

#### 1. Adding State Management

```typescript
// Added new state variables
const [audioError, setAudioError] = useState<string | null>(null);
const [isLoading, setIsLoading] = useState(false);
```

#### 2. Resource Cleanup

```typescript
// Clean up audio element when component unmounts
useEffect(() => {
  return () => {
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }
  };
}, [audioElement]);
```

#### 3. Proper Audio Element Creation and Error Handling

```typescript
// Create audio element with better error handling
const audio = new Audio();

// Add error handler before setting the source
audio.addEventListener('error', (e) => {
  console.error("Audio error:", e);
  setAudioError("Failed to load audio. Please try again later.");
  setIsPlaying(false);
  setIsLoading(false);
});

// Add loadeddata event to know when audio is ready
audio.addEventListener('loadeddata', () => {
  setIsLoading(false);
});

// Set source after adding event listeners
audio.src = place.audioUrl;
```

#### 4. Promise-Based Playback Handling

```typescript
// Use promise to better handle play failures
audio.play()
  .then(() => {
    setIsPlaying(true);
    setAudioError(null);
  })
  .catch(err => {
    console.error("Audio play failed:", err);
    setAudioError(`Couldn't play audio: ${err.message}`);
    setIsLoading(false);
  });
```

#### 5. Enhanced UI for Error States

```tsx
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
```

## Best Practices for Audio Handling in Web Apps

1. **Always Handle Errors**: The HTML Audio element can fail in various ways—always add error event listeners.

2. **Show Loading States**: Audio loading can take time, especially on slower connections. Provide visual feedback.

3. **Use Promise-Based API**: Modern browsers support Promise-based `play()` which allows for better error catching.

4. **Clean Up Resources**: Always clean up audio elements when they are no longer needed to prevent memory leaks.

5. **Consider Format Support**: Different browsers support different audio formats. Consider providing multiple formats:
   - MP3: Widely supported
   - AAC: Good for iOS
   - OGG: Open format with good quality
   - WAV: High quality but larger file size

6. **Preload Consideration**: For critical audio, consider preloading. For less critical content, use `preload="none"` to save bandwidth.

7. **Check CORS Settings**: Ensure your audio files are served with appropriate CORS headers if they come from a different domain.

## Related Components

- `PlaceCard.tsx`: The main component that handles audio playback
- `audioService.ts`: Service that manages audio file storage and retrieval in Supabase

## Future Improvements

1. **Multiple Format Support**: Consider generating and storing multiple formats of each audio file (MP3, OGG, WAV) for better browser compatibility.

2. **Audio Streaming**: For longer audio clips, implement streaming instead of full downloads.

3. **Audio Visualization**: Add waveform visualization for better user experience.

4. **Offline Support**: Implement caching for offline playback using the Cache API or Service Workers.
