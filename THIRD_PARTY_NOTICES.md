# Third-Party Notices

Status: **initial draft**.

This repository uses third-party open-source software, fonts, data, and models.

This file is an engineering-side notices draft and not yet the final legal inventory for launch.

## Important Launch Note

Commercial launch is currently blocked until the items in `docs/legal/commercial-readiness-audit-report.md` marked as red are resolved.

In particular:

- public OpenStreetMap tiles are still used directly in frontend code and must be replaced or explicitly approved for production use.
- Wikimedia image attribution is not yet implemented at image level.
- LLM and TTS model-weight commercial terms are still pending explicit audit.

## Application Frameworks And Libraries

### Frontend

- Next.js — MIT
- React — MIT
- React DOM — MIT
- Leaflet — BSD-2-Clause
- Leaflet GeoSearch — MIT
- Zustand — MIT

### Backend / Pods

- Prisma Client — Apache-2.0
- Axios — MIT
- Express — MIT
- CORS — MIT
- Helmet — MIT
- express-rate-limit — MIT
- dotenv — BSD-2-Clause
- fs-extra — MIT
- winston — MIT
- node-cache — MIT
- node-fetch — MIT
- express-validator — MIT
- zod — MIT
- string-similarity — ISC
- Supabase JS — MIT

## Fonts

- Ibarra Real Nova — used via Google Fonts / `next/font/google`
- Literata — used via Google Fonts / `next/font/google`

Final launch audit still needs to record the exact upstream font license references.

## Data Sources

- OpenStreetMap data — attribution required
- Nominatim — public service policy review required for production use
- Overpass API — public service policy review required for production use
- Wikipedia — attribution and license implications must be respected
- Wikidata — included as a structured data source
- Wikimedia Commons — image-level attribution still required

## Models And AI Components

The following components are referenced in the repository and still require final commercial license confirmation before launch:

- `llama3.1:8b`
- `gemma4:26b`
- `openbmb/VoxCPM2`
- `voxcpm`
- `kokoro-onnx`
- Kokoro voice assets used by the product

## Product-Facing Attribution Already Present

- OpenStreetMap attribution footer exists in the frontend
- Wikipedia CC BY-SA acknowledgment exists in the frontend
- a Data Sources page exists in the frontend

## Required Follow-Up Before Commercial Launch

1. finalize `docs/legal/commercial-readiness-audit-report.md`
2. implement image-level Wikimedia attribution
3. replace public OSM tiles for production
4. confirm LLM model licenses
5. confirm TTS model and voice licenses
6. add legal product pages: Terms, Privacy, Licenses
