# Wikimedia Image Integration

**Goal:** fetch relevant, mobile-usable Wikimedia images for each POI without paid APIs.

## Current Strategy

Image selection now follows a direct-source-first pipeline:

1. **Wikidata first**
   - If the POI has a `wikidata` tag, fetch the entity's `P18` image claims.
   - Resolve those files through Wikimedia Commons `imageinfo`.
   - Prefer the generated thumbnail URL over the original upload.

2. **Wikipedia page image fallback**
   - If the POI has a `wikipedia` tag and Wikidata does not yield a usable image, fetch the page image thumbnail from the tagged language wiki.

3. **Commons search fallback**
   - Search Commons with `place + city + country`.
   - Rank candidates with quality and relevance scoring.
   - Validate the chosen URL before accepting it.

4. **Basic Commons fallback**
   - If enhanced search still fails, retry with a smaller metadata request.

## Why This Exists

Commons text search often returns valid but wrong images for famous places.

Example:
- Search for `Museo del Prado Madrid Spain`
- Commons may return `Las Meninas`
- That image exists and is high quality, but it is not a representative image of the museum building

Using the POI's own Wikidata/Wikipedia links gives the pipeline a better chance of picking the actual place before trying generic search.

## Thumbnail-First Rule

We always request Commons thumbnails with `iiurlwidth=1200` and prefer `thumburl` when present.

Reason:
- Many Commons originals are enormous
- Example: `26065x30000`
- Original URLs are technically valid but poor for mobile loading and rendering

## Relevance Scoring

Search results are ranked with a deterministic score that combines:

1. **Image quality**
   - dimensions
   - featured/quality hints
   - global usage
   - description presence

2. **Direct source priority**
   - Wikidata `P18` images outrank all search results
   - Wikipedia page images outrank generic Commons search results

3. **Text relevance**
   - place-name token matches
   - city/country token matches
   - category-specific hints such as `museum`, `facade`, `plaza`, `cathedral`

4. **Negative signals**
   - penalize artwork/object terms for building-like POIs
   - examples: `painting`, `portrait`, `canvas`, `google art project`
   - do not apply the artwork penalty when the POI category is actually `artwork`

## URL Validation

Before accepting an image URL, the backend sends a `HEAD` request and requires an `image/*` content type.

If the top-ranked image fails validation:
- try the next ranked candidate
- return `null` if none are usable

## Inputs Used From POI Metadata

The orchestrator now passes:

- `wikidata`
- `wikipedia`
- `category`
- `osmTags`
- `landmarkTier`

These come from `metadata.sourcePoi` / OSM-derived POI data already available in the tour pipeline.

## Verification

Primary checks:

- `npm test -- --runTestsByPath src/services/wikimediaService.test.ts`
- `npm run build`

Test coverage should include:

- prefers Wikidata `P18` image when available
- falls back to Wikipedia page thumbnail when Wikidata has no usable image
- rejects or penalizes valid-but-irrelevant artwork images for museums/buildings
- falls back to the next candidate when the first URL fails validation
