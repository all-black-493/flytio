"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { ErrorState } from "@/app/(app)/search/_components/error-state";
import { NoResultsState } from "@/app/(app)/search/_components/no-results-state";
import { ResultsExplorer } from "@/app/(app)/search/_components/results-explorer";
import { searchOffersInfiniteQuery } from "@/app/(app)/search/_lib/queries";
import type { FilterSortParams } from "@/app/(app)/search/_lib/pagination-params";
import type { ParsedSearch } from "@/lib/search-params";
import { Skeleton } from "@/components/ui/skeleton";

/** Client-side query consumer. On first load this reads the server's
 * prefetched, already-resolved first page (no fetch, no loading flash) —
 * the isPending branch below only fires on a later client-side search that
 * wasn't prefetched (e.g. the SearchBar issuing a new query key). */
export function SearchResults({
  search,
  filters,
}: {
  search: ParsedSearch;
  filters: FilterSortParams;
}) {
  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(searchOffersInfiniteQuery(search, filters));

  if (isPending) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState message={error instanceof Error ? error.message : "Something went wrong."} />;
  }

  const firstPage = data.pages[0];
  // Pre-filter offer count, derived from facets (always computed against
  // the full unfiltered list) — distinguishes "no flights for this route
  // at all" from "filtered down to zero", which ResultsExplorer's own
  // empty state already handles.
  const rawOfferCount = firstPage.facets.airlines.reduce((sum, a) => sum + a.count, 0);
  if (rawOfferCount === 0) {
    return <NoResultsState />;
  }

  return (
    <ResultsExplorer
      pages={data.pages}
      onLoadMore={() => fetchNextPage()}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
    />
  );
}
