/**
 * Ambient world-map silhouette used behind the hero and auth screens.
 *
 * Replaces the animated mapbox/deck.gl radar with a static, transparent SVG.
 * The map lives in /public/world-map.svg and is applied as a CSS mask (see the
 * `.world-map-mask` utility in globals.css) so we can tint + fade it with theme
 * tokens without shipping the ~350 KB asset through the JS bundle.
 */
export default function WorldMapBackground({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* continents, tinted a cool slate and faded into the void */}
      <div className="world-map-mask absolute inset-0 bg-[#35608d] opacity-[0.16]" />
      {/* a single quiet signal beacon keeps the "live routes" identity without
          the busy radar sweep */}
      <span className="absolute left-[46%] top-[38%] size-1.5 rounded-full bg-signal/70 shadow-[0_0_12px_2px_rgba(255,90,20,0.5)]" />
    </div>
  );
}
