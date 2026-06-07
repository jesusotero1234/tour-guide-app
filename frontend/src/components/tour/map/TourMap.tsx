'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { createNumberedMarkerIcon } from './markerIcons';
import { TourMapStop } from './types';

const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const tileUrl = process.env.NEXT_PUBLIC_TILE_URL || DEFAULT_TILE_URL;
const tileAttribution = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION;

interface TourMapProps {
  stops: TourMapStop[];
  currentIndex: number;
  onStopSelect: (index: number) => void;
  userLocation?: {
    latitude: number;
    longitude: number;
  } | null;
}

export function TourMap({ stops, currentIndex, onStopSelect, userLocation }: TourMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const validStops = useMemo(
    () =>
      stops.filter(
        (stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
      ),
    [stops]
  );

  const route = validStops.map(
    (stop) => [stop.latitude, stop.longitude] as [number, number]
  );
  const center = route[0] ?? [0, 0];
  const userPoint = useMemo(
    () =>
      userLocation
        ? ([userLocation.latitude, userLocation.longitude] as [number, number])
        : null,
    [userLocation]
  );

  // Create and destroy the map instance on mount/unmount.
  // Using useEffect with explicit remove() handles React StrictMode
  // double-invoke correctly — the cleanup runs and clears _leaflet_id
  // before the second mount.
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
    // Only recreate the map when stops change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validStops]);

  // Fit bounds whenever route changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || route.length === 0) return;

    const bounds = L.latLngBounds(userPoint ? [...route, userPoint] : route);
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
  }, [route, userPoint]);

  // Sync markers and active state on index/props change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Clear old polyline
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Add route polyline
    if (route.length > 1) {
      polylineRef.current = L.polyline(route, {
        color: '#4A3F35',
        weight: 4,
      }).addTo(map);
    }

    // Add markers
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
  }, [validStops, route, currentIndex, onStopSelect, userPoint]);

  if (validStops.length === 0) {
    return (
      <div className="flex h-[38vh] min-h-72 items-center justify-center rounded-2xl border border-darkBrown/12 bg-surface-elevated text-darkBrown/70 shadow-sm lg:h-[50vh]">
        Map unavailable for this tour.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
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
  );
}
