# flyt.io logo mark — design spec

Date: 2026-07-24
Status: brainstormed with user, approved.

## Context

The current mark (`src/components/Logo.tsx`'s `LogoMark`, duplicated by hand
in `src/app/icon.svg`) is a navy rounded tile containing a thin dashed
climb-out curve from an origin dot to an orange destination dot — the
original brand decision from `2026-07-17-flyt-frontend-design.md` ("navy
tile, dashed climb-out arc, orange destination dot that doubles as the '.'
in flyt.io").

The concrete problem: `icon.svg` is the real favicon, rendered at 16-32px in
practice, and the 2.2px dashed stroke plus a barely-visible decorative ring
don't survive that scale — they blur into mush. The two files have also
already drifted (`icon.svg` is missing the ring stroke `LogoMark` still has),
because nothing keeps a hand-duplicated static SVG in sync with the React
component.

User explicitly wants the brand identity/story kept (this is a refinement,
not a replacement), using untitledui.com/logos' visual language — geometric,
negative-space-leaning, high-contrast marks — as style inspiration only, not
literal assets to adopt (that page is placeholder logos for fictional
companies, not something to brand flyt.io with).

## Approaches considered

1. **Bold solidify** — keep all four existing elements (tile, curve, 2 dots),
   just thicken/solidify the stroke and drop the ring. Smallest change,
   lowest risk. Not chosen: user wanted to go bolder than a tune-up.
2. **Angular middle ground** — replace the bezier curve with 1-2 straight
   segments meeting at an angle, keep both dots. Not chosen in favor of a
   cleaner cut.
3. **Bold geometric abstraction** *(chosen)* — simplify to three solid
   elements: tile, one thick straight diagonal stroke, one dot. Directly
   targets the confirmed problem (dashes and thin lines are what breaks at
   16px; solid bold shapes don't) while keeping the exact same narrative
   ("ascending toward a destination that doubles as the wordmark's period").

## The mark

`LogoMark`, 48×48 viewBox, three elements:

- **Tile**: `<rect width="48" height="48" rx="11" fill="#0B1526"/>` — same
  navy, same corner radius, no ring stroke (removed; invisible below ~24px
  and was adding noise, not information).
- **Ascent stroke**: a single straight line from `(13, 35)` to `(32, 15)`,
  `stroke="#F6F8FA"`, `stroke-width="7"`, `stroke-linecap="round"`. No
  `stroke-dasharray`. Straight geometry (not a bezier curve) so it reads
  cleanly at any size; round caps keep it from looking like a technical
  diagram.
- **Destination dot**: `<circle cx="34" cy="13.5" r="5.5" fill="#FF4F00"/>`
  (signal orange), positioned to sit right at the stroke's upper-right tip —
  still doubles as the "." in the "flyt.io" wordmark when the mark is paired
  with text in `Logo`.

The small origin dot from the old mark is dropped — it was never actually
part of the documented brand decision (which only names "dashed climb-out
arc" and "destination dot"), and removing it is exactly what turns four soft
shapes into three bold ones.

Colors and the wordmark styling in `Logo` (the `flyt` / orange `.` / muted
`io` text) are unchanged — the legibility problem is specific to the mark's
geometry, not its palette or the text lockup.

## Fixing the sync-drift problem

`app/icon.svg` is a Next.js file-convention favicon — it must stay a static
file, it can't import the `LogoMark` React component. The practical fix:
write both files from the identical shape markup in the same change, and
leave a comment in each pointing at the other, so a future edit to one is a
visible prompt to update its pair instead of silently drifting like the ring
stroke did.

## Out of scope

- The wordmark/text lockup styling in `Logo`.
- Any other logo placement styling (header/sidebar/footer sizing) beyond
  swapping in the new mark shapes.
- This spec covers only the logo; it does not cover the other items from the
  same conversation (one-way/round-trip search, per-passenger seat
  selection, permanent dark mode) — those are implementation fixes, not
  design work, and are planned separately.
