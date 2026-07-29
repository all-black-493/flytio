"use client";

import { Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const EXAMPLE_PROMPTS = [
  "Find me the cheapest flight to Dubai next month",
  "Book a return trip to London for 2 adults",
];

/** UI-only preview of the future flyt concierge - builds itineraries and
 * books flights from a conversation. No backend yet (explicitly deferred
 * - this is scaffolding to react to, not a working feature): zero
 * network calls, the input stays disabled, and the example prompts are
 * inert text, not clickable actions. Mounted once, app-wide, in
 * app/(app)/layout.tsx. */
export function ConciergeWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      {open && (
        <Card className="mb-3 w-[calc(100vw-2rem)] max-w-sm gap-0 overflow-hidden p-0 shadow-2xl">
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

          <div className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              Coming soon: tell flyt where you want to go, and it&apos;ll build the itinerary and
              book it for you.
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
          </div>

          <div className="border-t p-3">
            <Input disabled placeholder="Concierge chat coming soon…" className="h-9" />
          </div>
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
