# Frontend MVP Documentation

## Overview
The frontend MVP is a streamlined version of the tour guide application focused on core functionality: tour generation and display with basic audio playback.

## Technical Stack
- Next.js 14+ with TypeScript
- Tailwind CSS for styling
- React Query for API data fetching
- Zustand for minimal state management

## Project Structure
```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx             # Home page with tour generation form
│   │   └── tour/[id]/page.tsx   # Tour display page
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Select.tsx
│   │   │
│   │   ├── form/
│   │   │   ├── TourForm.tsx     # Tour generation form
│   │   │   └── ThemeSelect.tsx  # Theme dropdown component
│   │   │
│   │   ├── tour/
│   │   │   ├── PlaceCard.tsx    # Individual place display
│   │   │   ├── PlaceList.tsx    # List of places in tour
│   │   │   └── AudioPlayer.tsx  # Basic audio playback
│   │   │
│   │   └── layout/
│   │       └── Header.tsx       # Simple application header
│   │
│   ├── types/
│   │   └── api.ts              # TypeScript interfaces for API
│   │
│   ├── lib/
│   │   ├── api.ts              # API integration functions
│   │   └── store.ts            # Zustand store configuration
│   │
│   └── styles/
│       └── globals.css         # Global styles and Tailwind
│
├── public/
│   └── assets/                 # Static assets like icons
│
└── tailwind.config.js         # Tailwind configuration
```

## API Integration

### Request Structure
```typescript
type Language = 'en' | 'es' | 'fr' | 'de' | 'it';

interface LocationData {
  city: string;
  country: string;
  coordinates: {
    lat: number;
    lng: number;
  }
}

interface TourRequest {
  city: string;
  country: string;
  theme: 'architecture' | 'history' | 'food';
  language: Language;
}
```

### Response Structure
```typescript
interface Tour {
  id: string;
  city: string;
  theme: string;
  places: Place[];
}

interface Place {
  id: string;
  name: string;
  description: string;
  audioUrl: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}
```

## Implementation Phases

### Phase 1: Project Setup (Completed)
1. Initialize Next.js project with TypeScript ✓
2. Configure Tailwind CSS ✓
3. Set up project structure ✓
4. Configure ESLint and Prettier ✓

### Phase 2: Core Components (Completed)
1. Implement common components ✓
   - Button component
   - Input component
   - Select component
   - Language selector
2. Create TourForm component with: ✓
   - Form layout and validation
   - Theme selection
   - Language selection

### Phase 3: Location Selection (Completed) ✓
1. LocationPicker Implementation
   ```typescript
   components/
   └── form/
       ├── LocationPicker/
       │   ├── index.tsx         # Main component
       │   ├── MapComponent.tsx  # Map with markers
       │   ├── MapEvents.tsx     # Map click handlers
       │   ├── SearchBox.tsx     # Location search
       │   └── README.md        # Usage documentation
       └── TourForm.tsx
   ```

2. Features Implemented:
   - Interactive map with OpenStreetMap ✓
   - Location search with city/country ✓
   - Geocoding integration ✓
   - Marker placement and updates ✓
   - Responsive design ✓
   - TypeScript support ✓

3. Data Integration:
   - Location state management ✓
   - Form validation for locations ✓
   - Coordinate handling ✓
   - Error handling ✓

### Phase 4: Tour Display
1. Enhanced PlaceCard component ✓
   - Place information display
   - Language indicator
   - Audio controls
2. Implement PlaceList with: ✓
   - Tour summary with country
   - Language display
   - Place cards list

### Phase 5: Audio Integration
1. AudioPlayer component features:
   - Play/Pause controls ✓
   - Progress tracking
   - Language-specific audio handling

## Dependencies

### Current Dependencies
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "tailwindcss": "^3.0.0",
    "zustand": "^4.0.0",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "leaflet-geosearch": "^3.8.0"
  }
}
```

### To Add
```json
{
  "dependencies": {
    "react-leaflet": "^4.2.1",
    "leaflet": "^1.9.4",
    "leaflet-geosearch": "^3.8.0"
  }
}
```

## State Management

### Zustand Store Structure
```typescript
interface TourStore {
  currentTour: Tour | null;
  isLoading: boolean;
  error: string | null;
  location: LocationData | null;
  setTour: (tour: Tour) => void;
  clearTour: () => void;
  setLocation: (location: LocationData) => void;
}
```

## Component Examples

### LocationPicker
```typescript
interface LocationPickerProps {
  value?: LocationData;
  onChange: (location: LocationData) => void;
  onError?: (error: string) => void;
}

// Handles map display and location selection
```

### Tour Form
```typescript
interface TourFormProps {
  onSubmit: (data: TourRequest) => void;
  isLoading: boolean;
}

// Combines LocationPicker, theme, and language selection
```

### Place Card
```typescript
interface PlaceCardProps {
  place: Place;
  isPlaying: boolean;
  onPlayPause: () => void;
}

// Displays place information and audio controls
```

## Styling Guidelines

### Color Palette
```css
:root {
  --primary: #007bff;
  --secondary: #6c757d;
  --background: #ffffff;
  --text: #333333;
  --error: #dc3545;
}
```

### Responsive Breakpoints
```css
/* Tailwind default breakpoints */
sm: '640px'
md: '768px'
lg: '1024px'
xl: '1280px'
```

## Future Enhancements (Post-MVP)
1. Place images and galleries
2. Advanced audio features (playlist, speed control)
3. Offline support
4. PWA implementation
5. User accounts and saved tours
6. Social sharing features

## Development Guidelines
1. Mobile-first approach
2. Accessibility compliance
3. Performance optimization
4. Error handling
5. Loading states

## API Contract

### Tour Generation

#### Request
```http
POST /api/tours/generate
Content-Type: application/json
```

```typescript
{
  "city": string,
  "theme": "architecture" | "history" | "food"
}
```

Example:
```json
{
  "city": "Barcelona",
  "theme": "architecture"
}
```

#### Response
```typescript
{
  "id": string,
  "city": string,
  "theme": string,
  "places": [
    {
      "id": string,
      "name": string,
      "description": string,
      "audioUrl": string,
      "coordinates": {
        "lat": number,
        "lng": number
      }
    }
  ]
}
```

Example:
```json
{
  "id": "tour_123",
  "city": "Barcelona",
  "theme": "architecture",
  "places": [
    {
      "id": "place_1",
      "name": "Sagrada Familia",
      "description": "Antoni Gaudí's masterpiece...",
      "audioUrl": "https://api.example.com/audio/sagrada-familia.mp3",
      "coordinates": {
        "lat": 41.4036,
        "lng": 2.1744
      }
    }
  ]
}
```

### Error Responses

```typescript
{
  "error": {
    "code": string,
    "message": string
  }
}
```

Example:
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "City is required"
  }
}
```
