"use client";

import { createChatClientOptions, fetchServerSentEvents } from "@tanstack/ai-client";
import { useChat } from "@tanstack/ai-react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import { ThinkingOrb, orbForTools } from "@/components/ui/thinking-orb";
import {
  ConciergeBookingSummaryCard,
  ConciergeCancellationQuoteCard,
  ConciergeChangeOptionCard,
} from "@/components/concierge/ConciergeBookingCards";
import { ConciergeFlightCard } from "@/components/concierge/ConciergeFlightCard";
import {
  ConciergeRunTimeline,
  KNOWN_CONCIERGE_TOOLS,
  type RunStep,
} from "@/components/concierge/ConciergeRunTimeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/api/client";
import {
  conciergeBookingSummarySchema,
  conciergeCancellationQuoteSchema,
  conciergeChangeOptionSchema,
  conciergeFlightCardSchema,
} from "@/lib/api/schemas";

const EXAMPLE_PROMPTS = [
  "Find me the cheapest flight to Dubai next month",
  "What are my options from Nairobi to London next week?",
];

/** The fields this widget reads off a streamed tool call. Structural, so
 * it stays valid whether the part arrives typed or as the base shape. */
interface ToolCallLike {
  type: "tool-call";
  id: string;
  name: string;
  state: string;
  input?: unknown;
  output?: unknown;
}

/** One-line "what was it asked to do", shown beside a timeline step so
 * the user can see the agent understood them - "NBO → DXB" catches a
 * misheard city immediately, where a bare "Searching flights" would not.
 * Best-effort: the input is streamed and may still be partial. */
function summariseToolInput(tool: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const args = input as Record<string, unknown>;
  if (tool === "search_flights" || tool === "search_change_options") {
    const from = args.origin_iata_code ?? args.origin;
    const to = args.destination_iata_code ?? args.destination;
    if (typeof from === "string" && typeof to === "string") return `${from} → ${to}`;
  }
  const ref = args.booking_reference;
  return typeof ref === "string" ? ref : undefined;
}

/** Renders one tool's `output-available` payload as its card(s), or null
 * if the shape doesn't parse - same don't-trust-the-network-boundary
 * posture client.ts's zod parsing has everywhere else, just applied to
 * the agent's tool-output channel instead of a fetch response body. A
 * `null` return is ambiguous between "known tool, bad shape" (an error,
 * worth surfacing) and "tool this widget has no card for yet" (not an
 * error - the model's own text reply still carries the content) -
 * KNOWN_CONCIERGE_TOOLS at the call site disambiguates the two. */
