import type { Place } from '@/types/api';
export function safeCreditUrl(value?: string): string | undefined {
  try { const u = new URL(value ?? ''); return u.protocol === 'https:' && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
}
export function SourceCredits({ place, language }: { place: Place; language: string }) {
  const fr = language === 'fr';
  const items = place.metadata?.sourceCredits?.items ?? [];
  return <details className="source-credits">
    <summary>{fr ? 'Sources consultées pour cette étape' : 'Fuentes consultadas para esta parada'}</summary>
    {!items.length ? <p>{fr ? 'Sources en cours de vérification.' : 'Fuentes pendientes de comprobación.'}</p> : <ul>
      {items.map(source => <li key={source.sourceId}>
        {safeCreditUrl(source.revisionUrl ?? source.url) ? <a href={safeCreditUrl(source.revisionUrl ?? source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a> : <span>{source.title}</span>}
        <p>{source.attribution}</p>
        {source.license && safeCreditUrl(source.licenseUrl) && <a href={safeCreditUrl(source.licenseUrl)} target="_blank" rel="noopener noreferrer">{source.license}</a>}
        <p>{fr ? 'Consultée le' : 'Consultada el'} {source.capturedAt.slice(0, 10)}</p>
      </li>)}
    </ul>}
    <p>{fr ? 'Ces références documentent la recherche. Le récit a été rédigé avec une IA.' : 'Estas referencias documentan la investigación. La narración se ha redactado con IA.'}</p>
  </details>;
}
