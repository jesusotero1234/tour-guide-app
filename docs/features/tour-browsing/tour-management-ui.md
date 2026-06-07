# Tour Browsing & Management UI

This document describes the Tour Browsing features implemented in the Tour Guide App, which allow users to browse, search, and view previously generated tours.

## Overview

The Tour Browsing feature enhances the app's functionality by providing:

1. A dedicated page for listing and browsing available tours
2. Filtering and search capabilities
3. Individual tour detail views
4. Seamless navigation between tour generation and browsing

This feature complements the existing tour generation capability, allowing users to access and reuse tours they've previously created.

## Feature Components

### 1. Tours Listing Page

![Tours Listing Page](https://placeholder.com/tours-listing.png)

The Tours page (`/tours`) provides a comprehensive view of all available tours with:

- **Grid Layout**: A responsive card-based grid displaying tour previews
- **Search Box**: Filter tours by city, theme, or language
- **Metadata Display**: Each card shows key information (city, country, theme, language, creation date, stop count)

**Key Components:**
- `ToursList.tsx`: Main container component that manages API requests and rendering
- `SearchBox.tsx`: Search and filter interface
- `TourCard.tsx`: Individual tour preview cards

### 2. Tour Detail Page

The Tour Detail page (`/tours/[id]`) displays a specific tour, reusing the existing `PlaceList` component for consistency. It includes:

- **Navigation**: "Back to Tours" button for easy return to the listing
- **Tour Information**: City, country, theme, language
- **Stop Details**: List of stops with descriptions and audio playback
- **Same UX**: Maintains the same user experience as the existing tour view

### 3. Navigation

The enhanced Header component now includes navigation links to:
- Generate Tour (Home page)
- Browse Tours (Tours listing page)

## Technical Implementation

### State Management

Zustand store has been extended to handle:
- Currently viewed tour
- Available tours list 
- Search/filter parameters
- Loading states and error handling

```typescript
// Key added state:
availableTours: Tour[];
searchParams: TourListParams;
```

### API Interface

The API client has been extended with:

```typescript
// Fetch multiple tours with optional filtering
async function listTours(params?: TourListParams): Promise<Tour[]>
```

This connects to the existing backend API endpoints at:
- `GET /api/v1/tours` - List with optional filtering  
- `GET /api/v1/tours/:id` - Individual tour retrieval

### Component Hierarchy

```
App
├── Header (with navigation)
├── Home/Generator Page
│   └── TourForm / PlaceList
└── Tours Browsing
    ├── Tours Page
    │   ├── SearchBox
    │   └── ToursList
    │       └── TourCard × n
    └── Tour Detail Page
        └── PlaceList
            └── PlaceCard × n
```

## User Experience Flow

1. **Creating a Tour**: User generates a tour through the home page form
2. **Browsing Tours**: User navigates to the Tours page to see all available tours
3. **Filtering**: User can filter the tours by city, theme, or language
4. **Tour Selection**: User clicks on a tour card to view details
5. **Tour Viewing**: User can view all stops, descriptions, and play audio content
6. **Navigation**: User can easily navigate back to the tours list or home page

## Future Extensions

### Map Integration

A future enhancement will include a map view for tours:
- Toggle between list view and map view
- Display pins for each stop with coordinates
- Interactive navigation to see details when clicking a pin

Implementation approach:
- Add a tab interface in the mobile view
- Integrate with Leaflet (already configured in the app)
- Use the existing coordinates from the tour data

## API Usage

The feature uses these endpoints from the existing API:

- `GET /api/v1/tours` - List with filtering
  - Parameters: city, theme, language, limit, offset
  - Example: `/api/v1/tours?city=Barcelona&theme=history`
  - *Note: See [Tour Browsing API Connectivity](../../technical-notes/tour-browsing-api-connectivity.md) for details on how this endpoint was implemented*

- `GET /api/v1/tours/:id` - Get tour by ID
  - Example: `/api/v1/tours/abc123`

## Data Schema

Tours are represented using the existing Tour interface:

```typescript
interface Tour {
  id: string;
  city: string;
  country: string;
  theme: string;
  language: Language;
  places: Place[];
  created_at: string;
}
```

## Getting Started

To use the Tour Browsing feature:

1. Navigate to the "Browse Tours" link in the header
2. Use the search box to filter by city, theme, or language
3. Click on any tour card to view its details
4. Use the "Back to Tours" link to return to the listing

## Development Notes

Key files:
- `/frontend/src/app/tours/page.tsx` - Tours listing page
- `/frontend/src/app/tours/[id]/page.tsx` - Tour detail page
- `/frontend/src/components/tours/` - Tour-related components
- `/frontend/src/lib/api.ts` - API interface
- `/frontend/src/lib/store.ts` - Zustand store
