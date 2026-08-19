"use client";

import { useEffect, useRef } from "react";

import { Confetti, type ConfettiRef } from "@/components/ui/confetti";

/**
 * A single burst when a booking is confirmed.
 *
 * Its own client component rather than confetti inside BookingConfirmation:
 * that component is shared by two flows and has no "use client" of its
 * own, and a celebration is not a reason to make an entire confirmation
 * screen client-rendered.
 *
 * Two things it must not do:
 *
 * Fire twice. The payment-callback screen polls its status query every two
 * seconds, so this component re-renders long after the booking is
 * confirmed. The ref guard means the burst belongs to the moment the
 * booking landed, not to every poll that follows.
 *
 * Fire at all for someone who asked for less motion. A full-screen
 * particle burst is exactly the kind of animation that triggers vestibular
 * symptoms, and it carries no information - the screen already says
 * "You're booked" with a reference number. Skipping it costs nothing.
 */
export function BookingCelebration() {
  const ref = useRef<ConfettiRef>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    fired.current = true;

    ref.current?.fire({
      particleCount: 90,
      spread: 70,
      // From just below the card's header, so it reads as coming off the
      // confirmation rather than raining from the top of the window.
      origin: { y: 0.35 },
      // The brand's single accent plus two neutrals - a full rainbow would
      // be the one place in the product that ignores its own palette.
      colors: ["#ff4f00", "#f6f8fa", "#55677c"],
    });
  }, []);

  return (
    <Confetti
      ref={ref}
      manualstart
      // Decoration over a screen that already conveys success in text, so
      // it is hidden from assistive tech and cannot swallow a click on the
      // buttons underneath.
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 size-full"
    />
  );
}
