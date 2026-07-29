import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import AudienceSplit from "@/components/home/audience-split";
import DeparturesSection from "@/components/home/departures-section";
import Hero from "@/components/home/hero";
import PopularDestinations from "@/components/home/popular-destinations";
import SiteFooter from "@/components/home/site-footer";
import { departureBoardQuery, popularDestinationsQuery } from "@/lib/api/queries";
import { getQueryClient } from "@/lib/query/get-query-client";

export default async function Home() {
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(departureBoardQuery()),
    queryClient.prefetchQuery(popularDestinationsQuery()),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1">
        <Hero />
        <HydrationBoundary state={dehydrate(queryClient)}>
          <DeparturesSection />
          <PopularDestinations />
        </HydrationBoundary>
        <AudienceSplit />
      </main>
      <SiteFooter />
    </div>
  );
}
