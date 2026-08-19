"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

/**
 * The wait after someone picks a flight.
 *
 * A skeleton is the right answer for a list, because the shape it fakes
 * is the shape that arrives. This wait is different: one flight has been
 * chosen and the app is re-pricing it with the airline, which takes a
 * second or two of real work. Faking rows of a page nobody is looking at
 * yet says less than showing the thing that is actually happening.
 *
 * So it borrows the product's own figure - the dashed route with a plane
 * on it, the same one on the ticket (components/tickets/TicketDocument)
 * and in the PDF. Reusing the existing idiom means this reads as part of
 * flyt rather than as a generic spinner someone dropped in.
 */
export function FlightPathLoading({
  label = "Confirming this fare with the airline",
}: {
  label?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia(scope);
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // The plane crosses, the trail fills behind it, both on one
        // timeline so they cannot drift apart. A single repeating
        // timeline is also one thing to revert on unmount, which useGSAP
        // does for us.
        gsap
          .timeline({ repeat: -1, repeatDelay: 0.15 })
          .fromTo(
            ".fp-plane",
            { xPercent: 0 },
            { xPercent: 100, duration: 1.6, ease: "power1.inOut" },
            0,
          )
          .fromTo(
            ".fp-trail",
            { scaleX: 0, transformOrigin: "left center" },
            { scaleX: 1, duration: 1.6, ease: "power1.inOut" },
            0,
          );
      });
    },
    { scope },
  );

  return (
    <div
      ref={scope}
      className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 sm:px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div aria-hidden className="relative w-full max-w-sm">
        {/* The route the plane runs along, dashed like every other flight
            path in the product. */}
        <div className="flex items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full bg-signal" />
          <div className="relative h-px flex-1">
            <div className="absolute inset-0 border-t border-dashed border-muted-foreground/40" />
            <div className="fp-trail absolute inset-0 border-t border-signal" />
          </div>
          <span className="size-1.5 shrink-0 rounded-full bg-signal" />
        </div>

        {/* Offset by its own width so it starts on the origin dot and
            lands on the destination one, rather than overshooting. */}
        <div className="pointer-events-none absolute inset-x-3 -top-2">
          <svg
            viewBox="0 0 24 24"
            className="fp-plane size-4 fill-signal"
            style={{ marginLeft: "-0.5rem" }}
          >
            <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
          </svg>
        </div>
      </div>

      <p className="mt-8 font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}
