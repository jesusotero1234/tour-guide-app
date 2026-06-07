# Country Data Flow Implementation

## Overview

This document describes the implementation of country data flow throughout the tour guide application. The goal was to ensure that country and country code information is consistently passed from the frontend to the backend and through to all microservices.

## Changes Made

### 1. API Type Definitions

- Updated `TourRequest` interface in both frontend and backend to include `countryCode` field:
  - `tour-guide-app/frontend/src/types/api.ts`
  - `tour-guide-app/backend/src/types/api.ts`

- Updated `LocationData` interface in the frontend to include `countryCode` field:
  - `tour-guide-app/frontend/src/types/api.ts`

### 2. Geocoding Service

- Updated `NominatimResult` interface to include `country_code` in the `address` property:
  - `tour-guide-app/frontend/src/services/geocoding.ts`

- Modified the `searchCities` function to extract and return the country code:
  ```typescript
  return {
    city: cityName || result.display_name.split(",")[0].trim(),
    country: result.address.country,
    countryCode: result.address.country_code.toUpperCase(), // Convert to uppercase to match ISO standard
    coordinates: {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    },
  };
  ```

### 3. Tour Form Component

- Updated the Tour Form to include `countryCode` in the request:
  ```typescript
  const tourRequest: TourRequest = {
    city: location.city,
    country: location.country,
    countryCode: location.countryCode, // Include the countryCode from location data
    theme: theme as Theme,
    language,
    duration: parseInt(duration)
  };
  ```

### 4. Orchestration Service

- Added a property to store the current request context:
  ```typescript
  private currentRequest?: TourRequest;
  ```

- Updated `generateCompleteTour` to store the current request:
  ```typescript
  this.currentRequest = request;
  ```

- Modified `generateInitialPlaces` to pass country information to the LLM pod:
  ```typescript
  const country = this.currentRequest?.country || "Spain";
  const countryCode = this.currentRequest?.countryCode || "ES";

  const response = await axios.post(`${this.llmServiceUrl}/generate/places`, {
    city,
    country,
    countryCode,
    // ...other fields
  });
  ```

- Updated `verifyPlaces` to use parallel requests with complete location data:
  ```typescript
  const verificationPromises = places.map(place => 
    axios.post(`${this.verificationServiceUrl}/verify/place`, {
      name: place.name,
      coordinates: place.coordinates,
      city: city,
      country: country,
      countryCode: countryCode
    })
  );
  ```

## Data Flow Diagram

```
Frontend
  |
  | Location selected with:
  | - city
  | - country
  | - countryCode
  ▼
Backend Controller
  |
  | TourRequest contains:
  | - city
  | - country
  | - countryCode
  ▼
Orchestration Service
  |
  | currentRequest stores TourRequest
  | with complete location data
  |─────┬─────┬─────┬─────┐
  ▼     ▼     ▼     ▼     ▼
LLM   Verify  Desc  TTS  Storage
Pod    Pod    Pod   Pod    Pod
  |
  | Each pod receives:
  | - city
  | - country 
  | - countryCode
```

## Benefits

- **Data Integrity**: Consistent country information across all services
- **Better Accuracy**: Correct country identification for place verification
- **Improved Localization**: Language and cultural adaptations based on country
- **Country-Specific Formatting**: Proper formatting of addresses, phone numbers, etc.

## Future Improvements

- Add more comprehensive country-specific adaptations in description generation
- Implement country-specific voice selection in the TTS pod
- Add region/state information for more precise location context
