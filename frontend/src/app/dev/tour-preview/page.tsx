import { notFound } from 'next/navigation';
import { EditorialPreview } from '@/components/tour/EditorialPreview';

export const dynamic = 'force-dynamic';

export default function TourPreviewPage() {
  if (process.env.ENABLE_EDITORIAL_PREVIEW !== 'true') notFound();
  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-surface px-4 py-8 sm:px-6 lg:px-8">
      <EditorialPreview />
    </main>
  );
}
