"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDuration, formatMoney, routeLabel } from "@/lib/api/format";
import type { Offer } from "@/lib/api/schemas";

export interface PackageFeaturesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offers: Offer[];
  selectedOfferId: string | null;
}

/** Compares offers on the same route side by side. Duffel doesn't expose
 * fare-family marketing content (miles accrual, meal service, etc.) on the
 * Offer object, so this sticks to fields we actually have: price
 * breakdown, duration, stops, and how long the quote is valid for. */
export function PackageFeaturesModal({
  open,
  onOpenChange,
  offers,
  selectedOfferId,
}: PackageFeaturesModalProps) {
  if (offers.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compare fares</DialogTitle>
          <p className="text-sm text-muted-foreground">{routeLabel(offers[0].slices[0])}</p>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          {offers.map((offer) => {
            const stops = Math.max(...offer.slices.map((s) => s.segments.length - 1), 0);
            const isSelected = offer.id === selectedOfferId;
            return (
              <div
                key={offer.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 ${
                  isSelected ? "border-signal ring-1 ring-signal" : ""
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{offer.owner?.name ?? "Airline"}</p>
                  <p className="text-xs text-muted-foreground">
                    {stops === 0 ? "Direct" : `${stops} stop${stops > 1 ? "s" : ""}`} ·{" "}
                    {formatDuration(offer.slices[0].duration)}
                  </p>
                </div>

                <dl className="space-y-1.5 text-xs">
                  {offer.base_amount && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Fare</dt>
                      <dd>{formatMoney(offer.base_amount, offer.total_currency)}</dd>
                    </div>
                  )}
                  {offer.tax_amount && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Taxes &amp; fees</dt>
                      <dd>{formatMoney(offer.tax_amount, offer.total_currency)}</dd>
                    </div>
                  )}
                </dl>

                <p className="text-xl font-bold tabular-nums">
                  {formatMoney(offer.total_amount, offer.total_currency)}
                </p>

                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="mt-auto"
                  nativeButton={false}
                  render={<a href={`/booking/${offer.id}`} />}
                >
                  Select
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
