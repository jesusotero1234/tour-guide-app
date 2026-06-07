# Audio URL Proxy and Fast Refresh Loop Fix

This technical note documents fixes for two issues in the Tour Guide App:

1. Audio playback error: "Failed to load because no supported source was found"
2. Continuous Fast Refresh rebuilding cycle

## Audio URL Issues

### Problem

The audio playback was failing because:

- Backend was generating internal container URLs like `http://host.containers.internal:3006/audio/place/<uuid>`
- These URLs aren't directly accessible from the browser
- The frontend needs proper Supabase storage URLs

### Solution

We implemented a three-part fix:

#### 1. Backend: Orchestration Service Fix

Changed the `getAudioUrlForPlace` method in `orchestrationService.ts` from a hardcoded URL to:

```typescript
private async getAudioUrlForPlace(placeId: string): Promise<string> {
  try {
    // Fetch the actual audio data from Supabase pod, which contains the public URL
    const response = await axios.get(`${this.supabaseServiceUrl}/audio/place/${placeId}`);
    
    if (response.data?.success && response.data?.data?.length > 0) {
      // Use the Supabase public URL
      return response.data.data[0].url;
    }
    
    return '';
  } catch (error) {
    console.error(`Failed to fetch audio URL for place ${placeId}:`, error);
    return '';
  }
}
```

And updated the `retrieveTour` method to correctly handle the async nature of this function using `Promise.all`.

#### 2. Frontend: URL Validation and Fallback in PlaceCard

Added URL validation and fallback mechanisms in the `PlaceCard` component:

```typescript
const isValidAudioUrl = (url: string): boolean => {
  if (!url) return false;
  
  // Valid URL patterns include Supabase storage URLs or properly formed HTTP URLs
  return url.includes('supabase.co/storage') || 
         url.startsWith('https://') || 
         url.startsWith('http://');
};

const getEffectiveAudioUrl = (): string => {
  if (isValidAudioUrl(place.audioUrl)) {
    return place.audioUrl;
  }
  
  // Extract the place ID from the URL and use our proxy endpoint
  const placeIdMatch = place.audioUrl.match(/\/audio\/place\/([^/]+)/);
  if (placeIdMatch && placeIdMatch[1]) {
    return `/api/audio/${placeIdMatch[1]}`;
  }
  
  return '';
};
```

#### 3. Next.js API Route for Audio Proxying

Created a new API route to proxy audio requests:

- File: `frontend/src/app/api/audio/[id]/route.ts`
- This endpoint fetches audio metadata from the Supabase pod
- Then redirects to the actual Supabase storage URL
- Acts as a compatibility layer between internal and external URLs

## Fast Refresh Loop Issue

### Problem

The Next.js development server was stuck in a continuous rebuild cycle, shown by repeated logs:

```
[Fast Refresh] done in 2661ms
[Fast Refresh] rebuilding
[Fast Refresh] done in 2407ms
```

### Potential Causes and Solutions

1. **Circular Dependencies**:
   - Check for components importing each other that might cause circular updates
   - Use more controlled component state management

2. **Filesystem Watchers**:
   - Add a `.next/cache` to your `.gitignore` file
   - Configure Next.js to ignore certain directories in your project config

3. **State Update Loops**:
   - Look for `useEffect` hooks that might trigger infinite update cycles
   - Ensure effects have proper dependency arrays
   - Avoid state updates during render

4. **Next.js Development Server Configuration**:
   - Try a clean rebuild with `npm run build && npm run start` instead of `npm run dev`
   - Add the following to your `next.config.js`:
   
```js
module.exports = {
  // Existing config...
  webpack: (config, { isServer }) => {
    // Add optimization options
    config.optimization.minimize = false; // Speeds up build times
    
    return config;
  },
  webpackDevMiddleware: (config) => {
    // Reduce watch polling to lessen CPU load
    config.watchOptions = {
      ...config.watchOptions,
      poll: 1000, // Check every second instead of constantly
      aggregateTimeout: 300, // Delay rebuild for 300ms after file change
    };
    return config;
  },
};
```

5. **Container Resources**:
   - The continuous rebuilds might indicate resource contention between containers
   - Consider running fewer containers during development

## Testing the Fixes

1. **Audio URL Fix**: Visit a tour details page and verify:
   - Audio plays correctly
   - Error handling works when audio is unavailable
   - Console doesn't show "Failed to load because no supported source was found" errors

2. **Fast Refresh Loop**: Monitor your development console:
   - Rebuilds should only happen when files are actually changed
   - No continuous rebuild spam in the console
   - Check the Next.js build outputs for any persistent errors
