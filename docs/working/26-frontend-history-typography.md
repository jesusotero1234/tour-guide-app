# Frontend History Typography Update

Status: **implemented**.

## Goal

Give the tour UI, especially history-themed tours, a more archival and cultural tone without hurting readability on mobile.

## Decision

Use an open-source typography pairing with a lightly historic feel:

- Headings and place names: `Ibarra Real Nova`
- Body copy and long reading text: `Literata`

## Why This Pairing

- `Ibarra Real Nova` has a more patrimonial, editorial, and slightly antique character than the previous heading font.
- It fits especially well for Spanish and European history-tour presentation.
- `Literata` stays highly readable for descriptions, narration text, and UI copy.
- Both are open source and available through `next/font/google`.

## Scope Applied

Files changed:

- `frontend/src/app/layout.tsx`
- `frontend/src/app/globals.css`

## Implementation Notes

- Replaced `Playfair Display` + `Inter` with `Ibarra Real Nova` + `Literata`.
- Bound the heading font to `--font-heading`.
- Bound the body font to `--font-body`.
- Updated the global body font stack to use `Literata`.
- Updated the global heading font stack to use `Ibarra Real Nova`.
- Added small global legibility refinements:
  - `font-feature-settings: "liga" 1, "kern" 1`
  - `text-rendering: optimizeLegibility`
  - slight negative heading letter-spacing

## Expected Visual Effect

- Titles feel more museum-like and historical.
- Long tour text remains comfortable to read.
- The overall UI feels less generic and more aligned with guided cultural tours.

## Non-Goals

- No per-theme font switching yet.
- No conditional typography just for history tours in this phase.
- No component-by-component typography override work beyond the global font replacement.

## Future Option

If we want stronger thematic styling later, keep this as the default cultural/editorial base and add small theme-specific accents for `history` tours only, such as:

- slightly stronger serif scale on hero headings
- small-caps section labels
- ornamental dividers or archival card styling
