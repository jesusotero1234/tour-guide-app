# API Response Structure

This document outlines the expected response structure for various API endpoints and how the frontend should handle them.

## Tour API Response Format

### List Tours Endpoint

When calling the `GET /api/v1/tours` endpoint, the response follows this structure:

```json
{
    "success": true,
    "data": {
        "tours": [
            {
                "id": "0c2e70a3-538f-444d-8cda-826d5c8202e6",
                "city": "Valencia",
                "theme": "history",
                "language": "en",
                "places": [...],
                "created_at": "2025-03-30T12:19:58.70359+00:00",
                "user_id": null,
                "metadata": {...}
            }
        ],
        "total": 1,
        "hasMore": false
    }
}
```

Important notes:
- The actual tours array is nested under `data.tours`
- Additional metadata like `total` and `hasMore` are siblings to the `tours` array
- The frontend accesses this with `data.data?.tours || []` in the API client

### Single Tour Endpoint

When retrieving a single tour via `GET /api/v1/tours/:id`, the response is a direct tour object:

```json
{
    "id": "0c2e70a3-538f-444d-8cda-826d5c8202e6",
    "city": "Valencia",
    "theme": "history",
    "language": "en",
    "places": [...],
    "created_at": "2025-03-30T12:19:58.70359+00:00",
    ...
}
```

## Common Issues

### Data Structure Mismatch

A common issue is when the frontend expects a different structure than what the backend provides. For example, with the tours listing:

- **Incorrect:** Accessing `data.data` directly when tours are actually in `data.data.tours`
- **Correct:** Access `data.data?.tours` with proper null-checking

This was fixed in the `listTours` function of the API client:

```javascript
// Before
const tours = data.data || [];

// After
const tours = data.data?.tours || [];
```

## Backend Response Standardization

For consistency, all API responses should follow this general structure:

```json
{
    "success": boolean,
    "data": {
        // Actual response data
    },
    "error": {
        "code": string,
        "message": string
    } // Only present on error
}
```

Endpoints that return collections should use this pattern:

```json
{
    "success": true,
    "data": {
        "items": [...], // The actual collection
        "total": number, // Total count of items
        "hasMore": boolean // Pagination indicator
    }
}
```
