# Tour Duration Feature Implementation Plan

## Problem Statement
Currently, the tour generation system has a hidden duration constraint of 120 minutes, but this is not exposed to users or properly managed throughout the generation pipeline. This causes tour generation failures and doesn't allow users to specify their available time.

## Implementation Plan

### Phase 1: Quick Fix (Immediate) - COMPLETED
Goal: Allow the system to function while we implement the complete solution.

✅ Modify the LLM pod's generation route to handle duration constraint more gracefully:
- Log a warning instead of failing when duration is exceeded
- Return all places without failing, even if total duration > requested duration
- Add a flag to indicate if duration was exceeded

### Phase 2: API Enhancement (Short-term) - IN PROGRESS
Goal: Expose duration as a parameter throughout the system.

Update API Types:
- Add duration field to TourRequest interface in both frontend and backend
- Update Swagger/OpenAPI docs to reflect the new parameter

Frontend Changes:
- Add duration parameter to API calls
- Pass the default value of 240 minutes until UI controls are added

Backend Changes:
- Pass duration parameter from controllers to orchestration service
- Forward duration parameter to LLM pod

### Phase 3: User Duration Control (Current Focus)
Goal: Allow users to control tour duration and optimize place selection.

API Updates:
- Add duration parameter to frontend and backend interfaces:
```typescript
// In frontend/src/types/api.ts
export interface TourRequest {
  city: string;
  country: string;
  theme: 'architecture' | 'history' | 'food';
  language: Language;
  duration?: number; // Optional with default of 240 minutes
}
```

LLM Pod Changes:
- Update default duration from 120 to 240 minutes
- Generate 8-10 places without strict duration validation
- Include estimated duration for each place

Verification Pod Enhancement:
- Assess importance of each place
- Return importance scores along with verification results

Orchestration Service Improvements:
- Implement intelligent place selection algorithm:
```typescript
function selectPlaces(places: VerifiedPlace[], maxDuration: number): SelectedPlace[] {
  // Sort by importance score (highest first)
  const sortedPlaces = [...places].sort((a, b) => b.importanceScore - a.importanceScore);
  
  const selected: SelectedPlace[] = [];
  let totalDuration = 0;
  
  for (const place of sortedPlaces) {
    if (totalDuration + place.estimatedDuration <= maxDuration) {
      selected.push(place);
      totalDuration += place.estimatedDuration;
    }
  }
  
  return selected;
}
```

### Phase 4: User Experience (Future)
Goal: Give users full control over tour duration.

Frontend UI Enhancement:
- Add duration selector in tour creation form
- Provide preset options (1h, 2h, 4h, 8h, full day)
- Show estimated walking/transit time between places

Dynamic Tour Adjustment:
- Allow users to add/remove places from generated tours
- Recalculate total duration in real-time
- Suggest additional places if time allows

## Documentation Updates
- Update API documentation with new duration parameter
- Document place selection algorithm and how it balances importance vs. time
- Update user guide to explain duration selection feature

## Technical Implementation Details

### Duration Calculation Logic
```typescript
// Example place selection algorithm
function selectPlaces(places: VerifiedPlace[], maxDuration: number): SelectedPlace[] {
  // Sort by importance score (highest first)
  const sortedPlaces = [...places].sort((a, b) => b.importanceScore - a.importanceScore);
  
  const selected: SelectedPlace[] = [];
  let totalDuration = 0;
  
  for (const place of sortedPlaces) {
    if (totalDuration + place.estimatedDuration <= maxDuration) {
      selected.push(place);
      totalDuration += place.estimatedDuration;
    }
  }
  
  return selected;
}
```

### Default Values
- Default duration: 240 minutes (4 hours)
- Minimum duration: 60 minutes (1 hour)
- Maximum duration: 480 minutes (8 hours)
