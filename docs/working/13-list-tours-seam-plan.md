# 13 - listTours Seam Replacement Plan

## Scope

Design-only. This plan covers the smallest safe replacement of the remaining
`listTours` supabase-pod seam with local Postgres, while preserving current
query filter behavior.

---

## 1. Current Behavior

`backend/src/api/controllers/tours.ts:listTours` currently:

1. Reads `city`, `theme`, `language`, `limit`, and `offset` from `req.query`.
2. Parses `limit` and `offset` with `parseInt(..., 10)` when present.
3. Rebuilds a query string using only truthy values.
4. Forwards `GET /tours` to `supabase-pod` using `fetch`.
5. Returns the pod JSON response unchanged on success.
6. Returns `TOUR_LIST_ERROR` on upstream or local failure.

Important compatibility note:
- Because the controller appends only truthy values, `limit=0` and `offset=0`
  are currently omitted from the forwarded request. The replacement should keep
  this behavior unless the team explicitly approves a behavior fix later.

---

## 2. Recommended Repository API Change

Add a repository-level filtered list contract:

```ts
export type ListToursOptions = {
  city?: string;
  theme?: string;
  language?: string;
  limit?: number;
  offset?: number;
};

export interface TourRepository {
  save(tour: Tour): Promise<Tour>;
  findById(id: string): Promise<Tour | null>;
  listRecent(limit: number): Promise<Tour[]>;
  list(options: ListToursOptions): Promise<Tour[]>;
}
```

Why this matters:
- It moves filter logic behind the existing persistence boundary.
- It removes the last direct controller dependency on supabase-pod.
- It keeps future adapters possible because the list contract stays interface-
  based instead of Prisma-specific.

Risk reduced:
- Prevents another one-off data access seam from living outside the repository.
- Avoids a bigger later rewrite when Phase 7 adds interchangeable adapters.

Recommended query semantics for `PostgresTourRepository.list(options)`:
- `where.city = options.city` when provided.
- `where.theme = options.theme` when provided.
- `where.language = options.language` when provided.
- `take = options.limit` when provided.
- `skip = options.offset` when provided.
- `orderBy = { createdAt: 'desc' }`.
- `include.places.orderBy = { position: 'asc' }`.

Do not add partial-match search, case-insensitive matching, extra filters, or
pagination metadata in this step.

---

## 3. Keep `listRecent(limit)` or Replace It?

Recommendation: **keep `listRecent(limit)` for now**.

Why this matters:
- It is already implemented and may still be useful for simple callers.
- Removing or rewriting it creates avoidable surface area during a seam swap.
- `list(options)` can be introduced alongside it as the minimal additive change.

Risk reduced:
- Smaller diff.
- Lower chance of breaking existing repository consumers.
- Avoids coupling the seam replacement to a broader repository cleanup.

Possible later cleanup:
- After `listTours` is fully stable on `list(options)`, the team can decide
  whether `listRecent(limit)` should become a thin convenience wrapper or be
  retired in a separate refactor.

---

## 4. Smallest Safe Next Implementation Step

### Files to edit

1. `backend/src/domain/repositories/TourRepository.ts`
   - Add `ListToursOptions` type.
   - Add `list(options: ListToursOptions): Promise<Tour[]>` to the interface.

2. `backend/src/infrastructure/postgres/PostgresTourRepository.ts`
   - Implement `list(options)` with Prisma `findMany`.
   - Preserve current filter set only: `city`, `theme`, `language`, `limit`, `offset`.
   - Keep ordering by `createdAt desc` and places by `position asc`.

3. `backend/src/services/orchestrationService.ts`
   - Add a small `listTours(options)` method that delegates to
     `this.tourRepository.list(options)`.
   - Map returned domain `Tour[]` into the same API-facing list item shape used
     elsewhere by the backend for tours.
   - Keep this method simple; do not add unrelated orchestration cleanup.

4. `backend/src/api/controllers/tours.ts`
   - Keep existing query parsing.
   - Replace the direct `fetch` to supabase-pod with
     `orchestrationService.listTours(filters)`.
   - Keep the existing `TOUR_LIST_ERROR` response pattern.
   - Preserve the current truthy-filter quirk for `0` values in this step.

5. `docs/working/05-agent-log.md`
   - Record the implementation pass and validation result.

### Files not needed for this step

- `backend/src/api/routes/tours.ts` — no route change needed.
- `backend/prisma/schema.prisma` — no schema change needed.
- Frontend and pods — untouched.

---

## 5. Out-of-Scope Rules

- No Prisma schema edits.
- No migrations.
- No frontend changes.
- No pod changes.
- No audio storage or audio metadata changes.
- No `retrieveTour()` changes.
- No Phase 5 cleanup work.
- No new filters beyond `city`, `theme`, `language`, `limit`, `offset`.
- No pagination envelope/metadata changes.
- No case-insensitive or fuzzy search behavior changes.
- Do not remove `listRecent(limit)` in this step.

---

## 6. Validation Commands

From `backend/`:

```bash
npm run build
```

Optional manual smoke checks if local backend + DB are available:

```bash
curl "http://localhost:3001/tours"
curl "http://localhost:3001/tours?city=Valencia"
curl "http://localhost:3001/tours?theme=history&language=en&limit=5&offset=0"
```

Verify:
- Build passes.
- Endpoint still accepts the same five query params.
- Filtering works against local Postgres.
- `offset=0` behavior is unchanged for this step.

---

## 7. Copy/Paste-Ready Implementation Prompt

```text
Use the implementation-agent.

Task: Replace the remaining `listTours` supabase-pod seam with local Postgres,
and only do that seam.

Read first:
- backend/src/api/controllers/tours.ts
- backend/src/domain/repositories/TourRepository.ts
- backend/src/infrastructure/postgres/PostgresTourRepository.ts
- backend/src/services/orchestrationService.ts
- docs/working/13-list-tours-seam-plan.md

Requirements:
- Do not modify Prisma schema or migrations.
- Do not touch frontend or pods.
- Preserve existing filter behavior for `city`, `theme`, `language`, `limit`, and `offset`.
- Keep the change small.
- Do not start Phase 5 work.
- Do not remove `listRecent(limit)`.

Implementation steps:
1. In `backend/src/domain/repositories/TourRepository.ts`, add a `ListToursOptions` type with optional `city`, `theme`, `language`, `limit`, and `offset` fields.
2. Add `list(options: ListToursOptions): Promise<Tour[]>` to the `TourRepository` interface.
3. In `backend/src/infrastructure/postgres/PostgresTourRepository.ts`, implement `list(options)` using Prisma `findMany` with:
   - exact-match filters for provided `city`, `theme`, `language`
   - `take` from `limit` when provided
   - `skip` from `offset` when provided
   - `orderBy: { createdAt: 'desc' }`
   - `include: { places: { orderBy: { position: 'asc' } } }`
4. In `backend/src/services/orchestrationService.ts`, add a small `listTours(options)` method that delegates to `tourRepository.list(options)` and maps the result into the backend's existing API-facing tour list shape.
5. In `backend/src/api/controllers/tours.ts`, keep the existing query parsing and error shape, but replace the direct `fetch` call with `orchestrationService.listTours(filters)`.
6. Update `docs/working/05-agent-log.md` with files touched, summary, and validation.

Guardrails:
- Preserve the current behavior where only truthy filters are appended/used by the controller path; do not "fix" `limit=0` or `offset=0` semantics in this task.
- No extra abstractions.
- No unrelated cleanup.

Validation:
- Run `cd backend && npm run build`

Return:
- Summary of changed files
- Validation result
- Any assumptions or behavior-preservation notes
```
