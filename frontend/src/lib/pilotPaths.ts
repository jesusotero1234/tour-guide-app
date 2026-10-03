/**
 * The only backend paths the frontend may proxy in pilot mode: the listing, one tour, and under it the walking route, the walking
 * legs, the provenance, the audio of the introduction and of each stop, and the link clips. Everything else answers 403.
 */
const PILOT_PATH = /^tours(?:\?[^#]*)?$|^tours\/[0-9a-f-]{36}(?:\/(?:walking-route|walking-legs|provenance|audio(?:\/(?:[0-9a-f-]{36}|introduction))?|cue\/(?:finish|(?:first|next)\/[0-9a-f-]{36})))?(?:\?v=[a-f0-9.]+)?$/;

export const pilotPathAllowed = (path: string) => PILOT_PATH.test(path);
