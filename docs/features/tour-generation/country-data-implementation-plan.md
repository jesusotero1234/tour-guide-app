# Country Data Implementation Plan

## Overview

This document outlines the plan to fix the current API path issue and implement a consistent approach for passing country information throughout the tour guide application.

## Current Issue

The application is experiencing a 400 Bad Request error when the backend orchestration service calls the verification pod. There are two main issues:

1. **Incorrect API Path**: The backend was using `/places/verify` instead of `/verify/place`.
2. **Missing Required Fields**: The verification pod expects country and countryCode in the request, but these are not being passed properly.

## Implementation Plan

### Phase 1: API Path Fix (Immediate Solution)

1. ✅ **Update the orchestrationService endpoint path**
   - Change `/places/verify` to `/verify/place` in orchestrationService.ts

### Phase 2: Country Data Flow Implementation

1. **Update `TourRequest` Type**
   - Modify the TourRequest interface in `backend/src/types/api.ts` to make country and countryCode required fields

2. **Implement Parallel Verification with Complete Location Data**
   - Update the `verifyPlaces` method in `orchestrationService.ts` to:
     - Process each place in parallel with Promise.all()
     - Include complete location data (city, country, countryCode) in each request
     - Handle the responses appropriately

3. **Propagate Country Data to Other Pods**
   - Update the methods for other pods to include country data where relevant

### Phase 3: Frontend Changes (Future Work)

1. **Ensure Frontend Sends Complete Location Data**
   - Update the form component to pass country and countryCode
   - Use geocoding data that's already selected by the user

## Data Flow

```
Frontend (User selects location)
  |
  | (city, country, countryCode)
  ▼
Backend Controller
  |
  | (city, country, countryCode)
  ▼
Orchestration Service
  |
  |─────┬─────┬─────┬─────┐
  ▼     ▼     ▼     ▼     ▼
LLM   Verify  Desc  TTS  Storage
Pod    Pod    Pod   Pod    Pod
```

## Implementation Timeline

- Phase 1: Immediate implementation (this PR)
- Phase 2: Immediate implementation (this PR)
- Phase 3: Future work
