# AWS → Cloudflare Workers

Moving compute off AWS EC2 onto Cloudflare Workers so idle time stops billing.

**The remaining work is tracked in GitHub issues**, labelled
[`cloudflare-migration`](../../../issues?q=is%3Aissue+label%3Acloudflare-migration)
and grouped into the Phase 1–4 milestones. This file is the decision record:
why the migration is shaped the way it is, and what has been learned doing it.
It is not a task list.

**Decisions taken**
- **Workers only. No Containers.** Containers were the original reason to
  consider the Paid plan; the design dropped them.
- **Workers Paid, for a different reason.** Password verification is bcrypt
  cost 12 — ~340 ms of CPU in V8 — against the free plan's 10 ms per request.
  Nothing else in the design needs it.
- **The backend is rewritten in TypeScript.** Python cannot reach Postgres on
  Workers (see below), so this is a rewrite, not a port.
- **Strangler fig, not big-bang.** The Worker fronts `api.flyt.africa` and
  proxies anything it does not implement to the existing EC2 API. Routes move
  one at a time, under real traffic, and the project can stop at any point
  without leaving the product broken.
- **Clean architecture**, because a rewrite is the one moment the boundaries
  are free.
- Tear AWS down only after Workers serves production.

**Why this is a rewrite.** Re-examined 2026-10-19, because the original
reason expired: Python Workers now run FastAPI through an official ASGI
entrypoint, and `asyncpg` reaches Postgres through Hyperdrive. Both were
verified by spike, not read - a Python Worker queried this project's own
database and counted its 15 bookings.

What still forces a rewrite is narrower and sharper: **`greenlet` has no wasm
wheel**, and SQLAlchemy's async bridge requires it.

    sqlmodel_async -> ValueError: the greenlet library is required to use
                      this function. No module named 'greenlet'

Every one of the 92 synchronous functions in `crud/` is SQLModel, so none of
them run on Workers. Sync SQLAlchemy is not an escape either - it needs a sync
DBAPI, which means psycopg2, which means real sockets. Reaching the database
from Python means raw `asyncpg` and hand-written SQL, which is the same work
as the TypeScript port, in a different language.

So the data layer is rewritten either way. What Python *would* preserve is
everything above it: pydantic schemas, pricing, offer filtering, email
templates, PDF generation. That matters least for the routes already migrated
and most for the ones that are not - see the Python Workers note on CF-32.

`confluent-kafka` and `threading` remain unavailable regardless, so the Kafka
consumer cannot exist in either language.

**Not in the blast radius:** the database. `DATABASE_URL` points at Neon, so
bookings, payments and tickets stay where they are. The rewrite changes what
talks to the schema, not the schema.

## Platform, and what it costs

| Service | Allowance | Used for |
|---|---|---|
| Workers Paid | $5/mo, 10M requests and 30M CPU-ms included | the API |
| Hyperdrive | included | pooled Postgres to Neon |
| Queues | included | the 8 event types |
| Durable Objects | SQLite-backed | rate limiting, coordination |
| Workers KV | 100k reads, **1k writes**/day on free | place suggestions, config |
| Cron Triggers | included | departure-reminder sweep |

Two limits shape the design rather than just sitting in a table. **KV allows
1,000 writes a day**, so it backs only long-lived reference data — offer lists
use the Cache API, and per-request rate limiting needs a Durable Object. And
**Queues retains 24h on free** rather than 14 days, so a poisoned message needs
a durable dead-letter rather than being left to age out.

At ~340 CPU-ms per sign-in, the included 30M CPU-ms covers roughly 85,000
sign-ins a month before anything is metered.

## Architecture

Dependency rule: **domain ← application ← infrastructure**. The domain imports
nothing. Adapters depend on ports, never the reverse. The rule is enforced by
`worker/eslint.config.js`, not by discipline — core `no-restricted-imports`
rather than `import/no-restricted-paths`, which needs a TypeScript resolver and
silently reports nothing without one.

oRPC, not Hono: contract-first, so the zod schemas *are* the API description
rather than something maintained alongside it.

