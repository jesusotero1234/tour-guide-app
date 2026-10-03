/** Production is a read-only private pilot; local staff tools may run in development. */
/**
 * Emergency switch for order-flexible tours (plan 04 section 10.4). With PILOT_FLEXIBLE_ORDER=off the API behaves as if
 * no tour were flexible: no orderFlexible flag, no link clips, no walking legs. The data stays where it is.
 */
export function flexibleOrderEnabled(): boolean {
  return process.env.PILOT_FLEXIBLE_ORDER !== 'off';
}

export function pilotEnabled(): boolean {
  return process.env.PILOT_MODE === 'true' || process.env.NODE_ENV === 'production';
}
