"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

/**
 * The loading state every route shows while its server component streams.
 *
 * Rendered from each segment's `loading.tsx`, which Next wraps around the
 * page in a Suspense boundary. SSR does not remove the wait - it moves it
 * to the server - so without this the browser sits on the previous page
 * with nothing happening, which reads as a dead click.
 *
 * Shaped like the board it is standing in for, not a generic spinner: a
 * skeleton that matches the layout about to arrive makes the swap feel
 * like completion rather than replacement.
 */
export function PageLoading({
  label = "LOADING",
  rows = 5,
}: {
  label?: string;
  rows?: number;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // A gradient sweep, not an opacity pulse: a moving highlight reads
      // as "working", where fading in and out reads as "broken".
      //
      // matchMedia gates it on the OS setting - GSAP reverts the tween
      // automatically when the query stops matching, and for anyone who
      // asked for less motion the skeleton simply sits still rather than
      // animating. The layout is identical either way.
      const mm = gsap.matchMedia(scope);
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(".skeleton-row", {
          backgroundPosition: "200% 0",
          duration: 1.4,
          ease: "sine.inOut",
          repeat: -1,
          // One timeline, staggered - not one loop per row. Independent
          // loops drift out of phase and stop reading as a single surface.
          stagger: 0.08,
        });
      });
    },
    { scope },
  );

  return (
    <div
      ref={scope}
      className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}, please wait</span>

      <div className="overflow-hidden rounded-2xl bg-board ring-1 ring-board-line">
        <div className="flex items-center justify-between px-4 py-4 sm:px-6">
          <span
            aria-hidden
            className="font-mono text-xs tracking-[0.3em] text-board-muted"
          >
            {label}
          </span>
          <span aria-hidden className="font-mono text-[10px] tracking-[0.2em] text-signal">
            ●
          </span>
        </div>

        <div aria-hidden className="space-y-px border-t border-board-line">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-4 py-4 sm:px-6">
              <div
                className="skeleton-row h-4 w-full rounded"
                style={{
                  // The sweep the tween animates. Kept inline because it is
                  // the animation's subject, not decoration a class would
                  // own - moving it to CSS would split the effect in two.
                  backgroundImage:
                    "linear-gradient(90deg, var(--board-line) 0%, var(--board-muted) 50%, var(--board-line) 100%)",
                  backgroundSize: "200% 100%",
                  opacity: 0.35,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
