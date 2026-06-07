# City Filtering Fix

## Issue

The tour browsing feature wasn't properly filtering tours when users typed a city name in the search box. Even though the frontend was correctly sending the city filter parameter to the backend, the filtering wasn't working.

## Root Cause Analysis

### Issue 1: Missing Query Parameters
The first issue was identified in the backend's tours controller (`backend/src/api/controllers/tours.ts`) within the `listTours` function. While the controller was correctly extracting filter parameters from the request query, it was not passing these parameters to the Supabase pod which handles the actual database filtering.

```javascript
// Old implementation (bug)
// Extract filter parameters but don't use them
const filters = {
  city: req.query.city as string,
  theme: req.query.theme as string,
  language: req.query.language as string,
  limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
  offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
};

// Supabase pod call without query parameters
const response = await fetch(`${orchestrationService.getSupabaseServiceUrl()}/tours`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});
```

### Issue 2: Partial Matching Instead of Exact Matching
After fixing the first issue, we discovered a second issue: the Supabase pod was using partial text matching on the city field, which caused unexpected results. For example, searching for "Madrid" would also return tours for "Valencia" if the description contained the word "Madrid" somewhere.

```javascript
// In tourService.ts - partial matching allowing irrelevant results
if (params.city) {
  query = query.ilike('city', `%${params.city}%`); // Partial match
}
```

## Fix

### Fix for Issue 1: Adding Query Parameters
We modified the `listTours` controller to build a proper query string using the filters and include it in the request URL to the Supabase pod:

```javascript
// New implementation (fixed)
// Extract filter parameters
const filters = {
  city: req.query.city as string,
  theme: req.query.theme as string,
  language: req.query.language as string,
  limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
  offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
};

// Build query string from filters
const queryParams = new URLSearchParams();
if (filters.city) queryParams.append('city', filters.city);
if (filters.theme) queryParams.append('theme', filters.theme);
if (filters.language) queryParams.append('language', filters.language);
if (filters.limit) queryParams.append('limit', filters.limit.toString());
if (filters.offset) queryParams.append('offset', filters.offset.toString());

// Construct URL with query parameters
const queryString = queryParams.toString();
const url = `${orchestrationService.getSupabaseServiceUrl()}/tours${queryString ? `?${queryString}` : ''}`;

// Supabase pod call with query parameters
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});
```

### Fix for Issue 2: Using Case-Insensitive Exact Matching for City
Initially, we modified the Supabase tour service to use exact matches with the `eq` operator:

```javascript
// In tourService.ts - exact matching but case-sensitive
if (params.city) {
  query = query.eq('city', params.city); // Exact match, but case-sensitive
}
```

However, this introduced a case sensitivity issue - searching for "madrid" wouldn't match "Madrid" in the database. 

We further refined the solution to use case-insensitive exact matching with the `ilike` operator but without wildcards:

```javascript
// In tourService.ts - case-insensitive exact matching
if (params.city) {
  query = query.ilike('city', params.city); // Case-insensitive exact match
}
```

## Benefits of Backend Filtering

This fix ensures that filtering happens at the database level in the Supabase pod, which offers several advantages:

1. **Efficiency with large datasets**: As the tour collection grows, filtering at the database level is much more efficient than sending all tours to the frontend.

2. **Reduced network traffic**: Only filtered results are transferred over the network, saving bandwidth and improving load times.

3. **Database optimization**: Supabase can use indexes and query optimization for efficient filtering.

4. **Pagination compatibility**: Works properly with limit/offset parameters for efficient pagination of large result sets.

5. **Precise filtering**: Using exact matches for city names ensures users only see tours in the exact city they searched for.

6. **User-friendly search**: Case-insensitive matching means users can type "madrid", "Madrid", or "MADRID" and still find the same results.

## Verification

The fix can be verified by:

1. Navigate to the tours browsing page
2. Type a city name in the search box in any case (e.g., "madrid", "Madrid", or "MADRID")
3. Confirm that only tours in that exact city are displayed, regardless of how you capitalized the search term
4. Verify that a tour in "Valencia" doesn't appear when searching for "Madrid"
5. Check browser network requests to verify the backend is correctly forwarding query parameters

## Related Components

- **Frontend**: `frontend/src/components/tours/SearchBox.tsx` - Provides the city input
- **Frontend Store**: `frontend/src/lib/store.ts` - Manages search parameters state
- **Frontend API**: `frontend/src/lib/api.ts` - Sends requests with search parameters
- **Backend Controller**: `backend/src/api/controllers/tours.ts` - Forwards requests to Supabase pod
- **Supabase Pod**: `pods/supabase-pod/src/routes/tours.ts` - Receives requests and processes filters
- **Supabase Service**: `pods/supabase-pod/src/services/tourService.ts` - Implements database filtering logic

## Date Fixed

April 6, 2025
