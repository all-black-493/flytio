# flyt.io frontend — design spec

Date: 2026-07-17
Status: approved-by-instruction ("proceed and finish"); brainstormed autonomously per user request.

## Context

flyt.io books flights, B2C and B2B. Backend is FastAPI + Amadeus Flight Offers
Search (now Redis-cached for 60s on `/flights/search`). Frontend is Next.js 16
(App Router, Tailwind 4, src dir). Brand mandate: League Spartan font.
Requirements from the user: non-generic UI, responsive on all screens,
light/dark/system theme modes, UI data grounded in real Amadeus response shapes.

## Approaches considered

1. **Departure Hall** *(chosen)* — the landing page behaves like the product:
   a check-in "counter" search card and a live **departures board** rendering
   Amadeus-shaped flight offers as board rows that expand into full fare
   detail. The board is the signature element; everything around it stays
   quiet and Nordic.
2. Boarding-pass maximalism — every surface a perforated ticket stub with
   barcodes. Rejected: the most common travel-UI trope; reads generic.
3. Cartographic — great-circle map hero with route arcs. Rejected: heavy,
   hard to keep crisp on small screens, and maps are the second most common
   travel trope.

## Tokens

Semantic CSS variables swapped by theme class; components never hardcode hues.

| Token     | Light "terminal hall" | Dark "night ops" |
|-----------|----------------------|------------------|
| --bg      | #F4F6F8              | #0A121F          |
| --surface | #FFFFFF              | #14202F          |
| --ink     | #0B1526              | #EDF2F7          |
| --muted   | #55677C              | #8FA3B8          |
| --line    | #D8E0E8              | #263A52          |
| --signal  | #FF4F00              | #FF5A14          |

The departures board panel itself stays dark polar navy in **both** themes,
like a physical split-flap board — it anchors the brand across modes.

Type: League Spartan (display + UI), IBM Plex Mono (route codes, times,
fares, labels). Logo: navy tile, dashed climb-out arc, orange destination dot
that doubles as the "." in flyt.io.

## Theme modes

Cockpit-style segmented control in the header: **DAY / NIGHT / AUTO**
(aviation instrument-panel dimmer vernacular — this is the light/dark/system
switch). Hand-rolled provider: inline head script applies `.dark` before
paint (no flash), localStorage persistence (`flyt-theme`), matchMedia
listener while in AUTO. No dependency.

## Data

`src/lib/flights.ts` defines `FlightOffer` types mirroring the Amadeus Flight
Offers Search response (itineraries → segments → departure/arrival
{iataCode, terminal, at}, carrierCode, number, aircraft.code, ISO-8601
durations, price.grandTotal/currency, travelerPricings →
fareDetailsBySegment {cabin, brandedFare, class, includedCheckedBags},
numberOfBookableSeats, lastTicketingDate) plus a `dictionaries` object for
carrier/aircraft names, sample offers in that exact shape, and helpers
(ISO-duration → "7h 45m", time/date formatting). When the backend is wired
in, the components consume `/flights/search` responses unchanged.

## Page structure (mobile-first)

1. Header: logo · nav (Flights, For business) · DAY/NIGHT/AUTO toggle.
2. Hero: mono eyebrow, League Spartan headline, lede, CTAs; check-in
   counter search form (From/To/Depart/Return/Passengers) — UI only for now.
3. **Departures board** (signature): dark panel, mono column headers
   (TIME · ROUTE · FLIGHT · DURATION · STOPS · CABIN · FARE), each row a
   native `<details>` that expands to full fare detail: per-segment legs with
   terminals and aircraft, branded fare, checked bags, seats left, last
   ticketing date. Rows flip in with a staggered rotateX on load
   (prefers-reduced-motion respected). On small screens rows reflow into
   stacked ticket cards.
4. Split section: For travelers / For travel businesses (B2C + B2B).
5. Footer: polar strip, inverted logo, mono small print.

## Quality floor

Responsive from 320px up; visible keyboard focus; reduced motion respected;
semantic HTML (`<details>` for expansion — works without JS); both themes
checked by screenshot before delivery.