function renderToolOutput(
  toolName: string,
  output: unknown,
  authed: boolean,
): React.ReactNode {
  switch (toolName) {
    case "search_flights": {
      const parsed = conciergeFlightCardSchema.array().safeParse(output);
      if (!parsed.success) return null;
      return (
        <div className="space-y-2">
          {parsed.data.map((card) => (
            <ConciergeFlightCard key={card.offer_id} offer={card} authed={authed} />
          ))}
        </div>
      );
    }
    case "get_my_booking": {
      const parsed = conciergeBookingSummarySchema.safeParse(output);
      if (!parsed.success) return null;
      return <ConciergeBookingSummaryCard booking={parsed.data} />;
    }
    case "get_cancellation_quote":
    case "confirm_cancellation": {
      const parsed = conciergeCancellationQuoteSchema.safeParse(output);
      if (!parsed.success) return null;
      return <ConciergeCancellationQuoteCard quote={parsed.data} />;
    }
    case "search_change_options": {
      const parsed = conciergeChangeOptionSchema.array().safeParse(output);
      if (!parsed.success) return null;
      return (
        <div className="space-y-2">
          {parsed.data.map((option) => (
            <ConciergeChangeOptionCard key={option.change_offer_id} option={option} />
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

/** flyt's air travel concierge - not a general chatbot, scoped to
 * finding real, bookable flights (see backend/external_services/
 * concierge.py's system instructions). Streams over the AG-UI protocol
 * as SSE (pydantic_ai.ui.ag_ui.AGUIAdapter on the backend), consumed by
 * @tanstack/ai-react's useChat.
 *
 * Tool calls arrive as first-class `tool-call` parts carrying their own
 * lifecycle state, which is what ConciergeRunTimeline renders: the agent
 * can spend several seconds inside a Duffel search, and without that the
 * panel sits blank and reads as broken. A completed call's payload is
 * rendered as ConciergeFlightCard and friends - the "actionable card"
 * mechanism, not prose. Mounted once, app-wide, in app/(app)/layout.tsx. */
export function ConciergeWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { data: me } = useQuery(meQuery());
  const authed = !!me;

  // credentials: "include" for the same reason every browser-side call in
  // this app uses it - auth is an httpOnly cookie on a sibling subdomain,
  // never an Authorization header (see lib/api/client.ts).
  const chatOptions = useMemo(
    () =>
      createChatClientOptions({
        connection: fetchServerSentEvents(`${API_URL}/concierge/chat`, {
          credentials: "include",
        }),
      }),
    [],
  );
  const { messages, sendMessage, isLoading, error, reload } = useChat(chatOptions);

  // Tool calls, flattened into the visible run timeline. Derived from the
  // messages rather than tracked separately so it can never drift from
  // what actually happened.
  const runSteps = (parts: readonly { type: string }[]): RunStep[] =>
    parts
      .filter((p): p is ToolCallLike => p.type === "tool-call")
      .map((p) => ({
        id: p.id,
        tool: p.name,
        state:
          p.state === "error" ? "error" : p.state === "complete" ? "done" : "running",
        detail: summariseToolInput(p.name, p.input),
      }));

  // Tool calls still in flight on the most recent message - the same
  // events the run timeline reads, so the two can never disagree.
  const activeTools = (() => {
    const last = messages[messages.length - 1];
    if (!last) return [] as string[];
    return (last.parts as readonly { type: string }[])
      .filter((p): p is ToolCallLike => p.type === "tool-call")
      .filter((p) => p.state !== "complete" && p.state !== "error")
      .map((p) => p.name);
  })();
  const orb = orbForTools(activeTools);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      {open && (
        <Card className="mb-3 flex h-112 w-[calc(100vw-2rem)] max-w-sm flex-col gap-0 overflow-hidden p-0 shadow-2xl">
          <div className="flex items-center justify-between bg-board px-4 py-3 text-board-ink">
            <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.15em]">
              <Sparkles className="size-3.5 text-signal" />
              FLYT CONCIERGE
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close concierge"
              className="text-board-muted hover:text-board-ink"
            >
              <X className="size-4" />
            </button>
          </div>

            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
                {messages.length === 0 && (
                  <div className="space-y-2">
                    <p className="text-muted-foreground">Ask about a route, or try:</p>
                    <div className="flex flex-col items-start gap-1.5">
                      {EXAMPLE_PROMPTS.map((prompt) => (
                        <Button
                          key={prompt}
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => sendMessage(prompt)}
                          className="h-auto max-w-full shrink whitespace-normal text-left"
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.role === "user" ? "text-right" : "text-left"}
                  >
                    <ConciergeRunTimeline steps={runSteps(message.parts)} />
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return (
                          <p
                            key={index}
                            className={
                              message.role === "user"
                                ? "inline-block rounded-lg bg-muted px-3 py-1.5"
                                : "inline-block"
                            }
                          >
                            {part.content}
                          </p>
                        );
                      }
                      // The agent's own reasoning, when the model emits
                      // it - more of "what is it doing" than a spinner.
                      if (part.type === "thinking") {
                        return (
                          <p
                            key={index}
                            className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground/70 italic"
                          >
                            {part.content}
                          </p>
                        );
                      }
                      // Progress for a running tool is the timeline's job
                      // (rendered once per message, below); this only
                      // renders the finished payload as cards.
                      if (part.type === "tool-call") {
                        const tool = part as unknown as ToolCallLike;
                        if (tool.state === "complete") {
                          const rendered = renderToolOutput(tool.name, tool.output, authed);
                          if (rendered !== null) return <div key={index}>{rendered}</div>;
                          if (!KNOWN_CONCIERGE_TOOLS.has(tool.name)) return null;
                          return (
                            <p key={index} className="text-xs text-destructive">
                              Couldn&apos;t show this result.
                            </p>
                          );
                        }
                        return null;
                      }
                      return null;
                    })}
                  </div>
                ))}
                {isLoading && <ThinkingOrb state={orb.state} label={orb.label} />}
                {error && (
                  <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <p className="text-xs text-destructive">
                      The concierge isn&apos;t available right now.
                    </p>
                    <button
                      type="button"
                      onClick={() => reload()}
                      className="font-mono text-[11px] text-destructive underline underline-offset-2"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about a flight…"
                  disabled={isLoading || !!error}
                  className="h-9"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isLoading || !!error || !input.trim()}
                >
                  Send
                </Button>
              </form>
            </>
        </Card>
      )}

      <Button
        size="icon"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close flyt concierge" : "Open flyt concierge"}
        className="size-12 rounded-full bg-signal text-white shadow-lg hover:bg-signal/90"
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </Button>
    </div>
  );
}
