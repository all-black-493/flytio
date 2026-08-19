"use client";

import { ThinkingOrb as Orb, type OrbState } from "thinking-orbs";

/**
 * The concierge's "I'm working on it" indicator.
 *
 * Wraps `thinking-orbs` (MIT, no runtime dependencies) rather than using
 * it raw, so the label, sizing and state mapping live in one place and
 * the library stays swappable - it is a young 0.x package, and the cost
 * of replacing it should stay confined to this file.
 *
 * The orb carries the state, the text carries the meaning. Anyone who
 * cannot see the animation - reduced motion, a screen reader, a canvas
 * that failed to paint - still reads what is happening.
 */
export function ThinkingOrb({
  state = "working",
  label = "Thinking",
}: {
  state?: OrbState;
  label?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      {/* 20 is the library's inline-text preset - its own design, not a
          scaled-down 64, so it stays legible next to 11px type. */}
      <Orb state={state} size={20} aria-hidden />
      {label}
    </span>
  );
}

/**
 * What the agent is doing, as an orb state and a verb.
 *
 * Driven by the same tool-call events the run timeline reads, so the
 * indicator says "Searching flights" while a search is actually running
 * instead of a generic "Thinking" for the whole turn - which is the
 * difference between a wait that feels observed and one that feels stuck.
 */
export function orbForTools(toolNames: readonly string[]): {
  state: OrbState;
  label: string;
} {
  if (toolNames.includes("search_flights")) {
    return { state: "searching", label: "Searching flights" };
  }
  if (toolNames.some((n) => n.includes("cancel") || n.includes("change"))) {
    return { state: "solving", label: "Checking your options" };
  }
  if (toolNames.includes("get_my_booking")) {
    return { state: "connecting", label: "Finding your booking" };
  }
  return { state: "working", label: "Thinking" };
}
