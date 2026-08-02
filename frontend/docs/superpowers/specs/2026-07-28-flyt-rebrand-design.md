# flyt.io → flyt rebrand — design spec

Date: 2026-07-28
Status: brainstormed with user, approved.

## Context

The user wants to drop ".io" from the brand entirely — "flyt" instead of
"flyt.io" — and supplied a new mark to use: a 151×48 SVG icon+wordmark
lockup consisting of a 7-dot hexagonal "flower" cluster (amber `#f59e0b`)
next to a "flyt" wordmark drawn as fixed vector paths in a rounded
geometric sans, replacing the current mark (`src/components/Logo.tsx`'s
`LogoMark` + wordmark, duplicated by hand in `src/app/icon.svg`) — a navy
rounded tile containing a solid diagonal climb-out stroke to an orange
destination dot (see `2026-07-24-logo-mark-design.md`), next to
`flyt<span class="text-signal">.</span><span class="text-muted-foreground">io</span>`
live text.

The user explicitly asked to "consider the look, feel and the design of our
site" rather than pasting the SVG in verbatim — the raw asset's amber
accent and rounded-sans wordmark don't match the site's established
system: every accent color on the site resolves to the `--signal` CSS
variable (`#ff4f00` light / `#ff5a14` dark), and the body/nav/button
typeface is IBM Plex Mono site-wide (`--font-sans` = `--font-plex-mono`;
only h1–h4 use the squared Chakra Petch display face) — a soft rounded
sans wordmark or a second, unrelated accent color would read as a
different brand pasted onto this UI.

## Decisions (confirmed with user)

1. **Rebrand scope: full**, not just the logo component. Every user-facing
   "flyt.io"/"Flyt.io"/"FLYT.IO" string across the site (page titles,
   footer, legal copy, email templates, cookie banner) becomes
   "flyt"/"Flyt"/"FLYT". Code comments that merely use "flyt.io" as an
   illustrative example (e.g. the `COOKIE_DOMAIN` comment in
   `backend/config.py`) are not user-facing and are left alone.
2. **Icon color: recolored to `--signal`**, not kept as the SVG's amber -
   keeps one accent color across the whole site rather than introducing a
   second.
3. **Icon container: kept inside the dark rounded-square tile**, matching
   the current mark's treatment (and its documented favicon-legibility
   reasoning), rather than the raw SVG's freestanding presentation.
4. **Wordmark: live text in the site's existing IBM Plex Mono**, not the
   SVG's baked-in wordmark paths - matches every other word on the page,
   stays theme-aware, and is real text (not a decorative image) for
   accessibility.
5. **`partners@flyt.io` mailto → `partners@flyt.africa`**, matching the
   domain already verified for transactional email via Resend (see
   `utils/email.py`'s `SENDER_*` addresses) - one domain for all outbound
   and inbound mail going forward.

## Icon geometry

The provided SVG's 7 dots (each a bezier-drawn circle, radius 6) sit at:

| dot | original center | role |
|---|---|---|
| A | (19, 24) | center |
| B | (19, 10) | top |
| D | (31, 17) | upper-right |
| C | (31, 31) | lower-right |
| E | (19, 38) | bottom |
| G | (7, 31) | lower-left |
| F | (7, 17) | upper-left |

Each outer dot sits ~14 units from center A, forming a "6 around 1" hex
flower with adjacent outer dots slightly overlapping (~1.9 units) - a
tightly packed cluster, not evenly spaced.

As originally drawn, this pattern's paint bounds are x:[1,37] y:[4,44] -
not centered in a 48-wide box (it was drawn to sit left of the wordmark in
the original 151-wide lockup, not as a standalone icon). Re-centering for
a standalone 48×48 tile: shift +5 on the x-axis only (y is already
balanced, 4px top/bottom). That lands the center dot (A) exactly on
(24,24), the tile's true center:

| dot | recentered |
|---|---|
| A | (24, 24) |
| B | (24, 10) |
| D | (36, 17) |
| C | (36, 31) |
| E | (24, 38) |
| G | (12, 31) |
| F | (12, 17) |

At this size the cluster's paint would extend to within 4–6px of the tile
edge (vs. the current mark's ~8–9.5px gaps) - implementation should scale
the whole cluster down modestly (uniformly, still centered on 24,24) to
restore comparable breathing room, dialed in visually rather than to an
exact pre-computed number.

`LogoMark` (React component, used at arbitrary sizes) and `app/icon.svg`
(static favicon, can't import the component) must be updated together, as
today - both should express the same recentered/rescaled dot geometry and
`--signal`-equivalent fill. Since `icon.svg` is a static file with no
access to the CSS variable, it keeps using a literal hex (`#FF4F00`,
matching the current file's literal-hex approach for the same reason).

## Wordmark

Replace the current
`flyt<span class="text-signal">.</span><span class="text-muted-foreground">io</span>`
markup with plain `flyt` text, same `font-bold tracking-tight` treatment,
no trailing colored suffix (there's no ".io" left to set apart).

## Full text sweep

Every occurrence of "flyt.io" / "Flyt.io" / "FLYT.IO" in user-facing
copy becomes "flyt" / "Flyt" / "FLYT" as grammatically appropriate,
across:

- `app/layout.tsx` - site-wide `<title>`/description
- Page-level `metadata.title` in: `(app)/booking/[offerId]/page.tsx`,
  `(app)/booking/payment-callback/page.tsx`,
  `(app)/account/bookings/[bookingId]/page.tsx`, `(app)/account/page.tsx`,
  `(app)/search/page.tsx`, `(app)/cookies/page.tsx`,
  `(app)/terms/page.tsx`, `(app)/privacy/page.tsx`,
  `(auth)/login/page.tsx`, `(auth)/register/page.tsx`,
  `(auth)/reset-password/page.tsx`, `(auth)/forgot-password/page.tsx`
- `components/home/site-footer.tsx` - copyright line
- `components/home/audience-split.tsx` - `partners@flyt.io` →
  `partners@flyt.africa`
- `(app)/terms/page.tsx`, `(app)/privacy/page.tsx`, `(app)/cookies/page.tsx`
  - legal body copy
- `components/analytics/cookie-consent-banner.tsx` - banner copy
- `backend/utils/email_templates.py` - logo `alt` text, sign-off line
- `backend/config.py` - `MAIL_FROM_NAME` default fallback
- `backend/.env.example` - `MAIL_FROM_NAME` documented default

Not touched: code comments that use "flyt.io" only as an illustrative
example and aren't rendered to any user (e.g. `COOKIE_DOMAIN`'s comment in
`backend/config.py` and `.env.example`), and `globals.css`'s file-header
comment.

## Testing

- Visual: live-check the recolored/recentered mark at nav size, footer
  size, and actual favicon scale (16×16/32×32) in both light and dark
  theme before calling geometry final.
- `grep -rn "flyt\.io\|Flyt\.io\|FLYT\.IO"` across `frontend/src` and the
  backend files listed above should return only the two allow-listed code
  comments once the sweep is done.
- Frontend: `tsc --noEmit`, `eslint`, `next build`.
- Backend: `ruff check`, `pytest` (email template changes are copy-only,
  no behavioral test coverage expected to change).
