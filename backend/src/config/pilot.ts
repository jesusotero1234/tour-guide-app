/** Production is a read-only private pilot; local staff tools may run in development. */
export function pilotEnabled(): boolean {
  return process.env.PILOT_MODE === 'true' || process.env.NODE_ENV === 'production';
}
