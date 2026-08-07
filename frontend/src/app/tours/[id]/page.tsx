'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PlaceCard } from '@/components/tour/PlaceCard';
import { getDistanceLabel, getMapsUrl, haversineDistanceMeters } from '@/lib/geo';
import { getTour } from '@/lib/api';
import { useTourStore } from '@/lib/store';
import { Tour } from '@/types/api';
import Link from 'next/link';

const TourMap = dynamic(
  () => import('@/components/tour/map/TourMap').then((mod) => mod.TourMap),
  { ssr: false }
);

const TOUR_LOCATION_CONTEXT_RADIUS_METERS = 50000;

function getTourProgressKey(tourId: string) {
  return `tour-progress:${tourId}`;
}

function formatTourDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

type LocationStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable';
export default function TourDetailPage() {
  const params = useParams();
  const { setTour, isLoading, setLoading, error, setError } = useTourStore();
  const [tour, setLocalTour] = useState<Tour | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;

    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const copyText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'true');
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  };

  const handleShare = async () => {
    if (!tour || typeof window === 'undefined') return;

    const shareUrl = window.location.href;
    const shareData = {
      title: `Tour of ${tour.city}, ${tour.country}`,
      text: `Walk this ${tour.theme} tour in ${tour.city}.`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareFeedback('Tour shared.');
        return;
      }

      await copyText(shareUrl);
      setShareFeedback('Tour link copied.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      try {
        await copyText(shareUrl);
        setShareFeedback('Tour link copied.');
      } catch {
        setShareFeedback('Unable to share right now.');
      }
    }
  };
  
  useEffect(() => {
    const fetchTour = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (!params.id) {
          setError('Invalid tour ID');
          return;
        }
        
        const tourData = await getTour(params.id as string);
        const savedIndex = typeof window !== 'undefined'
          ? Number(window.localStorage.getItem(getTourProgressKey(tourData.id)))
          : NaN;

        setLocalTour(tourData);
        setCurrentIndex(
          Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < tourData.places.length
            ? savedIndex
            : 0
        );
        setTour(tourData); // Also update the global store
      } catch (err) {
        console.error('Error fetching tour:', err);
        setError('Failed to load tour. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTour();
    
    return () => {
      // Clean up, but don't clear the tour from the store so it remains available
    };
  }, [params.id, setTour, setLoading, setError]);

  useEffect(() => {
    if (!tour) return;

    window.localStorage.setItem(getTourProgressKey(tour.id), String(currentIndex));
  }, [tour, currentIndex]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationStatus('unavailable');
      return;
    }

    setLocationStatus('loading');

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus('ready');
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocationStatus('denied');
          return;
        }

        setLocationStatus('unavailable');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const currentPlace = tour?.places[currentIndex];
  const nextPlace = tour?.places[currentIndex + 1] ?? null;
  const isFinalStop = Boolean(tour && currentIndex === tour.places.length - 1);
  const isUserNearTour = useMemo(() => {
    if (!userLocation || !currentPlace) return false;

    return haversineDistanceMeters(userLocation, currentPlace) <= TOUR_LOCATION_CONTEXT_RADIUS_METERS;
  }, [userLocation, currentPlace]);
  const currentStopDistance = useMemo(() => {
    if (!userLocation || !currentPlace || !isUserNearTour) return null;

    return getDistanceLabel(userLocation, currentPlace);
  }, [userLocation, currentPlace, isUserNearTour]);
  const nextStopDistance = useMemo(() => {
    if (!userLocation || !nextPlace || !isUserNearTour) return null;

    return getDistanceLabel(userLocation, nextPlace);
  }, [userLocation, nextPlace, isUserNearTour]);

  const locationMessage =
    locationStatus === 'loading'
      ? 'Finding your location…'
      : locationStatus === 'denied'
        ? 'Location access is off. You can still follow the route manually.'
        : locationStatus === 'ready' && !isUserNearTour
          ? 'You are far from this tour, so the map is staying focused on the route.'
        : locationStatus === 'unavailable'
          ? 'Live location is unavailable on this device right now.'
          : null;
  const currentStopMapUrl = currentPlace
    ? getMapsUrl({ latitude: currentPlace.latitude, longitude: currentPlace.longitude }, currentPlace.name)
    : null;
  useEffect(() => {
    if (!shareFeedback) return;

    const timeoutId = window.setTimeout(() => setShareFeedback(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [shareFeedback]);
  
  return (
    <div className="min-h-screen bg-beige">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-8 sm:pb-32 lg:px-8 lg:pb-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <Link 
              href="/tours" 
              className="inline-flex items-center px-4 py-2 border border-darkBrown rounded-lg text-sm font-medium text-darkBrown hover:bg-darkBrown hover:text-beige transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Tours
            </Link>
          </div>
          
          {isLoading && (
            <div className="text-center py-12 bg-beige rounded-lg border border-darkBrown/20 shadow-md">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-darkBrown border-r-transparent"></div>
              <p className="mt-2 text-darkBrown/70 font-serif">Loading tour...</p>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 p-4 rounded-md text-red-800 mb-6 border border-red-200">
              <p>{error}</p>
            </div>
          )}
          
          {!isLoading && !error && tour && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">
                      Walking tour ready
                    </p>
                    <h1 className="mt-2 text-3xl font-serif font-bold text-darkBrown">
                      Tour of {tour.city}, {tour.country}
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-darkBrown/75 sm:text-base">
                      Stop {Math.min(currentIndex + 1, tour.places.length)} of {tour.places.length} · {tour.theme} · {tour.language.toUpperCase()}
                    </p>
                    {shareFeedback && (
                      <p className="mt-3 text-sm font-medium text-darkBrown/70">
                        {shareFeedback}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleShare}
                      className="rounded-lg border border-darkBrown/15 bg-surface px-4 py-3 text-sm font-medium text-darkBrown transition-colors hover:bg-darkBrown hover:text-surface"
                    >
                      Share tour
                    </button>
                  </div>
                </div>
              </div>

              {tour.durationAdapted && tour.requestedDurationMinutes && tour.recommendedDurationMinutes && (
                <div className="relative overflow-hidden rounded-2xl border border-mutedGold/40 bg-surface-elevated p-5 shadow-sm sm:p-6">
                  <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-mutedGold/15" />
                  <div className="relative">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">
                      Curated length
                    </p>
                    <h2 className="mt-2 font-serif text-2xl font-semibold text-darkBrown">
                      We shaped this as a {formatTourDuration(tour.recommendedDurationMinutes)} walk.
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-darkBrown/75 sm:text-base">
                      You asked for {formatTourDuration(tour.requestedDurationMinutes)}, but this city had a stronger, more natural route at {formatTourDuration(tour.recommendedDurationMinutes)}. This version keeps the story dense instead of padding the walk with weaker stops.
                    </p>
                  </div>
                </div>
              )}

              {tour.introduction && currentIndex === 0 && (
                <section className="rounded-2xl border border-mutedGold/35 bg-surface-elevated p-5 shadow-sm sm:p-6">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">Welcome</p>
                  <p className="mt-3 font-serif text-lg leading-8 text-darkBrown">{tour.introduction}</p>
                </section>
              )}

              {tour.places.length > 0 && currentPlace ? (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,1fr)] lg:items-start">
                  <section id="current-stop" className="order-1 space-y-4 lg:order-1">
                    <div className="rounded-2xl border border-darkBrown/12 bg-darkBrown px-4 py-4 text-surface shadow-sm sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold/90">
                            Tour mode
                          </p>
                          <p className="mt-2 text-base font-medium sm:text-lg">
                            Read this stop when you arrive, then continue at your own pace.
                          </p>
                        </div>
                        <span className="rounded-full border border-surface/15 bg-surface/10 px-3 py-1 text-xs font-medium text-surface">
                          {isFinalStop ? 'Final stop' : `Up next: ${nextPlace?.name ?? 'Route end'}`}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            scrollToSection('current-stop');
                          }}
                          className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-darkBrown"
                        >
                          Read this stop
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollToSection('map-panel')}
                          className="rounded-full border border-surface/20 bg-surface/10 px-4 py-2 text-sm font-medium text-surface"
                        >
                          Check route
                        </button>
                        <button
                          type="button"
                          onClick={handleShare}
                          className="rounded-full border border-surface/20 bg-surface/10 px-4 py-2 text-sm font-medium text-surface"
                        >
                          Share
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-darkBrown/12 bg-surface px-4 py-3 shadow-sm sm:px-5">
                      <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">
                        Current stop
                      </p>
                      <div className="mt-2 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-serif font-semibold text-darkBrown sm:text-2xl">
                            {currentPlace.name}
                          </h2>
                          <p className="mt-1 text-sm text-darkBrown/70">
                            {isFinalStop ? 'Final stop of the route' : 'Read here, then continue to the next stop.'}
                          </p>
                          {(currentStopDistance || nextStopDistance || locationMessage) && (
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-darkBrown/70">
                              {currentStopDistance && (
                                <span className="rounded-full border border-darkBrown/12 bg-surface-elevated px-3 py-1">
                                  Current stop: {currentStopDistance}
                                </span>
                              )}
                              {nextStopDistance && !isFinalStop && (
                                <span className="rounded-full border border-darkBrown/12 bg-surface-elevated px-3 py-1">
                                  Next stop: {nextStopDistance}
                                </span>
                              )}
                              {!currentStopDistance && locationMessage && (
                                <span className="rounded-full border border-darkBrown/12 bg-surface-elevated px-3 py-1">
                                  {locationMessage}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-full border border-darkBrown/15 bg-surface-elevated px-3 py-1 text-xs font-medium text-darkBrown">
                            {currentIndex + 1}/{tour.places.length}
                          </span>
                          {currentStopMapUrl && (
                            <a
                              href={currentStopMapUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-darkBrown/15 bg-surface-elevated px-3 py-1 text-xs font-medium text-darkBrown transition-colors hover:bg-darkBrown hover:text-surface"
                            >
                              Open in Maps
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div id="guide-text">
                      <PlaceCard place={currentPlace} language={tour.language} />
                    </div>
                    <div className="rounded-2xl border border-darkBrown/12 bg-surface-elevated p-4 shadow-sm">
                      {isFinalStop ? (
                        <p className="font-serif text-lg font-semibold text-darkBrown">
                          End of tour — thanks for walking with us.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentIndex((index) => Math.min(index + 1, tour.places.length - 1))}
                          className="w-full rounded-lg bg-darkBrown px-4 py-3 font-medium text-surface transition-opacity hover:opacity-90"
                        >
                          Next stop
                        </button>
                      )}
                    </div>
                  </section>

                  <div id="map-panel" className="order-2 lg:order-2">
                    <TourMap
                      key={tour.id}
                      stops={tour.places}
                      currentIndex={currentIndex}
                      onStopSelect={setCurrentIndex}
                      userLocation={isUserNearTour ? userLocation : null}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-beige rounded-lg border border-darkBrown/20">
                  <p className="text-darkBrown/70 italic">No places found for this tour.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {!isLoading && !error && tour && currentPlace && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-darkBrown/12 bg-surface/95 px-4 py-3 shadow-[0_-10px_30px_rgba(74,63,53,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-mutedGold">
                  Text guide
                </p>
                <p className="truncate text-sm font-medium text-darkBrown">
                  Stop {currentIndex + 1}: {currentPlace.name}
                </p>
                <p className="truncate text-xs text-darkBrown/65">
                  {currentStopDistance ?? (isFinalStop ? 'Final stop.' : 'Read here, then continue walking.')}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => scrollToSection('map-panel')}
                className="rounded-xl border border-darkBrown/15 bg-surface-elevated px-3 py-3 text-xs font-medium text-darkBrown"
                >
                  Route
                </button>
              <button
                type="button"
                onClick={handleShare}
                className="rounded-xl border border-darkBrown/15 bg-surface-elevated px-3 py-3 text-xs font-medium text-darkBrown"
              >
                Share
              </button>
              {isFinalStop ? (
                currentStopMapUrl ? (
                  <a
                    href={currentStopMapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-darkBrown/15 bg-surface-elevated px-3 py-3 text-center text-xs font-medium text-darkBrown"
                  >
                    Maps
                  </a>
                ) : (
                  <div className="rounded-xl border border-darkBrown/10 bg-surface-elevated px-3 py-3 text-center text-xs font-medium text-darkBrown/55">
                    Tour done
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((index) => Math.min(index + 1, tour.places.length - 1))}
                  className="rounded-xl border border-darkBrown/15 bg-surface-elevated px-3 py-3 text-xs font-medium text-darkBrown"
                >
                  Next stop
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
