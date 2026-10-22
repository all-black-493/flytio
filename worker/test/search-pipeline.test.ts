import { describe, expect, it } from "vitest";
import { computeFacets } from "../src/domain/flights/facets";
import { groupByItinerary, paginateGroups, MAX_ALTERNATES_PER_GROUP } from "../src/domain/flights/grouping";
import { inDepartureWindow, offerDurationMinutes, offerStops } from "../src/domain/flights/offer";
import { sortOffers } from "../src/domain/flights/ranking";
import { applyFilters, buildFlightSearchResult } from "../src/domain/flights/search";
import { EMPTY_VIEW, offer, slice } from "./flight-fixtures";

const at = (hour: string, minutes = "00") => `2026-10-01T${hour}:${minutes}:00`;

describe("offer measurements", () => {
  it("counts stops per slice, so a round trip is not its two legs added up", () => {
    const leg = slice("PT5H", [
      { departingAt: at("08"), arrivingAt: at("11") },
      { departingAt: at("12"), arrivingAt: at("15") },
    ]);
    expect(offerStops(offer({ id: "o", total: "1", slices: [leg, leg] }))).toBe(1);
  });

  it("adds every slice's ISO 8601 duration", () => {
    const trip = offer({
      id: "o",
      total: "1",
      slices: [
        slice("PT5H30M", [{ departingAt: at("08"), arrivingAt: at("13", "30") }]),
        slice("PT45M", [{ departingAt: at("18"), arrivingAt: at("18", "45") }]),
      ],
    });
    expect(offerDurationMinutes(trip)).toBe(375);
  });

  it("reads the outbound departure as a local hour, not an instant", () => {
    const morning = offer({
      id: "o",
      total: "1",
      slices: [slice("PT5H", [{ departingAt: at("08"), arrivingAt: at("13") }])],
    });
    expect(inDepartureWindow(morning, "morning")).toBe(true);
    expect(inDepartureWindow(morning, "night")).toBe(false);
  });

  it("treats night as the window that wraps midnight", () => {
    const late = offer({
      id: "o",
      total: "1",
      slices: [slice("PT5H", [{ departingAt: at("23"), arrivingAt: at("04") }])],
    });
    const early = offer({
      id: "o2",
      total: "1",
      slices: [slice("PT5H", [{ departingAt: at("03"), arrivingAt: at("08") }])],
    });
    expect(inDepartureWindow(late, "night")).toBe(true);
    expect(inDepartureWindow(early, "night")).toBe(true);
    expect(inDepartureWindow(early, "morning")).toBe(false);
  });
});

describe("facets", () => {
  it("counts airlines most-frequent-first and spans the price range", () => {
    const facets = computeFacets([
      offer({ id: "a", total: "100.00" }),
      offer({ id: "b", total: "300.00" }),
      offer({ id: "c", total: "200.00", owner: { iata_code: "ET", name: "Ethiopian" } }),
    ]);

    expect(facets.airlines).toEqual([
      { code: "KQ", name: "Kenya Airways", count: 2 },
      { code: "ET", name: "Ethiopian", count: 1 },
    ]);
    expect(facets).toMatchObject({ price_min: 100, price_max: 300, has_direct: true });
  });

  it("reports a zero floor rather than Infinity for no offers", () => {
    expect(computeFacets([])).toMatchObject({ price_min: 0, price_max: 0, has_direct: false });
  });
});

describe("filters", () => {
  const offers = [
    offer({ id: "cheap", total: "100.00" }),
    offer({ id: "dear", total: "900.00", owner: { iata_code: "ET", name: "Ethiopian" } }),
  ];

  it("keeps only the airlines asked for", () => {
    expect(applyFilters(offers, { ...EMPTY_VIEW, airlines: ["ET"] }).map((o) => o.id)).toEqual(["dear"]);
  });

  it("caps price inclusively", () => {
    expect(applyFilters(offers, { ...EMPTY_VIEW, priceMax: 100 }).map((o) => o.id)).toEqual(["cheap"]);
  });

  it("keeps an offer matching any one of several departure windows", () => {
    const evening = offer({
      id: "evening",
      total: "1",
      slices: [slice("PT2H", [{ departingAt: at("19"), arrivingAt: at("21") }])],
    });
    const view = { ...EMPTY_VIEW, departWindows: ["morning", "evening"] as never[] };
    expect(applyFilters([...offers, evening], view).map((o) => o.id)).toEqual([
      "cheap",
      "dear",
      "evening",
    ]);
  });
});

