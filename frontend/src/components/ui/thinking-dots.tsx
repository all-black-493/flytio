"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

/**
 * Three dots that rise in sequence while something is being generated.
 *
 * Replaces a static "Thinking…", which is indistinguishable from a frozen
 * UI: the whole job of this indicator is to prove the app is alive during
 * a wait it cannot predict the length of. A model reply can take ten
 * seconds, and ten seconds of unchanging text reads as broken.
 *
 * useGSAP rather than a bare useEffect: it scopes selectors to the
 * container and reverts the timeline on unmount. A `repeat: -1` tween is
 * cheap to run and leaks if it is never killed - the widget mounts and
 * unmounts every time the panel opens, so an orphaned loop per open would
 * accumulate for the life of the page.
 */
export function ThinkingDots({ label = "Thinking" }: { label?: string }) {
  const scope = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      // Gated on the OS reduced-motion setting. Without motion the label
      // still says "Thinking", so the state is never conveyed by movement
      // alone - the dots are reinforcement, not the message.
      const mm = gsap.matchMedia(scope);
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Under 1.5s per cycle: a longer loop spends too long looking
        // motionless mid-beat, which is the thing being avoided.
        gsap.timeline({ repeat: -1 }).to(".thinking-dot", {
          y: -4,
          duration: 0.4,
          ease: "power1.inOut",
          stagger: { each: 0.15, yoyo: true, repeat: 1 },
        });
      });
    },
    { scope },
  );

  return (
    <span
      ref={scope}
      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
      // One announcement, not one per frame: the dots are decoration, the
      // label is the message. polite so it never interrupts a screen
      // reader mid-sentence.
      role="status"
      aria-live="polite"
    >
      {label}
      <span aria-hidden className="flex items-end gap-[3px] pb-[2px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="thinking-dot size-1 rounded-full bg-signal" />
        ))}
      </span>
    </span>
  );
}
