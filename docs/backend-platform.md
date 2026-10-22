# Where the backend runs

flyt is a Next.js frontend and a FastAPI backend against Neon Postgres. As of
**2026-10-22** both run on **Vercel**. Getting here took three platform
decisions in two months, and the reasoning is worth keeping, because each one
was correct on the evidence available and two of them stopped being correct.

**The work is tracked in GitHub issues**, labelled
[`vercel-migration`](../../../issues?q=is%3Aissue+label%3Avercel-migration).
This file is the decision record, not a task list.

## The short version

| | Decision | Why it ended |
|---|---|---|
| Aug 2026 | AWS EC2 + EKS + Terraform | Idle compute billed around the clock for a product with no traffic |
| Sep 2026 | Cloudflare Workers, rewrite the backend in TypeScript | Python could not reach Postgres on Workers |
| Oct 2026 | Cloudflare Python Workers | `greenlet` has no wasm wheel, so SQLModel cannot run |
| Oct 2026 | **Vercel Python** | Real CPython. The existing app runs as it is. |

## Why Vercel, concretely

Vercel Functions run real CPython on Linux, not Pyodide on wasm. Every
constraint the Cloudflare plans were built around comes from wasm, so they all
dissolve:

| | Cloudflare Workers | Vercel Python |
|---|---|---|
| Runtime | Pyodide / wasm | CPython, pinned by `.python-version` |
| `greenlet`, SQLModel, `psycopg2` | unavailable | work |
| The 92 synchronous `crud/` functions | must be rewritten | run unchanged |
| bcrypt cost 12, ~200 ms | 10 ms CPU on free; needed Workers Paid | 300 s budget |
| Bundle | per-wheel wasm audit | 500 MB, or 5 GB with Fluid compute |
| FastAPI | ASGI shim | first-class |

There is no latency regression in this. Production was already in `us-east-2`
on EC2, and Vercel defaults to `iad1`; the globally distributed edge was a
Cloudflare property this product never actually ran on.

What does not port is the part that was never a web request: a long-running
Kafka consumer and a sweep ticking inside its poll loop. Those become Vercel
Queues and Vercel Cron. That work was already planned under Cloudflare, so it
is not new.

## What the Cloudflare exercise established anyway

The TypeScript rewrite reached roughly 70% of routes with 225 tests, each
verified byte-identical against the running FastAPI service, and is being
retired unused. It was not wasted, because the verification found real bugs in
assumptions that apply to the Python service too.

**Verification was differential**: every migrated route was compared against
the running service on the same input — payload, status, headers and the rows
left behind. Unit tests against self-written fixtures would have passed while
every one of these shipped.

- **SQLAlchemy stores a Python enum by NAME.** The column holds `CONFIRMED`
  while every reader expects `confirmed`.
- **`node-postgres` reads `timestamp without time zone` in the server's local
  zone.** A booking stored at 03:13 came back as 00:13Z with its microseconds
  rounded off — which would also have corrupted every keyset cursor, since the
  cursor is built from `created_at`.
- **Postgres converts a per-row time zone**, which the Python sweep states it
  cannot: `f.departing_at AT TIME ZONE f.origin_time_zone`. Unknown zone names
  abort the query rather than skipping a row, so they are excluded by name.
- **An origin/destination filter needs `EXISTS`, not a join.** A join
  multiplies a booking by its matching slices and then needs a `DISTINCT` that
  does not survive a wide projection.
- **The discount floor absorbs more than it looks.** Against a 7% markup
  anything above ~6.5% is absorbed entirely, so a 10% code and a 50% code both
  leave the customer paying exactly the airline's fare.
- **Every `flight` row has a null `origin_time_zone`**, so no departure
  reminder can fire for any existing booking. The column was added after the
  data.
- **sqlakeyset's cursor is legible and reproducible**: base64 of a direction
  marker plus the sort key, `>dt:<timestamp>~uuid:<id>`.

## Traps recorded so they cost nobody else

- **Cloudflare Python Workers + Hyperdrive needs `compatibility_date`
  2026-09-08 or later.** An earlier date fails with *"asyncpg has no usable
  wheels … only cp35m"*, which reads like a missing package rather than a date.
  It nearly produced the wrong conclusion about the whole platform.
- `pywrangler` needs **uv >= 0.12.3**.
- **Neon pooling is the opposite on each platform.** Hyperdrive pools, so it
  must point at Neon's *direct* endpoint or it double-pools. Vercel Functions
  open a connection per invocation, so they need Neon's *pooled* endpoint.
- **`wrangler dev --remote` served something other than the local source**
  during the TypeScript work: a probe route returned the origin's 404.
- A CAA record missing `amazon.com` blocked ACM issuance, and ACM never
  retries a failed one.

## Outage, 2026-10-19

`api.flyt.africa` lost its DNS record. A `*.flyt.africa` wildcard pointing at
Vercel caught it, Vercel held no certificate for that name, and TLS failed
with `unexpected eof` — so the API was unreachable while looking, from DNS
alone, like it resolved fine. Worth remembering as a failure shape: a wildcard
turns a deleted record into a confusing TLS error rather than NXDOMAIN.