describe("sorting", () => {
  it("ranks best on price weighted against duration and stops", () => {
    const direct = offer({
      id: "direct",
      total: "400.00",
      slices: [slice("PT5H", [{ departingAt: at("08"), arrivingAt: at("13") }])],
    });
    const long = offer({
      id: "long",
      total: "380.00",
      slices: [
        slice("PT20H", [
          { departingAt: at("08"), arrivingAt: at("18") },
          { departingAt: at("19"), arrivingAt: at("04") },
          { departingAt: at("06"), arrivingAt: at("08") },
        ]),
      ],
    });
    // $20 cheaper does not buy fifteen extra hours and two more stops.
    expect(sortOffers([long, direct], "best").map((o) => o.id)).toEqual(["direct", "long"]);
    expect(sortOffers([direct, long], "price").map((o) => o.id)).toEqual(["long", "direct"]);
  });

  it("sorts departure and arrival by the outbound leg only", () => {
    const early = offer({
      id: "early",
      total: "1",
      slices: [slice("PT2H", [{ departingAt: at("06"), arrivingAt: at("08") }])],
    });
    const late = offer({
      id: "late",
      total: "1",
      slices: [slice("PT2H", [{ departingAt: at("20"), arrivingAt: at("22") }])],
    });
    expect(sortOffers([late, early], "departure").map((o) => o.id)).toEqual(["early", "late"]);
    expect(sortOffers([late, early], "arrival").map((o) => o.id)).toEqual(["early", "late"]);
  });

  it("does not reorder the caller's array", () => {
    const offers = [offer({ id: "b", total: "200.00" }), offer({ id: "a", total: "100.00" })];
    sortOffers(offers, "price");
    expect(offers.map((o) => o.id)).toEqual(["b", "a"]);
  });
});

describe("grouping", () => {
  const sameFlights = (id: string, total: string) =>
    offer({
      id,
      total,
      slices: [slice("PT5H", [{ carrier: "KQ", number: "310", departingAt: at("17", "10"), arrivingAt: at("22") }])],
    });

  it("collapses fares on the same flights, cheapest leading", () => {
    const groups = groupByItinerary([sameFlights("flex", "500.00"), sameFlights("basic", "300.00")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.primary.id).toBe("basic");
    expect(groups[0]!.alternates.map((o) => o.id)).toEqual(["flex"]);
  });

  it("keeps different airlines apart, which route-based grouping did not", () => {
    const ethiopian = offer({
      id: "et",
      total: "300.00",
      slices: [slice("PT5H", [{ carrier: "ET", number: "301", departingAt: at("09"), arrivingAt: at("14") }])],
    });
    expect(groupByItinerary([sameFlights("kq", "300.00"), ethiopian])).toHaveLength(2);
  });

  it("caps how many fare brands one card carries", () => {
    const many = Array.from({ length: 12 }, (_, i) => sameFlights(`fare_${i}`, `${100 + i}.00`));
    expect(groupByItinerary(many)[0]!.alternates).toHaveLength(MAX_ALTERNATES_PER_GROUP);
  });

  it("takes each group's position from where its itinerary first appeared", () => {
    const first = offer({
      id: "first",
      total: "900.00",
      slices: [slice("PT5H", [{ carrier: "ET", number: "301", departingAt: at("09"), arrivingAt: at("14") }])],
    });
    expect(groupByItinerary([first, sameFlights("kq", "100.00")]).map((g) => g.primary.id)).toEqual([
      "first",
      "kq",
    ]);
  });

  it("reports whether more pages follow", () => {
    const groups = groupByItinerary([
      offer({ id: "a", total: "1" }),
      offer({
        id: "b",
        total: "2",
        slices: [slice("PT5H", [{ number: "999", departingAt: at("10"), arrivingAt: at("15") }])],
      }),
    ]);
    expect(paginateGroups(groups, 1, 0).meta).toEqual({ limit: 1, offset: 0, total: 2, has_more: true });
    expect(paginateGroups(groups, 1, 1).meta).toEqual({ limit: 1, offset: 1, total: 2, has_more: false });
  });
});

describe("the whole pipeline", () => {
  const result = {
    offerRequest: { id: "orq_1", live_mode: false, created_at: null, passengers: [] },
    offers: [
      offer({ id: "cheap", total: "100.00" }),
      offer({
        id: "dear",
        total: "900.00",
        owner: { iata_code: "ET", name: "Ethiopian" },
        slices: [slice("PT5H", [{ carrier: "ET", number: "301", departingAt: at("09"), arrivingAt: at("14") }])],
      }),
    ],
  };

  it("marks up before anything reads a price, so facets and offers agree", () => {
    const built = buildFlightSearchResult(result, EMPTY_VIEW, 0.07);
    expect(built.groups[0]!.primary.total_amount).toBe("107.00");
    expect(built.facets.price_min).toBe(107);
    expect(built.facets.price_max).toBe(963);
  });

  it("uses a sale's rate when one is in force", () => {
    expect(buildFlightSearchResult(result, EMPTY_VIEW, 0.03).groups[0]!.primary.total_amount).toBe(
      "103.00",
    );
  });

  it("computes facets before filtering, so narrowing does not shrink them", () => {
    const built = buildFlightSearchResult(result, { ...EMPTY_VIEW, airlines: ["ET"] }, 0.07);
    expect(built.groups).toHaveLength(1);
    expect(built.facets.airlines).toHaveLength(2);
  });
});
