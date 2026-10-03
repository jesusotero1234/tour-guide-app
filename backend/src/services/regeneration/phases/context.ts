import type { PrismaClient } from '@prisma/client';
import type { runLocalVoxCpm } from '../../LocalVoxCpmRenderer';
import type { LegRouter } from '../../WalkingLegs';
import type { Manifest, ManifestTour } from '../plan';
import type { PythonBridge } from '../py';
import { Stage } from '../stage';

export interface Selection { tours?: string[]; languages?: string[]; cities?: string[] }

/** Everything a phase needs from the outside, so that the real tools and the doubles of a rehearsal share the same code. */
export interface Deps {
  python: PythonBridge;
  render: typeof runLocalVoxCpm;
  router: LegRouter;
  /** Decodes a rendered file and returns its duration in seconds; throws when it cannot be decoded. */
  decode: (file: string) => number;
  /** Local database of the run (a copy, never production). */
  prisma?: () => PrismaClient;
  fetchJson?: (url: string) => Promise<unknown>;
  now: () => Date;
  log: (message: string) => void;
}

export interface Ctx { stage: Stage; deps: Deps; selection: Selection; flags: Record<string, string | boolean> }

export const manifestOf = (stage: Stage): Manifest => stage.read<Manifest>('manifest.json');

/** The tours a phase works on: the selection, minus the ones excluded from this regeneration. */
export function selectTours(ctx: Ctx, options: { includeExcluded?: boolean } = {}): ManifestTour[] {
  const manifest = manifestOf(ctx.stage), state = ctx.stage.state();
  const { tours, languages, cities } = ctx.selection;
  return manifest.tours.filter(t => (!tours?.length || tours.includes(t.tourId)) && (!languages?.length || languages.includes(t.language))
    && (!cities?.length || cities.map(c => c.toLowerCase()).includes(t.city.toLowerCase())) && (options.includeExcluded || !state.excluded[t.tourId]));
}

/** The selected tours whose files are all rendered and verified. */
export const renderedTours = (ctx: Ctx) => selectTours(ctx).filter(t => ctx.stage.exists('render', t.tourId + '.json'));

/** The tours a phase may try again: the selection minus the tours excluded by ANOTHER phase (its own exclusions are retried). */
export function selectRetriable(ctx: Ctx, phase: string): ManifestTour[] {
  const excluded = ctx.stage.state().excluded;
  return selectTours(ctx, { includeExcluded: true }).filter(t => !excluded[t.tourId] || excluded[t.tourId].phase === phase);
}

export const sampleCities = (ctx: Ctx): string[] => String(ctx.flags['sample-cities'] ?? 'Valencia').split(',').map(s => s.trim()).filter(Boolean);
export const isSample = (ctx: Ctx, tour: ManifestTour) => sampleCities(ctx).some(c => c.toLowerCase() === tour.city.toLowerCase());

/**
 * Plan 04 section 6: the sample is the first lot; the rest of the catalogue waits for the user's approval of that sample, and the
 * render waits for the user to approve the link-clip wording and the text of the lot being rendered.
 */
export function requireSampleApproved(ctx: Ctx, tour: ManifestTour, what: string): void {
  if (!isSample(ctx, tour) && !ctx.stage.approved('sample-valencia') && !ctx.stage.approved('full-catalog', tour.tourId)) {
    throw new Error(`${what} for ${tour.city} (${tour.language}) needs the user's "sample-valencia" approval in approvals.json`);
  }
}

export function requireRenderApproval(ctx: Ctx, tour: ManifestTour): void {
  // The sample is rendered precisely so that the user can listen to it, to the link clips and to their wording, and approve them:
  // asking for that approval before rendering it would be circular. Everything else waits for it.
  if (isSample(ctx, tour)) return;
  if (!ctx.stage.approved('cue-templates')) throw new Error('Rendering needs the user to approve the link-clip wording ("cue-templates" in approvals.json)');
  if (!ctx.stage.approved('sample-valencia') && !ctx.stage.approved('full-catalog', tour.tourId)) {
    throw new Error(`Rendering ${tour.city} (${tour.language}) needs the user's "sample-valencia" approval in approvals.json`);
  }
}

export const toursByLanguage = (tours: ManifestTour[]) => {
  const groups = new Map<string, ManifestTour[]>();
  for (const tour of tours) groups.set(tour.language, [...(groups.get(tour.language) ?? []), tour]);
  return groups;
};
