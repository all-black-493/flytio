"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { FilterSidebar } from "@/app/(app)/search/_components/filter-sidebar";
import { FlightResultCard } from "@/app/(app)/search/_components/flight-result-card";
import { PackageFeaturesModal } from "@/app/(app)/search/_components/package-features-modal";
import { SortDropdown } from "@/app/(app)/search/_components/sort-dropdown";
import { Button } from "@/components/ui/button";
import type { FlightSearchResponse, Offer } from "@/lib/api/schemas";

export interface ResultsExplorerProps {
  pages: FlightSearchResponse[];
  onLoadMore: () => void;
  hasMore: boolean | undefined;
  isLoadingMore: boolean;
}

export function ResultsExplorer({ pages, onLoadMore, hasMore, isLoadingMore }: ResultsExplorerProps) {
  const router = useRouter();
  // Present only when an admin is booking on a customer's behalf
  // (/admin/bookings/new) - carried into /booking/[offerId] so that page
  // knows to show its admin "mark as paid" flow instead of real checkout.
  const bookForUserId = useSearchParams().get("bookForUserId");
  const [compareOffer, setCompareOffer] = useState<Offer | null>(null);

  // Filtering, sorting, route-grouping and faceting all happen server-side
  // (see backend/utils/offer_filtering.py) — pagination only ever adds
  // more already-grouped pages here, nothing is recomputed client-side.
  const groups = pages.flatMap((page) => page.groups);
  const facets = pages[0].facets;
  const total = pages[0].meta.total;
  const currency = groups[0]?.primary.total_currency ?? "USD";

  const compareAlternates = compareOffer
    ? groups.find((g) => g.primary.id === compareOffer.id || g.alternates.some((a) => a.id === compareOffer.id))
    : null;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <FilterSidebar facets={facets} currency={currency} />

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-col gap-3 rounded-xl bg-board px-4 py-3 text-board-ink sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] tracking-[0.15em]">
            <span className="text-signal">{total}</span> {total === 1 ? "FLIGHT" : "FLIGHTS"} FOUND
          </p>
          <SortDropdown />
        </div>

        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="font-medium">No flights match your filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try widening your price cap or clearing the airline filter.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ primary, alternates }) => (
              <FlightResultCard
                key={primary.id}
                offer={primary}
                alternates={alternates}
                onViewFares={setCompareOffer}
                onSelect={(offer) =>
                  router.push(
                    bookForUserId
                      ? `/booking/${offer.id}?bookForUserId=${bookForUserId}`
                      : `/booking/${offer.id}`,
                  )
                }
              />
            ))}
          </div>
        )}

        {hasMore && (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? "Loading more…" : "Load more flights"}
          </Button>
        )}
      </div>

      <PackageFeaturesModal
        open={compareOffer !== null}
        onOpenChange={(open) => !open && setCompareOffer(null)}
        offers={
          compareOffer && compareAlternates
            ? [compareAlternates.primary, ...compareAlternates.alternates]
            : compareOffer
              ? [compareOffer]
              : []
        }
        selectedOfferId={compareOffer?.id ?? null}
      />
    </div>
  );
}
