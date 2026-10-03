'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { getWalkingRoute } from '@/lib/api';
import { WalkingRoute } from '@/types/api';
import { createNumberedMarkerIcon } from './markerIcons';
import { TourMapStop } from './types';
import { listeningCopy } from '../listeningCopy';
import { flexibleCopy } from '../flexibleCopy';
import { formatDistanceLabel } from '@/lib/geo';
import { PinIcon } from '../icons';

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const tileUrl = process.env.NEXT_PUBLIC_TILE_URL || DEFAULT_TILE_URL;
const tileAttribution = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION;

interface TourMapProps {
  tourId: string;
  compact?: boolean;
  language?: string;
  stops: TourMapStop[];
  currentIndex: number;
  onStopSelect: (index: number) => void;
  /** Lets a visitor open a stop from its marker; the marker then shows a small menu instead of only choosing the destination. */
  onStopOpen?: (index: number) => void;
  /** Shown on the map as one visible tap to turn location on, until it is on. */
  onLocate?: () => void;
  /** The legs of a custom order, one per consecutive pair of `stops`. A leg without a line is drawn as a dashed straight line. */
  routeLegs?: Array<{ line: Array<[number, number]> | null }>;
  userLocation?: {
    latitude: number;
    longitude: number;
    /** Metres of uncertainty of the reading; drawn as a circle around the visitor. */
    accuracy?: number;
  } | null;
}

type RouteStatus = 'loading' | 'ready' | 'error';
type LatLngTuple = [number, number];

const validCoordinate = (stop: TourMapStop) => Number.isFinite(stop.latitude) && stop.latitude >= -90 && stop.latitude <= 90
  && Number.isFinite(stop.longitude) && stop.longitude >= -180 && stop.longitude <= 180;

