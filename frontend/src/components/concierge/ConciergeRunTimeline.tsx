"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";

/** Every tool the concierge can call, phrased as what the *traveller*
 * would say is happening. Present tense while it runs, past tense once
 * it's done, so a completed step reads as history rather than something
 * still in flight. */
export const TOOL_STEPS: Record<string, { running: string; done: string }> = {
  search_flights: { running: "Searching flights", done: "Searched flights" },
  get_my_booking: { running: "Looking up your booking", done: "Found your booking" },
  get_cancellation_quote: {
    running: "Getting a cancellation quote",
    done: "Got the cancellation quote",
  },
  confirm_cancellation: { running: "Cancelling", done: "Cancelled" },
  search_change_options: {
    running: "Searching change options",
    done: "Found change options",
  },
};

export type RunStepState = "running" | "done" | "error";

export interface RunStep {
  id: string;
  tool: string;
  state: RunStepState;
  /** Short summary of what the tool was asked to do, e.g. "NBO → DXB" -
   * built by the caller, which is the only place the argument shapes are
   * known. */
  detail?: string;
}

function label(step: RunStep): string {
  const copy = TOOL_STEPS[step.tool];
  if (!copy) return step.tool.replace(/_/g, " ");
  return step.state === "running" ? copy.running : copy.done;
}

/**
 * The agent's visible working-out: one line per tool call, updating in
 * place as it moves from running to done.
 *
 * This exists because a tool call is dead air otherwise. The concierge
 * can spend several seconds calling Duffel, and with only the model's
 * text streamed the panel sits blank and reads as broken - the single
 * most common complaint about agent UIs. Showing the steps also makes
 * the answer legible: "Searched flights" tells you the price it quotes
 * came from a live search rather than from the model's memory.
 */
export function ConciergeRunTimeline({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) return null;

  return (
    <ol className="space-y-1 border-l border-dashed border-border pl-3">
      {steps.map((step) => (
        <li
          key={step.id}
          className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
        >
          {step.state === "running" && (
            <Loader2 className="size-3 shrink-0 animate-spin text-signal" />
          )}
          {step.state === "done" && <Check className="size-3 shrink-0 text-signal" />}
          {step.state === "error" && (
            <TriangleAlert className="size-3 shrink-0 text-destructive" />
          )}
          <span className={step.state === "error" ? "text-destructive" : undefined}>
            {label(step)}
            {step.detail ? <span className="opacity-70"> · {step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Tools this widget knows how to narrate. Used to tell "known tool
 * whose output failed to parse" (worth surfacing) from "tool we have no
 * card for yet" (silent - the model's own reply carries it). */
export const KNOWN_CONCIERGE_TOOLS = new Set(Object.keys(TOOL_STEPS));
