# Mobile-First UI Unification Plan

## Decisions

- Dark mode: remove it for now. It adds no value to the MVP and is currently inconsistent.
- `View on Map`: remove it. The map already exists in the tour detail flow and a dead button is worse than no button.
- Typography plugin / `prose`: do not install `@tailwindcss/typography`. Replace `prose` usage with explicit Tailwind utilities.
- Cost control: do not add paid map/search/media providers. Keep the current free stack.
- Product priority: mobile first. The primary user is walking while listening to the tour, using the phone mainly for orientation and advancing stops.

## Product Goal

Turn the UI into a coherent premium walking-audio-guide experience that is:

- easy to use on mobile with one hand,
- centered on audio playback and stop progression,
- supportive with the map but not map-dominated,
- visually aligned with the current warm editorial brand,
- free from generic gray/blue starter-app styling.

## Current Problems

- The app is visually split between two styles:
  - branded beige/brown/gold editorial styling on tours pages,
  - generic gray/blue starter styling on the home page and shared form primitives.
- Metadata still uses the default Next.js values.
- Dark mode is partially wired and visually inconsistent.
- Shared primitives (`Button`, `Input`, `Select`) are off-brand.
- `LocationPicker` and `SearchBox` use one-off styles instead of the shared system.
- `PlaceCard` contains a dead `View on Map` button.
- `TourForm` still has production debug logging.
- `PlaceCard` relies on `prose` even though typography plugin support is not configured.
- Radius, shadow, and state colors are inconsistent across pages.

## Execution Plan

## Phase 1: Technical Cleanup and Theme Foundation

Primary files:

- `frontend/src/app/layout.tsx`
- `frontend/src/app/globals.css`
- `frontend/tailwind.config.js`
- `frontend/src/components/form/TourForm.tsx`
- `frontend/src/components/tour/PlaceCard.tsx`

Changes:

- Replace default metadata with product metadata.
- Remove production `console.log` statements.
- Remove the current dark-mode override.
- Fix invalid or duplicate theme-token usage.
- Move the UI toward a single CSS-first theme source in `globals.css`.

Suggested tokens:

```css
--color-surface: #f7f4ef;
--color-surface-elevated: #fffdf8;
--color-ink: #4a3f35;
--color-ink-muted: #766a5f;
--color-accent: #c0a65f;
--color-border: rgba(74, 63, 53, 0.18);
--color-danger: #b6493a;
```

Success criteria:

- No default Next.js metadata remains.
- No dark-mode-specific CSS remains.
- No debug logs remain in the tour-generation flow.
- Theme values are defined in one main place.

## Phase 2: Shared UI System

Primary files:

- `frontend/src/components/common/Button.tsx`
- `frontend/src/components/common/Input.tsx`
- `frontend/src/components/common/Select.tsx`
- `frontend/src/components/form/LocationPicker/index.tsx`
- `frontend/src/components/tours/SearchBox.tsx`
- `frontend/src/components/form/TourForm.tsx`

Changes:

- Reskin `Button`, `Input`, and `Select` to the editorial palette.
- Standardize focus, disabled, loading, and error states.
- Update `LocationPicker` dropdown and selected-state styling to match the same system.
- Align `SearchBox` with the same form language.

Success criteria:

- Shared primitives no longer use generic blue/gray styling.
- All form surfaces look like the same product.
- Focus states remain visible and accessible.

## Phase 3: Home Page Mobile-First Rewrite

Primary file:

- `frontend/src/app/page.tsx`

Changes:

- Rebuild the home page as the product storefront.
- Keep the tour form high on the page for mobile users.
- Use concise copy focused on audio, walking, and guided discovery.
- Replace the generic white card and gray background with the editorial visual language.

Recommended structure:

- compact header,
- short hero,
- form card,
- small supporting value points.

Success criteria:

- A mobile user understands the product quickly.
- The form is comfortable to use on a small screen.
- The first screen feels like the same app as the tours flow.

## Phase 4: Tour Detail Mobile-First Flow

Primary files:

- `frontend/src/app/tours/[id]/page.tsx`
- `frontend/src/components/tour/PlaceCard.tsx`
- `frontend/src/components/tour/AudioPlayer.tsx`
- `frontend/src/components/tour/map/TourMap.tsx`

Changes:

- Prioritize current stop, audio, and next-stop progression on mobile.
- Keep the map useful without making it dominate the layout.
- Remove `View on Map`.
- Replace `prose` usage with explicit typography classes.
- Align loading, error, and control styles with the same design system.

Success criteria:

- The tour flow is easy to follow while walking.
- Audio feels like the primary control surface.
- No dead or decorative-only controls remain.

## Phase 5: Browse and Supporting Pages

Primary files:

- `frontend/src/app/tours/page.tsx`
- `frontend/src/components/tours/ToursList.tsx`
- `frontend/src/components/tours/TourCard.tsx`
- `frontend/src/app/data-sources/page.tsx`

Changes:

- Bring browse and supporting pages into the same visual system.
- Remove generic white/gray card styling.
- Standardize cards, pills, spacing, borders, and shadows.

Success criteria:

- All major pages look like one product.
- Supporting pages no longer feel like afterthoughts.

## Phase 6: Navigation Cleanup

Primary file:

- `frontend/src/components/layout/Header.tsx`

Changes:

- Remove redundant navigation to the same route.
- Keep the mobile header compact.
- Use a simple information architecture, centered on creating and browsing tours.

Success criteria:

- Navigation is clear.
- Header footprint is appropriate for mobile.

## Phase 7: Final QA

Checks:

- remove leftover `blue-*`, `gray-*`, `bg-white`, `text-readMore`, and `prose` usage where not intentional,
- verify contrast, especially accent text on light surfaces,
- test on small mobile widths first,
- ensure desktop still behaves correctly,
- run `npm run lint` and `npm run build`.

Manual smoke test:

- create a tour from the home page,
- use city autocomplete,
- check loading and error states,
- browse saved tours,
- open a tour detail page,
- interact with the map,
- play audio,
- advance to the next stop.

## Recommended Implementation Order

1. Technical cleanup and metadata.
2. Theme tokens in `globals.css`.
3. Shared primitives.
4. Tour form and location picker.
5. Home page mobile-first rewrite.
6. Tour detail mobile-first polish.
7. Header cleanup.
8. Browse and supporting pages.
9. Final audit and verification.
