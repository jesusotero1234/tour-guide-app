'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getGenerationJob, type ApiRequestError } from '@/lib/api';
import { GenerationJob } from '@/types/api';

const stageLabels: Record<GenerationJob['step'], string> = {
  queued: 'Waiting to start',
  sourcing: 'Finding reliable places and sources',
  routing: 'Building a coherent walking route',
  planning_narrative: 'Planning one story across the tour',
  narrating: 'Writing each stop',
  validating: 'Checking facts, voice, and repetition',
  repairing: 'Improving the stops that need another pass',
  publishing: 'Publishing the approved tour',
  completed: 'Tour ready',
  failed: 'Generation stopped',
};

export function GenerationProgress({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  useEffect(() => {
    setJob(null);
    setLoadError(null);
    setTerminalError(null);
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const nextJob = await getGenerationJob(jobId);
        if (cancelled) return;
        setJob(nextJob);
        setLoadError(null);
        if (nextJob.status === 'completed') {
          if (nextJob.result?.tourId) router.replace(`/tours/${nextJob.result.tourId}`);
          else setTerminalError('This generation finished without an available tour.');
          return;
        }
        if (nextJob.status !== 'failed') timeoutId = setTimeout(poll, 2000);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to poll generation job:', error);
        const apiError = error as ApiRequestError;
        if ([400, 401, 403, 404, 410].includes(apiError.status ?? 0)
          || apiError.code === 'GENERATION_JOB_NOT_FOUND') {
          setLoadError(null);
          setTerminalError('This generation is unavailable. Please start a new tour.');
          return;
        }
        setLoadError('We could not refresh the progress. We will try again shortly.');
        timeoutId = setTimeout(poll, 5000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [jobId, router]);

  const progress = job?.progress;
  const percentage = progress?.totalStops
    ? Math.max(0, Math.min(100, Math.round((progress.completedStops / progress.totalStops) * 100)))
    : 0;

  return (
    <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-darkBrown/12 bg-surface-elevated p-6 shadow-md sm:p-8">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">Text tour generation</p>
      <h1 className="mt-3 text-3xl font-serif font-bold text-darkBrown">
        {terminalError ? 'Generation unavailable' : job ? stageLabels[job.step] : 'Loading generation progress'}
      </h1>

      {terminalError ? (
        <div className="mt-6 text-danger" role="alert">
          <p>{terminalError}</p>
          <Link href="/" className="mt-4 inline-flex underline">Start a new tour</Link>
        </div>
      ) : job?.status === 'failed' ? (
        <div className="mt-6 rounded-xl border border-danger/20 bg-danger-surface p-5 text-danger" role="alert">
          <p className="font-medium">We did not publish this tour.</p>
          <p className="mt-2 text-sm leading-6">
            {job.error?.message || 'The available route or guide text did not reach the required quality.'}
          </p>
          <Link href="/" className="mt-4 inline-flex rounded-lg border border-danger/25 px-4 py-2 text-sm font-medium">
            Try another option
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-6 text-darkBrown/70">
            {progress?.message || 'Your request is safely queued. You can keep this link and return later.'}
          </p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-darkBrown/10">
            <div
              className={`h-full rounded-full bg-mutedGold transition-[width] duration-500 ${percentage === 0 ? 'w-1/4 animate-pulse' : ''}`}
              style={percentage > 0 ? { width: `${percentage}%` } : undefined}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-darkBrown/60">
            <span>{progress?.totalStops ? `${progress.completedStops}/${progress.totalStops} stops checked` : 'Preparing route'}</span>
            <span>{percentage > 0 ? `${percentage}%` : 'In progress'}</span>
          </div>
        </>
      )}

      {loadError && <p className="mt-4 text-sm text-danger">{loadError}</p>}
      <p className="mt-8 border-t border-darkBrown/10 pt-4 text-xs leading-5 text-darkBrown/55">
        Job {jobId}. Progress is stored on the server, so reloading this page will not restart the work.
      </p>
    </div>
  );
}
