/**
 * stage-local and verify write to a database. They only accept a disposable copy whose name says so, never the development
 * database and never production, whatever DATABASE_URL happens to point at.
 */
export function assertDisposableDatabase(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL is not set');
  let name: string;
  try { name = decodeURIComponent(new URL(url).pathname.replace(/^\//, '')); } catch { throw new Error('DATABASE_URL is not a valid URL'); }
  if (!/(_rehearsal|_stage|_regen)$/.test(name)) {
    throw new Error(`Refusing to write to database "${name}": a copy for this tool must be named *_rehearsal, *_stage or *_regen`);
  }
  return name;
}