```
worker/src/
  domain/           entities, value objects, invariants. Zero imports.
                    pricing and discounts, booking state, offer ranking,
                    keyset cursors, access-token rules
  application/
    ports/          interfaces the domain needs the world to satisfy:
                    BookingRepository, FlightSupplier, MarkupPolicy,
                    Mailer, TokenVerifier, Clock
    use-cases/      one per operation: searchFlights, signIn, authenticate,
                    changePassword, previewDiscount, sendDueDepartureReminders
  infrastructure/   adapters implementing ports
    db/             Hyperdrive + repository implementations
    suppliers/      duffel
    mail/           resend, and the ported email templates
    auth/           HS256 sign/verify, bcrypt
    cache/          KV for reference data, Cache API for short TTLs
  interfaces/
    http/           oRPC contracts, procedures, zod schemas, auth middleware
  config/           env parsing, validated with zod at startup
```

## What has been learned

Findings that cost real debugging time and would cost it again.

**Verification is differential.** Every migrated route is compared against the
running FastAPI service on the same input — payload, status, headers and, where
it matters, the database rows left behind. Unit tests against self-written
fixtures would have passed while every one of the bugs below shipped.

- **SQLAlchemy stores a Python enum by NAME.** The column holds `CONFIRMED`
  while every reader expects `confirmed`. Filters have to compare on the same
  lowered text.
- **node-postgres reads `timestamp without time zone` in the server's local
  zone.** A booking stored at 03:13 came back as 00:13Z with its microseconds
  rounded off. Timestamps are selected as text. This would also have corrupted
  every keyset cursor, which is built from `created_at`.
- **Postgres can convert a per-row time zone**; the Python sweep states it
  cannot. `f.departing_at AT TIME ZONE f.origin_time_zone` does it, so the
  whole due-leg selection happens in SQL. Unknown zone names abort the query
  rather than skipping a row, so they are excluded by name.
- **An origin/destination filter needs `EXISTS`, not a join.** A join
  multiplies a booking by its matching slices and then needs a `DISTINCT` that
  does not survive a wide projection.
- **oRPC's error envelope has no `detail`**, which every client reads. Errors
  are rewritten into FastAPI's shape on the way out. The 400→422 rewrite must
  match on the presence of validation issues, not on the status alone, or it
  catches deliberate 400s too.
- **oRPC compact input ignores the query string on a POST.** The flight-search
  route needs `inputStructure: "detailed"` or its filters are silently dropped.
- **`wrangler dev --remote` is not trustworthy here.** Its preview served
  something other than the local source; a probe route returned the origin's
  404. Local `wrangler dev` against the docker Postgres is the verification
  path.
- **The discount floor is sharper than it reads.** Against a 7% markup anything
  above ~6.5% is absorbed entirely, so a 10% code and a 50% code both leave the
  customer paying exactly the airline's fare.
- **Python Workers were re-evaluated on 2026-10-19 and the answer changed
  shape.** FastAPI, pydantic, SQLModel, pyjwt, httpx, resend and asyncpg all
  import and run; raw asyncpg reached this project's database through
  Hyperdrive. Two details cost real time: Hyperdrive from Python needs
  `compatibility_date` **2026-09-08 or later** (an earlier date fails with
  "asyncpg has no usable wheels", which reads like a missing package rather
  than a date), and `pywrangler` needs **uv >= 0.12.3**. The blocker is
  `greenlet` alone.
- **Every `flight` row has a null `origin_time_zone`**, so no departure
  reminder can fire for existing bookings in either implementation. The column
  was added after the data.

## Superseded

- **CF-04/05/06** — Dockerfile audit, embedded Redis, Container scaffold. Done
  and verified, then dropped with Containers. The commits stay in history; the
  embedded-Redis entrypoint is harmless and gated on `REDIS_EMBEDDED`.
- **CF-07/08** — `wrangler dev` and the container preview. The Worker deployed
  (`flyt-backend`); the container image push is what hit the plan gate.
- **CF-22** — Workers Paid as a Containers prerequisite. Needed after all, for
  bcrypt.
- **CF-23** — a workers.dev subdomain. Not needed: `api.flyt.africa` is kept
  and reused.
