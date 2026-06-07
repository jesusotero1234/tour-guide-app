# LocationPicker Component

A React component that integrates OpenStreetMap for location selection with city and country information.

## Installation

1. Install required dependencies:
```bash
npm install leaflet react-leaflet leaflet-geosearch
```

2. Add type definitions:
```bash
npm install --save-dev @types/leaflet
```

## Component Structure

```
LocationPicker/
├── index.tsx        # Main component
├── MapComponent.tsx # Map implementation with Leaflet
├── MapEvents.tsx    # Map event handlers
├── SearchBox.tsx    # Location search with suggestions
└── README.md       # This file
```

## Usage

```tsx
import { LocationPicker } from '@/components/form/LocationPicker';
import { LocationData } from '@/types/api';

function MyComponent() {
  const handleLocationChange = (location: LocationData) => {
    console.log('Selected location:', location);
    // {
    //   city: 'Madrid',
    //   country: 'Spain',
    //   coordinates: { lat: 40.416775, lng: -3.703790 }
    // }
  };

  return (
    <LocationPicker
      value={currentLocation}
      onChange={handleLocationChange}
      onError={(error) => console.error(error)}
    />
  );
}
```

## Features

- Map-based location selection
- Location search with autocomplete
- City and country information
- Reverse geocoding on map click
- Responsive design
- TypeScript support

## Dependencies

- react-leaflet: Map component and utilities
- leaflet: Core mapping library
- leaflet-geosearch: Location search and geocoding

## Notes

1. Ensure the Leaflet CSS is imported in your application:
```tsx
import 'leaflet/dist/leaflet.css';
```

2. Configure Next.js for Leaflet (next.config.mjs):
```js
const nextConfig = {
  transpilePackages: ['react-leaflet'],
};
```

3. The component uses OpenStreetMap for map tiles and geocoding. Make sure to comply with their usage terms and attribution requirements.

## Customization

1. Default Location:
```tsx
<LocationPicker
  defaultCenter={[40.416775, -3.703790]} // Madrid
  defaultZoom={13}
/>
```

2. Custom Styling:
```tsx
<LocationPicker className="h-[500px] rounded-lg" />
```

3. Custom Marker:
```tsx
<LocationPicker
  markerIcon={{
    iconUrl: '/custom-marker.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
  }}
/>
```

## Error Handling

The component handles various error cases:
- Failed geocoding
- Network issues
- Invalid coordinates
- Search failures

Errors are passed to the onError callback for custom handling.
