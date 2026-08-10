export default function MadridHistoryPilotLoading() {
  return (
    <main lang="es" className="min-h-screen bg-[#f3ede3] px-4 py-10 sm:px-6" aria-busy="true">
      <div className="mx-auto max-w-7xl" role="status">
        <span className="sr-only">Cargando recorrido…</span>
        <div className="h-5 w-48 animate-pulse rounded-full bg-darkBrown/15" />
        <div className="mt-12 h-14 max-w-2xl animate-pulse rounded-2xl bg-darkBrown/10" />
        <div className="mt-5 h-7 max-w-xl animate-pulse rounded-xl bg-darkBrown/10" />
        <div className="mt-10 h-80 animate-pulse rounded-[2rem] border border-darkBrown/10 bg-white/50" />
      </div>
    </main>
  );
}
