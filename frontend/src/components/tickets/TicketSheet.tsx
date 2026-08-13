"use client";

import { Download, Printer } from "lucide-react";

import { TicketDocument } from "@/components/tickets/TicketDocument";
import { Button, buttonVariants } from "@/components/ui/button";
import { API_URL } from "@/lib/api/client";
import type { BookingPublic } from "@/lib/api/schemas";

/**
 * Every ticket for a booking - one per traveller per leg - plus the two
 * things a traveller wants to do with them: print, or take the PDF.
 *
 * Printing goes through the browser rather than the PDF because what's
 * already on screen is the same artefact; sending someone to download a
 * file just to print what they're looking at is a detour. The PDF stays
 * for keeping and forwarding, which print can't do.
 *
 * The print rules live here as a scoped <style> rather than in
 * globals.css: they only make sense for this component, and putting a
 * bare `body *` rule in the global sheet would silently affect every
 * page's print output.
 */
export function TicketSheet({ booking }: { booking: BookingPublic }) {
  const qrSrc = `${API_URL}/booking/flight-orders/by-id/${booking.id}/qr.png`;
  const tickets = booking.slices.flatMap((slice) =>
    booking.passengers.map((passenger) => ({ slice, passenger })),
  );

  if (tickets.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="tickets-heading">
      <style>{`
        @media print {
          /* Hide the app around the tickets, then re-show only this
             subtree - the standard way to print one region without a
             separate print route. */
          body * { visibility: hidden; }
          #ticket-sheet, #ticket-sheet * { visibility: visible; }
          #ticket-sheet {
            position: absolute; inset: 0; width: 100%; padding: 0;
          }
          #ticket-sheet [data-print-hide] { display: none; }
          /* The stub's dark fill is the artefact's defining edge, so it
             has to survive the browser's default of dropping backgrounds. */
          #ticket-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-3" data-print-hide>
        <p
          id="tickets-heading"
          className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground"
        >
          TICKETS
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Print
          </Button>
          {/* An anchor, not a Button-with-render: this is a real file
              download and must keep native link behaviour. */}
          <a
            href={`${API_URL}/booking/flight-orders/by-id/${booking.id}/itinerary.pdf`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-3.5" />
            PDF
          </a>
        </div>
      </div>

      <div id="ticket-sheet" className="space-y-3">
        {tickets.map(({ slice, passenger }) => (
          <TicketDocument
            key={`${slice.id}-${passenger.id}`}
            booking={booking}
            passenger={passenger}
            slice={slice}
            qrSrc={qrSrc}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground" data-print-hide>
        This is your e-ticket, not a boarding pass. Check in with{" "}
        {booking.owner_name ?? "the airline"} to get your boarding pass, seat and gate.
      </p>
    </section>
  );
}