export function TourMap({ tourId, stops, currentIndex, onStopSelect, onStopOpen, onLocate, routeLegs, userLocation, compact = false, language = 'en' }: TourMapProps) {
  const t = listeningCopy(language);
  const f = flexibleCopy(language);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const linesRef = useRef<L.Polyline[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  // What the map was last fitted to, and whether the visitor has moved it since: their zoom and position are never taken away
  // by a resize or by a redraw, only by a different tour or a different order of the stops.
  const fitted = useRef<{ structure: string; route: string; touched: boolean }>({ structure: '', route: '', touched: false });
  const programmatic = useRef(false);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('loading');

  const validStops = useMemo(() => stops.filter(validCoordinate), [stops]);
  const hasStops = validStops.length > 0;
  const stopPoints = useMemo(() => validStops.map(stop => [stop.latitude, stop.longitude] as LatLngTuple), [validStops]);
  const streetRoute = useMemo(() => walkingRoute?.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as LatLngTuple) ?? [], [walkingRoute]);
  const userPoint = useMemo(() => (userLocation ? ([userLocation.latitude, userLocation.longitude] as LatLngTuple) : null), [userLocation]);
  const custom = !!routeLegs;
  const hasOpen = !!onStopOpen;
  const structureKey = tourId + ':' + stops.map(stop => stop.id).join(',');

  // The handlers read the latest callbacks, so that redrawing the markers never depends on the identity of a function.
  const latest = useRef({ onStopSelect, onStopOpen });
  useEffect(() => { latest.current = { onStopSelect, onStopOpen }; });

  useEffect(() => {
    let active = true;
    setWalkingRoute(null);
    setRouteStatus('loading');
    void getWalkingRoute(tourId).then(
      route => { if (active) { setWalkingRoute(route); setRouteStatus('ready'); } },
      () => { if (active) { setWalkingRoute(null); setRouteStatus('error'); } },
    );
    return () => { active = false; };
  }, [tourId]);

  // One map for the tour. Explicit cleanup keeps creation safe under React Strict Mode.
  useEffect(() => {
    if (!hasStops) return;
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, {
      center: stopPoints[0],
      zoom: 14,
      scrollWheelZoom: true,
      touchZoom: true,
      // Avoid Leaflet's delayed zoom callback firing after the compact view closes.
      zoomAnimation: !compact,
    });
    mapRef.current = map;
    L.tileLayer(tileUrl, { attribution: tileAttribution }).addTo(map);
    const touched = () => { if (!programmatic.current) fitted.current.touched = true; };
    map.on('dragstart zoomstart', touched);
    // Only the size is refreshed on a resize (a status message, a rotation): never the bounds.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = new Map();
      linesRef.current = [];
      userMarkerRef.current = null;
      accuracyRef.current = null;
      fitted.current = { structure: '', route: '', touched: false };
    };
  // The map is created again only for another tour, a change of layout or when stops appear; never for a new order.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, compact, hasStops]);

  // Fit the bounds when the tour or the order of the stops changes, and once more when the street route arrives, unless the visitor
  // has already zoomed or dragged the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || stopPoints.length === 0) return;
    const routeKey = custom ? 'custom' : routeStatus;
    const state = fitted.current;
    if (state.structure === structureKey && state.route === routeKey) return;
    if (state.structure === structureKey && state.touched) { state.route = routeKey; return; }
    const lines = custom ? (routeLegs ?? []).flatMap(leg => leg.line ?? []) : streetRoute;
    const bounds = L.latLngBounds(lines.length > 1 ? [...lines, ...stopPoints] : stopPoints);
    programmatic.current = true;
    map.invalidateSize({ pan: false });
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
    programmatic.current = false;
    fitted.current = { structure: structureKey, route: routeKey, touched: false };
  }, [structureKey, stopPoints, streetRoute, routeLegs, custom, routeStatus]);

  // The line of the walk: the street route of the published order, or the legs between consecutive stops in the order walked.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    linesRef.current.forEach(line => line.remove());
    linesRef.current = [];
    if (routeLegs) {
      routeLegs.forEach((leg, i) => {
        const from = stops[i], to = stops[i + 1];
        if (!from || !to) return;
        const points = leg.line ?? ([[from.latitude, from.longitude], [to.latitude, to.longitude]] as LatLngTuple[]);
        linesRef.current.push(L.polyline(points, { color: '#4A3F35', weight: 4, ...(leg.line ? {} : { dashArray: '6 8', opacity: 0.7 }) }).addTo(map));
      });
    } else if (streetRoute.length > 1) {
      linesRef.current.push(L.polyline(streetRoute, { color: '#4A3F35', weight: 4 }).addTo(map));
    }
  }, [routeLegs, streetRoute, stops, hasStops]);

  // Markers by difference: the same marker is reused when only the numbering or the highlighted stop changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const wanted = new Set(validStops.map(stop => stop.id));
    markersRef.current.forEach((marker, id) => { if (!wanted.has(id)) { marker.remove(); markersRef.current.delete(id); } });
    validStops.forEach(stop => {
      const index = stops.indexOf(stop);
      const icon = createNumberedMarkerIcon(index + 1, index === currentIndex);
      let marker = markersRef.current.get(stop.id);
      if (!marker) {
        marker = L.marker([stop.latitude, stop.longitude], { icon }).addTo(map).bindTooltip(stop.name, { direction: 'top' });
        markersRef.current.set(stop.id, marker);
      } else {
        marker.setLatLng([stop.latitude, stop.longitude]);
        marker.setIcon(icon);
        marker.setTooltipContent(stop.name);
      }
      marker.off('click');
      marker.unbindPopup();
      if (hasOpen) {
        // The marker opens a small menu: look at the stop, or only walk to it.
        const menu = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = stop.name;
        const view = document.createElement('button');
        view.type = 'button'; view.textContent = f.viewStop; view.style.cssText = 'display:block;min-height:44px;min-width:44px;margin-top:6px;text-decoration:underline';
        view.onclick = () => { marker?.closePopup(); latest.current.onStopOpen?.(index); };
        const walk = document.createElement('button');
        walk.type = 'button'; walk.textContent = f.walkHere; walk.style.cssText = 'display:block;min-height:44px;min-width:44px;text-decoration:underline';
        walk.onclick = () => { marker?.closePopup(); latest.current.onStopSelect(index); };
        menu.append(title, view, walk);
        marker.bindPopup(menu);
      } else marker.on('click', () => latest.current.onStopSelect(index));
    });
  }, [validStops, stops, currentIndex, hasOpen, f.viewStop, f.walkHere, hasStops]);

  // The visitor, with the circle of the accuracy of the reading.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove(); userMarkerRef.current = null;
    accuracyRef.current?.remove(); accuracyRef.current = null;
    if (!userPoint) return;
    const accuracy = userLocation?.accuracy;
    if (Number.isFinite(accuracy) && (accuracy as number) > 0 && (accuracy as number) <= 5000) {
      accuracyRef.current = L.circle(userPoint, { radius: accuracy as number, color: '#3B82F6', weight: 1, opacity: 0.5, fillColor: '#3B82F6', fillOpacity: 0.12, interactive: false }).addTo(map);
    }
    userMarkerRef.current = L.marker(userPoint, {
      icon: L.divIcon({
        className: 'tour-user-marker',
        html: '<span class="block h-4 w-4 rounded-full border-2 border-white bg-[#3B82F6] shadow-[0_0_0_6px_rgba(59,130,246,0.20)]"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(map).bindTooltip(t.yourLocation + (Number.isFinite(accuracy) ? ` · ${t.accuracy} ±${formatDistanceLabel(accuracy as number, language)}` : ''), { direction: 'top' });
  }, [userPoint, userLocation?.accuracy, t.yourLocation, t.accuracy, language, hasStops]);

  if (!hasStops) {
    return (
      <div className="flex h-[38vh] min-h-72 items-center justify-center rounded-2xl border border-darkBrown/12 bg-surface-elevated text-darkBrown/70 shadow-sm lg:h-[50vh]">
        {t.noMap}
      </div>
    );
  }

  return (
    <div className={compact ? 'tour-map-compact' : undefined} aria-busy={routeStatus === 'loading'}>
      <div className="relative map-frame">
        <div
          ref={containerRef}
          role="region"
          aria-label={t.mapLabel}
          className="map-canvas h-[38vh] min-h-72 overflow-hidden rounded-2xl border border-darkBrown/12 shadow-sm lg:h-[70vh]"
        />
        {!userPoint && onLocate && (
          <button type="button" onClick={onLocate} className="map-center map-locate absolute left-3 bottom-8 flex items-center gap-2 rounded-full border border-darkBrown/12 bg-surface/95 px-4 py-2 text-sm font-medium text-darkBrown shadow-sm backdrop-blur">
            <PinIcon /> {f.useLocation}
          </button>
        )}
        {userPoint && (
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              programmatic.current = true;
              map.setView(userPoint, Math.max(map.getZoom(), 16));
              programmatic.current = false;
            }}
            className="map-center absolute left-3 bottom-8 rounded-full border border-darkBrown/12 bg-surface/95 px-3 py-2 text-xs font-medium text-darkBrown shadow-sm backdrop-blur"
          >
            {t.centerOnMe}
          </button>
        )}
      </div>

      <div className={compact ? 'map-route-status' : 'mt-3 rounded-xl border border-darkBrown/12 bg-surface-elevated px-4 py-3 text-sm text-ink-muted shadow-sm'}>
        <p role="status" aria-live="polite">
          {!custom && routeStatus === 'loading' && t.routeLoading}
          {!custom && routeStatus === 'error' && t.routeError}
          {!custom && routeStatus === 'ready' && walkingRoute && (
            `${formatDistanceLabel(walkingRoute.distanceMeters, language)} · ${Math.round(walkingRoute.durationSeconds / 60)} min ${t.walk}`
          )}
        </p>
        {<p className="mt-1 text-xs text-ink-muted">
          {t.walkingRoute}:{' '}
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
            {t.fixMap}
          </a>
        </p>}
      </div>
    </div>
  );
}
