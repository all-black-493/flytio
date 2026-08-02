# Seat picker hover details — design

Date: 2026-08-02
Status: approved, ready for implementation

## Problem

`frontend/src/app/(app)/booking/[offerId]/_components/seat-picker.tsx`
renders a seat map whose labels are unreadable: 36px (`size-9`) cells
carrying a `text-[9px]` designator and a `text-[7px]` rounded price. A
traveller cannot tell what a seat is or what it costs without guessing,
and the only detail on offer today is a native `title` tooltip, which is
slow to appear, unstyled, and absent on touch.

Goal: hovering (or tapping) a seat shows that seat's details, including
the option to select it for the booking.

## Decision

A **popover anchored to the seat**, opened on hover, tap, or keyboard
focus. Rejected alternatives:

- *Sticky panel below the map* — always visible, but the eye travels
  away from the seat and it costs scarce vertical space on mobile.
- *Two-column page with a side panel* (closest to the reference
  screenshot) — the booking page is a single `max-w-2xl` column shared by
  the passenger and payment steps, so this would restructure the whole
  checkout for one step's benefit.

Base UI's `Popover.Trigger` supports `openOnHover` with `delay` /
`closeDelay` (verified against `/mui/base-ui/v1.6.0`). Because the
trigger is a native button, the same component yields hover on desktop
and tap on touch, with no separate mobile code path.

## Popover contents

| Element | Source |
|---|---|
| Designator, large | `element.designator` |
| Cabin class | the enclosing `cabin.cabin_class` |
| `Window` / `Aisle` / `Middle` chip | derived from row geometry |
| `Row N` chip | parsed from the designator's leading digits |
| `Exit row` chip | row contains an element of type `exit_row` |
| Price, or `Included` when zero | the passenger's `available_services` entry |
| Seat name, when non-empty | Duffel `element.name` |
| Disclosures, when non-empty | Duffel `element.disclosures` |
| Action button | see states below |

**Position is derived, not invented.** The reference screenshot's
`CH` / `FC` / `Legroom+` chips are not fields Duffel exposes. Window /
aisle / middle *is* recoverable from the map's own geometry: sections
within a row are separated by aisles, so the first element of the first
section and the last element of the last section are window seats,
elements touching a section boundary are aisle seats, and the remainder
are middle seats.

**Empty-state discipline.** Duffel's sandbox routinely returns
`name: ""` and `disclosures: []`. Every block fed by those fields must
disappear cleanly when empty, and the popover must still look
deliberate with only designator, position and price.

### Action states

| Seat state | Popover action |
|---|---|
| Available | `Select seat`, or `Select for Passenger N` when >1 traveller |
| Already selected by the active passenger | `Selected` (details still shown) |
| Held by another passenger | `Taken by Passenger N`, no button |
| No service for this passenger | `Not available for this traveller`, no button |

## Legibility

The popover alone does not fix the stated complaint, so the map itself
changes too:

- cells `size-9` → `size-11` (36px → 44px), which also meets the 44px
  minimum touch target;
- designator `text-[9px]` → `text-[11px]`;
- the unreadable `text-[7px]` price digit is **removed** — price now
  lives in the popover, and a small dot marks seats that cost money.

Widest realistic layout checked: a 3-4-3 wide-body is roughly 526px of
cells, gaps and aisles inside the ~600px column, so no horizontal
scrolling is introduced.

## Structure

Splitting the current 208-line file three ways, so no unit does more
than one job:

- **`_lib/seat-map.ts`** — pure derivations, no React, independently
  readable: `seatPosition(row, sectionIndex, elementIndex)`,
  `rowHasExit(row)`, `serviceFor(element, passengerId)`, `rowNumber(designator)`.
- **`_components/seat-cell.tsx`** — one cell: the trigger button and its
  popover.
- **`_components/seat-picker.tsx`** — cabin/row/section layout and
  passenger tabs only.

## Schema

`seatElementSchema` in `frontend/src/lib/api/schemas.ts` currently parses
only `type`, `designator` and `available_services`, dropping `name` and
`disclosures`. Both are added as optional/defaulted so a response that
omits them still parses. The backend already passes raw Duffel JSON
through `GET /shopping/seatmaps`, so **no backend change is required**.

## Accessibility

The existing per-seat `aria-label` stays, so a screen-reader user gets
the full description without needing the popover.

Keyboard behaviour as verified, which is not quite what this section
first claimed: focusing a seat does *not* open the popover — Base UI
opens on activation. Pressing Enter opens it and moves focus onto the
`Select seat` button inside, so choosing a seat is Enter-then-Enter.
That is better than open-on-focus, which would fire a popover at every
seat tabbed past.

Seats use `aria-disabled`, never the `disabled` attribute. A disabled
button fires no mouse events and takes no focus, which would leave
unavailable and already-taken seats as the only ones whose popover never
opens — and "why can't I pick this one?" is exactly the question asked
there. Those popovers offer no action, only an explanation, so there is
no click to guard.

## Verification

The frontend has no test framework (`package.json` defines only `dev`,
`build`, `start`, `lint`, and no vitest/jest/testing-library). Adding
one is out of scope for this change. Verification is therefore:

1. `npx tsc --noEmit`
2. `npx eslint src --max-warnings=0`
3. `npx next build`
4. Live browser: hover a seat and confirm the popover's contents;
   select from the popover and confirm the pick reaches checkout state;
   confirm keyboard focus opens it; confirm taken/unavailable seats show
   the right state; confirm a seat with empty `name`/`disclosures` still
   renders a well-formed popover.
