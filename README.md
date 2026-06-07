# AI Tour Guide

AI Tour Guide is a mobile-first web app for generating walking audio tours.

Users choose a city, theme, language, and duration. The system generates a walkable route with verified points of interest, written narration, audio playback, and map support.

## Product Focus

The app is designed for people walking through a city while listening to a guided tour on their phone.

Core priorities:

- mobile-first experience,
- audio-first tour playback,
- verified real-world places,
- map support,
- generated narration,
- multilingual tours,
- low-cost and free map infrastructure where possible.

## Current Capabilities

- Generate city tours by location, theme, language, and duration.
- Browse previously generated tours.
- View tour stops on a map.
- Read generated descriptions.
- Play generated audio per stop.
- Navigate between stops.
- Restore the current stop after refresh for an active tour.

## Planned UX Improvements

See:

- `docs/features/mobile-tour-experience-plan.md`

Main upcoming improvements:

- real mobile tour mode,
- sticky audio controls and action surfaces,
- current location on map,
- distance to next stop,
- persisted tour progress,
- better generation progress,
- share and open-in-maps actions,
- PWA and offline foundation.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, Leaflet
- Backend: Node.js, Express, TypeScript
- Data: Supabase/PostgreSQL
- Maps/Data: OpenStreetMap, Nominatim, Overpass, Wikimedia/Wikidata
- AI: local and orchestrated LLM services
- Audio: TTS pipeline

## Local Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

### Backend

Refer to the development docs under:

- `docs/development/`
- `docs/operations/`

## Environment Variables

Frontend expects:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_API_KEY=development-api-key
```

## Important Notes

- The project is still MVP-stage.
- Offline support is planned but not fully implemented.
- Generated routes should not be treated as official navigation.
- Users should follow local signs, closures, crossings, and safety rules.

## Documentation

- `docs/README.md`
- `docs/architecture/`
- `docs/development/`
- `docs/features/`
- `docs/technical-notes/`
