import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { EmptyState } from "@/app/(app)/search/_components/empty-state";
import { SearchBar } from "@/app/(app)/search/_components/search-bar";
import { SearchResults } from "@/app/(app)/search/_components/search-results";
import { searchOffersInfiniteQuery } from "@/app/(app)/search/_lib/queries";
import { parseFilterSortParams } from "@/app/(app)/search/_lib/pagination-params";
import { getQueryClient } from "@/lib/query/get-query-client";
import { flattenSearchParams, parseSearchParams } from "@/lib/search-params";

export const metadata = { title: "Search flights - flyt.io" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const flat = flattenSearchParams(await searchParams);
  const parsed = parseSearchParams(flat);
  const filters = parseFilterSortParams(flat);

  const queryClient = getQueryClient();
  if (parsed) {
    await queryClient.prefetchInfiniteQuery(searchOffersInfiniteQuery(parsed, filters));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <SearchBar
        defaultOrigin={parsed?.origin}
        defaultDestination={parsed?.destination}
        defaultDepartureDate={parsed?.departureDate}
        defaultReturnDate={parsed?.returnDate ?? undefined}
        defaultAdults={parsed?.adults}
        defaultCabinClass={parsed?.cabinClass ?? undefined}
      />

      {parsed ? (
        <HydrationBoundary state={dehydrate(queryClient)}>
          <SearchResults search={parsed} filters={filters} />
        </HydrationBoundary>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
