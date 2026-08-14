'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  NarrativePilotPreviewV5,
  PILOT_BLOCK_KINDS,
  PilotBlockKind,
} from '@/lib/narrativePilotV5';

const TourMap = dynamic(
  () => import('@/components/tour/map/TourMap').then((module) => module.TourMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-[38vh] min-h-72 items-center justify-center rounded-[1.5rem] border border-darkBrown/15 bg-[#ebe3d5] text-sm text-darkBrown/70 lg:h-[64vh]"
        role="status"
      >
        Preparando el mapa…
      </div>
    ),
  }
);

const BLOCK_LABELS: Record<PilotBlockKind, string> = {
  opening: 'Una tensión',
  look: 'Mira',
  human_conflict: 'Quienes lo hicieron posible',
  interpretation: 'Lo que cambió',
  closing: 'Para seguir pensando',
};

function distanceLabel(meters: number): string {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

interface MadridNarrativePilotProps {
  preview: NarrativePilotPreviewV5;
  initialStop: number | null;
}

export function MadridNarrativePilot({ preview, initialStop }: MadridNarrativePilotProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentIndex, setCurrentIndex] = useState<number | null>(
    initialStop === null ? null : initialStop - 1
  );
  const [finished, setFinished] = useState(false);
  const stopTitleRef = useRef<HTMLHeadingElement>(null);
  const { tour } = preview;

  useEffect(() => {
    if (currentIndex !== null) stopTitleRef.current?.focus();
  }, [currentIndex]);

  const showStop = (index: number) => {
    const bounded = Math.max(0, Math.min(tour.places.length - 1, index));
    setFinished(false);
    setCurrentIndex(bounded);
    router.replace(`${pathname}?stop=${bounded + 1}`, { scroll: false });
  };

  const finish = () => {
    setFinished(true);
    router.replace(pathname, { scroll: false });
  };

  const currentPlace = currentIndex === null ? null : tour.places[currentIndex];

  return (
    <main lang="es" className="min-h-screen overflow-hidden bg-[#f3ede3] text-darkBrown">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 opacity-40 [background-image:radial-gradient(#9b8350_0.7px,transparent_0.7px)] [background-size:16px_16px]" />
      <header className="relative border-b border-darkBrown/15 bg-[#f7f2e8]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#8b713a]">
              Piloto autónomo · Madrid
            </p>
            <h1 className="mt-1 text-xl font-semibold leading-tight sm:text-2xl">{tour.title}</h1>
          </div>
          <span className="shrink-0 rounded-full border border-[#8b713a]/35 bg-white/60 px-3 py-1.5 text-xs font-semibold text-[#755e2e]">
            En revisión
          </span>
        </div>
      </header>

      {currentPlace === null && !finished && (
        <section className="relative mx-auto grid min-h-[calc(100vh-6rem)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#8b713a]">Ruta histórica a pie</p>
            <h2 className="mt-5 text-4xl font-semibold leading-[1.03] sm:text-6xl lg:text-7xl">
              De la villa medieval a la capital moderna.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-darkBrown/78">{tour.promise}</p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
              <span className="rounded-full border border-darkBrown/15 bg-white/55 px-4 py-2">{tour.durationMinutes} min</span>
              <span className="rounded-full border border-darkBrown/15 bg-white/55 px-4 py-2">{distanceLabel(tour.distanceMeters)}</span>
              <span className="rounded-full border border-darkBrown/15 bg-white/55 px-4 py-2">7 paradas</span>
            </div>
            <button
              type="button"
              onClick={() => showStop(0)}
              className="mt-9 min-h-12 rounded-full bg-darkBrown px-7 py-3 text-base font-bold text-[#fffaf0] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#2f2924] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#a07d32]"
            >
              Comenzar
            </button>
          </div>
          <aside className="relative rounded-[2rem] border border-darkBrown/15 bg-[#ded2be] p-6 shadow-[0_24px_80px_rgba(74,63,53,0.15)] sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#755e2e]">La pregunta del recorrido</p>
            <p className="mt-5 text-2xl leading-9 sm:text-3xl">{tour.centralQuestion}</p>
            <div className="mt-8 border-t border-darkBrown/20 pt-5 text-sm leading-6 text-darkBrown/70">
              <p>{tour.subtitle}</p>
              <p className="mt-2">{tour.experienceLabel}</p>
            </div>
          </aside>
        </section>
      )}

      {finished && (
        <section className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center px-4 py-16 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#8b713a]">Recorrido terminado</p>
          <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Has llegado a la Puerta de Alcalá.</h2>
          <p className="mt-5 text-lg leading-8 text-darkBrown/75">Vuelve a la portada si quieres recorrer de nuevo las siete paradas.</p>
          <button
            type="button"
            onClick={() => { setFinished(false); setCurrentIndex(null); }}
            className="mt-8 min-h-12 rounded-full bg-darkBrown px-6 py-3 font-bold text-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#a07d32]"
          >
            Volver a la portada
          </button>
        </section>
      )}

      {currentPlace && currentIndex !== null && !finished && (
        <div className="relative mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)] lg:px-8 lg:py-8">
          <section aria-label="Mapa y orden de paradas" className="lg:sticky lg:top-5 lg:self-start">
            <TourMap
              tourId={tour.id}
              stops={tour.places}
              currentIndex={currentIndex}
              onStopSelect={showStop}
            />
            <details className="mt-3 rounded-2xl border border-darkBrown/15 bg-white/60 px-4 py-3" open>
              <summary className="cursor-pointer py-1 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b713a]">
                Lista equivalente del mapa
              </summary>
              <ol className="mt-3 grid gap-1" aria-label="Siete paradas del recorrido">
                {tour.places.map((place, index) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      aria-current={index === currentIndex ? 'step' : undefined}
                      onClick={() => showStop(index)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b713a] ${index === currentIndex ? 'bg-darkBrown font-bold text-white' : 'hover:bg-darkBrown/8'}`}
                    >
                      <span aria-hidden="true" className="w-5 text-center tabular-nums">{index + 1}</span>
                      <span>{place.name}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          </section>

          <article className="rounded-[1.75rem] border border-darkBrown/15 bg-[#fffaf1] p-5 shadow-[0_16px_60px_rgba(74,63,53,0.10)] sm:p-8 lg:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#8b713a]">
              Parada {currentIndex + 1} de 7
            </p>
            <h2
              ref={stopTitleRef}
              tabIndex={-1}
              className="mt-3 scroll-mt-6 text-3xl font-semibold leading-tight outline-none sm:text-5xl focus-visible:ring-2 focus-visible:ring-[#8b713a]"
            >
              {currentPlace.name}
            </h2>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              Mostrando parada {currentIndex + 1} de 7: {currentPlace.name}
            </p>

            <aside className="mt-6 border-l-4 border-[#b39759] bg-[#eee3cf] px-5 py-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#755e2e]">Observación</h3>
              <p className="mt-2 leading-7 text-darkBrown/80">{currentPlace.observation}</p>
            </aside>

            <div className="mt-8 divide-y divide-darkBrown/12">
              {PILOT_BLOCK_KINDS.map((kind, index) => (
                <section key={kind} className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr]">
                  <span aria-hidden="true" className="text-3xl font-semibold text-[#b39759]">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-[0.17em] text-[#755e2e]">{BLOCK_LABELS[kind]}</h3>
                    <p className="mt-3 text-[1.03rem] leading-8 text-darkBrown/86">{currentPlace.descriptionSections[kind]}</p>
                  </div>
                </section>
              ))}
            </div>

            <nav aria-label="Navegación entre paradas" className="mt-6 flex flex-col-reverse gap-3 border-t border-darkBrown/15 pt-6 sm:flex-row sm:justify-between">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => showStop(currentIndex - 1)}
                className="min-h-11 rounded-full border border-darkBrown/25 px-5 py-2.5 font-bold disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#8b713a]"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => currentIndex === 6 ? finish() : showStop(currentIndex + 1)}
                className="min-h-11 rounded-full bg-darkBrown px-6 py-2.5 font-bold text-white shadow-md transition hover:bg-[#2f2924] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#8b713a]"
              >
                {currentIndex === 6 ? 'Terminar recorrido' : 'Siguiente'}
              </button>
            </nav>
          </article>
        </div>
      )}
    </main>
  );
}
