"use client";

import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import { ConciergeFlightCard } from "@/components/concierge/ConciergeFlightCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/api/client";
import { conciergeFlightCardSchema } from "@/lib/api/schemas";

const EXAMPLE_PROMPTS = [
  "Find me the cheapest flight to Dubai next month",
  "What are my options from Nairobi to London next week?",
];

/** flyt's air travel concierge - not a general chatbot, scoped to
 * finding real, bookable flights (see backend/external_services/
 * concierge.py's system instructions). Streams via the Vercel AI SDK
 * protocol (pydantic_ai.ui.vercel_ai.VercelAIAdapter on the backend); a
 * search_flights tool call streams back as a tool UI part - pydantic-ai
 * never marks it as the SDK's special "dynamic-tool" (that's for tools
 * registered via the JS-side dynamicTool() helper specifically, not
 * server-defined tools in general), so it always arrives shaped as a
 * static tool part instead. `isToolUIPart`/`getToolName` (from "ai")
 * handle both shapes correctly, which is why they're used below rather
 * than checking `part.type === "dynamic-tool"` directly. Rendered here
 * as ConciergeFlightCard - that's the "actionable card" mechanism, not
 * prose. Mounted once, app-wide, in app/(app)/layout.tsx. */
export function ConciergeWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { data: me } = useQuery(meQuery());
  const authed = !!me;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/concierge/chat`,
        credentials: "include",
      }),
    [],
  );
  const { messages, sendMessage, status, error, regenerate } = useChat({ transport });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== "ready") return;
    sendMessage({ text: input });
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

          {!authed ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                Tell flyt where you want to go and it&apos;ll find real, bookable flights for you.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <span
                    key={prompt}
                    className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {prompt}
                  </span>
                ))}
              </div>
              <Link
                href="/login"
                className="block rounded-lg bg-signal px-3 py-2 text-center text-sm font-semibold text-white hover:bg-signal/90"
              >
                Sign in to chat with the concierge
              </Link>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
                {messages.length === 0 && (
                  <p className="text-muted-foreground">
                    Ask about a route, e.g. &ldquo;{EXAMPLE_PROMPTS[0]}&rdquo;
                  </p>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.role === "user" ? "text-right" : "text-left"}
                  >
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
                            {part.text}
                          </p>
                        );
                      }
                      if (isToolUIPart(part) && getToolName(part) === "search_flights") {
                        if (part.state === "input-available" || part.state === "input-streaming") {
                          return (
                            <p key={index} className="font-mono text-[11px] text-muted-foreground">
                              Searching flights…
                            </p>
                          );
                        }
                        if (part.state === "output-available") {
                          const parsed = conciergeFlightCardSchema.array().safeParse(part.output);
                          if (!parsed.success) {
                            return (
                              <p key={index} className="text-xs text-destructive">
                                Couldn&apos;t show these results.
                              </p>
                            );
                          }
                          return (
                            <div key={index} className="space-y-2">
                              {parsed.data.map((card) => (
                                <ConciergeFlightCard key={card.offer_id} offer={card} />
                              ))}
                            </div>
                          );
                        }
                        if (part.state === "output-error") {
                          return (
                            <p key={index} className="text-xs text-destructive">
                              {part.errorText}
                            </p>
                          );
                        }
                      }
                      return null;
                    })}
                  </div>
                ))}
                {status === "submitted" && (
                  <p className="font-mono text-[11px] text-muted-foreground">Thinking…</p>
                )}
                {error && (
                  <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <p className="text-xs text-destructive">
                      The concierge isn&apos;t available right now.
                    </p>
                    <button
                      type="button"
                      onClick={() => regenerate()}
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
                  disabled={status !== "ready" || !!error}
                  className="h-9"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={status !== "ready" || !!error || !input.trim()}
                >
                  Send
                </Button>
              </form>
            </>
          )}
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
