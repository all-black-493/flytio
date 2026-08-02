import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { EmptyState } from "@/app/(app)/search/_components/empty-state";
import { SearchBar } from "@/app/(app)/search/_components/search-bar";
import { SearchResults } from "@/app/(app)/search/_components/search-results";
import { searchOffersInfiniteQuery } from "@/app/(app)/search/_lib/queries";
import { parseFilterSortParams } from "@/app/(app)/search/_lib/pagination-params";
import { getQueryClient } from "@/lib/query/get-query-client";
import { flattenSearchParams, parseSearchParams } from "@/lib/search-params";

export const metadata = { title: "Search flights - flyt" };

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

  // SearchBar's date inputs are uncontrolled (defaultValue) - submitting a
  // new search from this same page navigates client-side without
  // unmounting SearchBar, so its `defaultXxx` props change on an
  // already-initialized instance. Base UI (and origin/destination's own
  // useState(defaultOrigin), which only ever reads its initial value)
  // don't pick that up. Keying on the parsed search forces React to treat
  // a new search as a new instance instead of an update, resetting every
  // field - the React-documented fix for "reset state when a prop
  // identity changes" (https://react.dev/learn/preserving-and-resetting-state).
  const searchBarKey = parsed
    ? [
        parsed.origin,
        parsed.destination,
        parsed.departureDate,
        parsed.returnDate,
        parsed.adults,
        parsed.children,
        parsed.infants,
        parsed.cabinClass,
      ].join("|")
    : "empty";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <SearchBar
        key={searchBarKey}
        defaultOrigin={parsed?.origin}
        defaultDestination={parsed?.destination}
        defaultDepartureDate={parsed?.departureDate}
        defaultReturnDate={parsed?.returnDate ?? undefined}
        defaultAdults={parsed?.adults}
        defaultChildren={parsed?.children}
        defaultInfants={parsed?.infants}
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
