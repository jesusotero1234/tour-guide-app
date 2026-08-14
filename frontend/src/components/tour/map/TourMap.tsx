'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { getWalkingRoute } from '@/lib/api';
import { WalkingRoute } from '@/types/api';
import { createNumberedMarkerIcon } from './markerIcons';
import { TourMapStop } from './types';

const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const tileUrl = process.env.NEXT_PUBLIC_TILE_URL || DEFAULT_TILE_URL;
const tileAttribution = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION;

interface TourMapProps {
  tourId: string;
  stops: TourMapStop[];
  currentIndex: number;
  onStopSelect: (index: number) => void;
  userLocation?: {
    latitude: number;
    longitude: number;
  } | null;
}

type RouteStatus = 'loading' | 'ready' | 'error';

function formatWalkingDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

export function TourMap({ tourId, stops, currentIndex, onStopSelect, userLocation }: TourMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('loading');

  const validStops = useMemo(
    () =>
      stops.filter(
        (stop) => Number.isFinite(stop.latitude)
          && stop.latitude >= -90
          && stop.latitude <= 90
          && Number.isFinite(stop.longitude)
          && stop.longitude >= -180
          && stop.longitude <= 180
      ),
    [stops]
  );
  const stopPoints = useMemo(
    () => validStops.map(
      (stop) => [stop.latitude, stop.longitude] as [number, number]
    ),
    [validStops]
  );
  const streetRoute = useMemo(
    () => walkingRoute?.geometry.coordinates.map(
      ([longitude, latitude]) => [latitude, longitude] as [number, number]
    ) ?? [],
    [walkingRoute]
  );
  const center = useMemo<[number, number]>(
    () => stopPoints[0] ?? [0, 0],
    [stopPoints]
  );
  const userPoint = useMemo(
    () =>
      userLocation
        ? ([userLocation.latitude, userLocation.longitude] as [number, number])
        : null,
    [userLocation]
  );

  useEffect(() => {
    let active = true;
    setWalkingRoute(null);
    setRouteStatus('loading');

    void getWalkingRoute(tourId).then(
      (route) => {
        if (!active) return;
        setWalkingRoute(route);
        setRouteStatus('ready');
      },
      () => {
        if (!active) return;
        setWalkingRoute(null);
        setRouteStatus('error');
      }
    );

    return () => {
      active = false;
    };
  }, [tourId]);

  // Explicit cleanup makes map creation safe under React Strict Mode.
  useEffect(() => {
    if (validStops.length === 0) return;

    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center,
      zoom: 14,
      scrollWheelZoom: true,
      touchZoom: false,
    });
    mapRef.current = map;

    L.tileLayer(tileUrl, {
      attribution: tileAttribution,
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
      polylineRef.current = null;
      userMarkerRef.current = null;
    };
  }, [center, validStops.length]);

  // The real geometry drives the bounds when available; stops remain visible
  // during loading and provider failures.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || stopPoints.length === 0) return;

    const visiblePoints = streetRoute.length > 1
      ? [...streetRoute, ...stopPoints]
      : stopPoints;
    const bounds = L.latLngBounds(userPoint ? [...visiblePoints, userPoint] : visiblePoints);
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
  }, [stopPoints, streetRoute, userPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (streetRoute.length > 1) {
      polylineRef.current = L.polyline(streetRoute, {
        color: '#4A3F35',
        weight: 4,
      }).addTo(map);
    }

    validStops.forEach((stop, index) => {
      const marker = L.marker([stop.latitude, stop.longitude], {
        icon: createNumberedMarkerIcon(
          index + 1,
          index === currentIndex
        ),
      })
        .addTo(map)
        .bindTooltip(stop.name, { direction: 'top' })
        .on('click', () => onStopSelect(index));

      markersRef.current.push(marker);
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userPoint) {
      userMarkerRef.current = L.marker(userPoint, {
        icon: L.divIcon({
          className: 'tour-user-marker',
          html: '<span class="block h-4 w-4 rounded-full border-2 border-white bg-[#3B82F6] shadow-[0_0_0_6px_rgba(59,130,246,0.20)]"></span>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      })
        .addTo(map)
        .bindTooltip('Your location', { direction: 'top' });
    }
  }, [validStops, streetRoute, currentIndex, onStopSelect, userPoint]);

  if (validStops.length === 0) {
    return (
      <div className="flex h-[38vh] min-h-72 items-center justify-center rounded-2xl border border-darkBrown/12 bg-surface-elevated text-darkBrown/70 shadow-sm lg:h-[50vh]">
        Map unavailable for this tour.
      </div>
    );
  }

  return (
    <div aria-busy={routeStatus === 'loading'}>
      <div className="relative">
        <div
          ref={containerRef}
          role="region"
          aria-label="Walking tour map"
          className="h-[38vh] min-h-72 overflow-hidden rounded-2xl border border-darkBrown/12 shadow-sm lg:h-[70vh]"
        />
        {userPoint && (
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current as (L.Map & { setView?: (center: [number, number], zoom?: number) => void }) | null;
              map?.setView?.(userPoint, 16);
            }}
            className="absolute right-3 top-3 rounded-full border border-darkBrown/12 bg-surface/95 px-3 py-2 text-xs font-medium text-darkBrown shadow-sm backdrop-blur"
          >
            Center me
          </button>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-darkBrown/12 bg-surface-elevated px-4 py-3 text-sm text-ink-muted shadow-sm">
        <p role="status" aria-live="polite">
          {routeStatus === 'loading' && 'Loading street route…'}
          {routeStatus === 'error' && 'Street route unavailable; stop markers are still accurate.'}
          {routeStatus === 'ready' && walkingRoute && (
            `${formatWalkingDistance(walkingRoute.distanceMeters)} · ${Math.round(walkingRoute.durationSeconds / 60)} min walk`
          )}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Walking route:{' '}
          <a
            href="https://routing.openstreetmap.de/about.html"
            className="underline decoration-darkBrown/30 underline-offset-2 hover:text-darkBrown focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-darkBrown"
          >
            FOSSGIS/OSRM
          </a>
          {' · '}
          <a
            href="https://www.openstreetmap.org/fixthemap"
            className="underline decoration-darkBrown/30 underline-offset-2 hover:text-darkBrown focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-darkBrown"
          >
            Fix the map
          </a>
        </p>
      </div>
    </div>
  );
}
