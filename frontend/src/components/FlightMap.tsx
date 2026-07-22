"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Map, useControl } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { DeckProps } from "@deck.gl/core";

/**
 * Ambient world map showing flyt routes as great-circle arcs with planes
 * traveling along them. Adapted from louisyoong/react-mapbox-flight-tracker
 * (deck.gl over react-map-gl); planes are rendered as glowing points because
 * 3D models are illegible at world zoom.
 */

const OSL: [number, number] = [10.75, 59.91];

const ROUTES: {
  to: [number, number];
  code: string;
  durationMs: number;
  phase: number;
}[] = [
  { to: [-73.78, 40.64], code: "JFK", durationMs: 26000, phase: 0.15 },
  { to: [12.65, 55.62], code: "CPH", durationMs: 9000, phase: 0.6 },
  { to: [-0.45, 51.47], code: "LHR", durationMs: 12000, phase: 0.35 },
  { to: [8.57, 50.03], code: "FRA", durationMs: 12000, phase: 0.8 },
  { to: [55.36, 25.25], code: "DXB", durationMs: 24000, phase: 0.5 },
  { to: [103.99, 1.36], code: "SIN", durationMs: 34000, phase: 0.05 },
  { to: [-118.4, 33.94], code: "LAX", durationMs: 36000, phase: 0.7 },
  { to: [-22.6, 63.98], code: "KEF", durationMs: 14000, phase: 0.25 },
  { to: [139.78, 35.55], code: "HND", durationMs: 34000, phase: 0.45 },
];

/** Great-circle interpolation between two [lng, lat] points. */
function slerp(
  from: [number, number],
  to: [number, number],
  t: number,
): [number, number] {
  const rad = Math.PI / 180;
  const [λ1, φ1] = [from[0] * rad, from[1] * rad];
  const [λ2, φ2] = [to[0] * rad, to[1] * rad];
  const a = [
    Math.cos(φ1) * Math.cos(λ1),
    Math.cos(φ1) * Math.sin(λ1),
    Math.sin(φ1),
  ];
  const b = [
    Math.cos(φ2) * Math.cos(λ2),
    Math.cos(φ2) * Math.sin(λ2),
    Math.sin(φ2),
  ];
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ω = Math.acos(Math.min(1, Math.max(-1, dot)));
  if (ω < 1e-6) return from;
  const s1 = Math.sin((1 - t) * ω) / Math.sin(ω);
  const s2 = Math.sin(t * ω) / Math.sin(ω);
  const p = [
    s1 * a[0] + s2 * b[0],
    s1 * a[1] + s2 * b[1],
    s1 * a[2] + s2 * b[2],
  ];
  const φ = Math.atan2(p[2], Math.hypot(p[0], p[1]));
  const λ = Math.atan2(p[1], p[0]);
  return [λ / rad, φ / rad];
}

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

/** True once the html element carries the .dark class; tracks toggle changes. */
function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const update = () => setDark(html.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

const emptySubscribe = () => () => {};

export default function FlightMap({ className = "" }: { className?: string }) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const dark = useIsDark();
  const [time, setTime] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setTime(now - start);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const arcLayer = useMemo(
    () =>
      new ArcLayer({
        id: "flyt-routes",
        data: ROUTES,
        greatCircle: true,
        getSourcePosition: () => OSL,
        getTargetPosition: (d: (typeof ROUTES)[number]) => d.to,
        getSourceColor: dark ? [126, 147, 170, 90] : [85, 103, 124, 70],
        getTargetColor: dark ? [255, 90, 20, 190] : [255, 79, 0, 170],
        getWidth: 1.4,
        updateTriggers: { getSourceColor: dark, getTargetColor: dark },
      }),
    [dark],
  );

  const planeLayer = useMemo(() => {
    const points = ROUTES.flatMap((route) => {
      const progress = (time / route.durationMs + route.phase) % 1;
      return [0, 0.015, 0.03].map((lag, i) => ({
        position: slerp(OSL, route.to, Math.max(0, progress - lag)),
        head: i === 0,
      }));
    });
    return new ScatterplotLayer({
      id: "flyt-planes",
      data: points,
      getPosition: (d: { position: [number, number] }) => d.position,
      getFillColor: (d: { head: boolean }) =>
        d.head ? [255, 79, 0, 255] : [255, 79, 0, 90],
      getRadius: (d: { head: boolean }) => (d.head ? 3.2 : 1.8),
      radiusUnits: "pixels",
    });
  }, [time]);

  if (!mounted) return <div className={className} aria-hidden="true" />;

  return (
    <div
      className={`flight-map ${className} transition-opacity duration-1000 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    >
      <Map
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={{ longitude: -5, latitude: 45, zoom: 1.4 }}
        mapStyle={
          dark
            ? "mapbox://styles/mapbox/dark-v11"
            : "mapbox://styles/mapbox/light-v11"
        }
        projection="mercator"
        interactive={false}
        attributionControl={false}
        onLoad={() => setLoaded(true)}
        reuseMaps
        style={{ width: "100%", height: "100%" }}
      >
        <DeckGLOverlay layers={[arcLayer, planeLayer]} />
      </Map>
    </div>
  );
}
