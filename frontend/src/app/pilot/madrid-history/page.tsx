import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MadridNarrativePilot } from '@/components/pilot/MadridNarrativePilot';
import { loadNarrativePilotPreviewV4 } from '@/lib/narrativePilotServerV4';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Madrid: de villa a capital | Piloto',
  description: 'Piloto de experiencia de una ruta histórica autónoma por Madrid.',
  robots: { index: false, follow: false },
};

function PilotFixtureError({ kind, message }: { kind: 'missing' | 'invalid'; message: string }) {
  return (
    <main lang="es" className="mx-auto flex min-h-[80vh] max-w-2xl items-center px-4 py-16 sm:px-6">
      <section
        role="alert"
        className="w-full rounded-[1.75rem] border border-danger/25 bg-danger-surface p-6 text-danger shadow-sm sm:p-8"
      >
        <p className="text-xs font-bold uppercase tracking-[0.22em]">Piloto no disponible</p>
        <h1 className="mt-3 text-3xl font-semibold text-darkBrown">
          {kind === 'missing' ? 'Falta el recorrido congelado' : 'El recorrido no es válido'}
        </h1>
        <p className="mt-4 leading-7">{message}</p>
        <p className="mt-4 text-sm text-darkBrown/65">No se mostrará contenido parcial.</p>
      </section>
    </main>
  );
}

export default async function MadridHistoryPilotPage({
  searchParams,
}: {
  searchParams: Promise<{ stop?: string }>;
}) {
  if (process.env.ENABLE_NARRATIVE_PILOT !== 'true') notFound();
  const loaded = loadNarrativePilotPreviewV4();
  if (!loaded.ok) return <PilotFixtureError kind={loaded.kind} message={loaded.message} />;
  const rawStop = Number.parseInt((await searchParams).stop ?? '', 10);
  const initialStop = Number.isInteger(rawStop) && rawStop >= 1 && rawStop <= 7 ? rawStop : null;
  return <MadridNarrativePilot preview={loaded.preview} initialStop={initialStop} />;
}
