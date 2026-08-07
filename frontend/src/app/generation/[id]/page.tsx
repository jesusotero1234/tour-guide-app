import { Header } from '@/components/layout/Header';
import { GenerationProgress } from '@/components/tour/GenerationProgress';

export default async function GenerationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <GenerationProgress jobId={id} />
      </main>
    </div>
  );
}
