# AI Tour Guide Frontend

This is the Next.js frontend for AI Tour Guide.

It provides:

- tour generation form,
- city search and autocomplete,
- tour browsing,
- tour detail view,
- interactive map,
- stop-by-stop audio playback.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS v4
- Zustand
- Leaflet

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run start
```

## Environment

Create `.env.local` if needed:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_API_KEY=development-api-key
```

## UI Direction

The frontend uses a warm editorial travel-guide style:

- beige surfaces,
- dark brown text,
- muted gold accents,
- Playfair Display headings,
- Inter body text.

The main UX priority is mobile-first walking-tour usage.

## Known Product Gaps

See `../docs/features/mobile-tour-experience-plan.md`.

Current known gaps:

- no current-location marker yet,
- no distance-to-next-stop yet,
- no full PWA or offline tour mode yet,
- audio controls are functional but not yet a full sticky mobile tour player.

## Verification

```bash
npm run lint
npm run build
```
