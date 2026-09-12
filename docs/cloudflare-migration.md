# AWS → Cloudflare Workers

Moving compute off AWS EC2 onto Cloudflare Workers so idle time stops billing.

**Decisions taken**
- **Workers only. No Containers.** Containers requires the Workers Paid plan;
  everything below runs on the free tier.
- **The backend is rewritten in TypeScript.** Python cannot reach Postgres on
  Workers (see below), so this is a rewrite, not a port.
- **Strangler fig, not big-bang.** The Worker fronts `api.flyt.africa` and
  proxies anything it does not implement to the existing EC2 API. Routes move
  one at a time, under real traffic, and the project can stop at any point
  without leaving the product broken.
- **Clean architecture**, because a rewrite is the one moment the boundaries
  are free.
- Tear AWS down only after Workers serves production.

**Why this is a rewrite.** Python Workers run on Pyodide and take only
pure-Python, PyEmscripten or Pyodide-bundled packages. This tree has 27 of 106
distributions shipping compiled binaries, `psycopg2-binary` and
`confluent-kafka` among them. Hyperdrive's drivers are all JavaScript over the
JS `connect()` API, so there is no Python path to Postgres, and `threading` is
non-functional, so the Kafka consumer cannot exist. 171 files, 339 tests and 16
migrations get rewritten - payment reconciliation and refunds included. That is
the cost, and it is why the strangler fig matters: it is the difference between
a long project that ships continuously and one that ships only at the end.

**Not in the blast radius:** the database. `DATABASE_URL` points at Neon, so
bookings, payments and tickets stay where they are. The rewrite changes what
talks to the schema, not the schema.

## Platform, and what it costs

Everything here is on the **Workers Free plan**, checked against the docs:

| Service | Free tier | Used for |
|---|---|---|
| Workers | 100k requests/day | the API |
| Hyperdrive | 100k queries/day | pooled Postgres to Neon |
| Queues | 10k ops/day, 24h retention | the 8 event types |
| Durable Objects | SQLite-backed only | rate limiting, coordination |
| Workers KV | 100k reads, **1k writes**/day | cached searches, config |
| Cron Triggers | included | departure-reminder sweep |

Two of those limits shape the design rather than just sitting in a table. **KV
allows 1,000 writes a day**, so it cannot back per-request rate limiting - that
is what the Durable Object is for. And **Queues retains 24h on free** rather
than 14 days, so a poisoned message needs a durable dead-letter rather than
being left to age out.

## Architecture

Dependency rule: **domain <- application <- infrastructure**. The domain
imports nothing. Adapters depend on ports, never the reverse. Hono lives in the
delivery layer, so the HTTP framework is swappable without touching a use case.

```
worker/src/
  domain/           entities, value objects, invariants. Zero imports.
                    money, pricing, booking state, refund eligibility
  application/
    ports/          interfaces the domain needs the world to satisfy:
                    BookingRepository, FlightSupplier, PaymentGateway,
                    Mailer, EventBus, Clock
    use-cases/      one per operation: searchFlights, createOrder,
                    confirmPayment, refundBooking
  infrastructure/   adapters implementing ports
    db/             Hyperdrive + repository implementations
    suppliers/      duffel/, pesapal/, resend/
    events/         queue producer and consumer
    cache/          KV, and the Durable Object rate limiter
  interfaces/
    http/           Hono routes, zod request/response schemas, auth
    queue/          queue consumer handlers
    scheduled/      cron handlers
  config/           env parsing, validated with zod at startup
```

Why this and not the Python layout: the use cases are where the money rules
live, and they are the part that has to be testable without a network, a
database or Cloudflare. Ports make that structural rather than a matter of
discipline - which is what the old `monkeypatch.setattr` supplier fakes were
not.

---

## Phase 0 - Prerequisites

- [x] **CF-01** wrangler authenticated (OAuth, account
      `e19d2d7dae39b3ccd8554afc76416997`) with `workers`, `queues`, `d1` and
      `workers_scripts` write scopes.
- [x] **CF-02** Cloudflare MCP available: `cloudflare-api`,
      `cloudflare-bindings`, `cloudflare-builds`. `cloudflare-observability`
      still needs authorizing.
- [x] **CF-22** Workers Paid - **needed after all**, for a different reason
      than Containers. Password verification is ~340 ms of CPU against the
      free plan's 10 ms; see CF-29. Containers come with it, but nothing
      here uses them.
- [x] **CF-23** workers.dev subdomain - **not needed.** api.flyt.africa is kept
      and reused, so the Worker binds to a hostname that already exists.
      Registering one remains an option purely for previews: Workers & Pages ->
      Subdomain, then `"workers_dev": true` in wrangler.jsonc.
- [ ] **CF-33** Prepare api.flyt.africa for the Worker. Steps 1-2 **done**. Reusing it needs a
      second hostname first, because the Worker cannot proxy to the name it
      serves - that loops. In order:
      1. DNS: add `origin` A -> 3.131.239.234, **DNS only** (unproxied).
      2. On EC2: `certbot --nginx -d api.flyt.africa -d origin.flyt.africa
         --expand` and add origin.flyt.africa to nginx's `server_name`. The
         Worker's fetch to origin.* fails TLS until the certificate carries
         that SAN. Issued 2026-09-06, one certificate with both names, and
         `https://origin.flyt.africa/health/live` verifies clean.
         A first attempt failed while the two names still resolved elsewhere
         from Let's Encrypt's secondary vantage points; retrying once DNS had
         settled was all it needed.
      3. Flip `api.flyt.africa` to **Proxied** (orange cloud). A route needs a
         proxied record; without one requests never reach the Worker.
      4. Add to wrangler.jsonc and deploy:
         `"routes": [{ "pattern": "api.flyt.africa/*", "zone_name": "flyt.africa" }]`
      A route, not a Custom Domain: a Custom Domain makes the Worker the origin
      and manages the DNS record itself, which is what we want at the *end* of
      the migration, not while EC2 is still serving most paths.
- [ ] **CF-03** Confirm what AWS costs today, per service. Sets the value of
      the whole project. Cost Explorer must be enabled once in the console;
      the API then costs $0.01 per request:
      `aws ce get-cost-and-usage --time-period Start=2026-06-01,End=2026-09-01
      --granularity MONTHLY --metrics UnblendedCost
      --group-by Type=DIMENSION,Key=SERVICE --output table`

## Phase 1 - Foundation

- [ ] **CF-24** Scaffold the TypeScript Worker on the layout above: Hono,
      zod-validated config, vitest, and the dependency rule enforced by lint
      rather than by convention.
- [x] **CF-25** Hyperdrive `flyt-neon-stg` (`95658e25decb4410...`) against Neon's
      **direct** endpoint - Hyperdrive pools, so pointing it at Neon's
      PgBouncer would pool twice. `pg` over `nodejs_compat`, a new Client per
      check because Hyperdrive owns the pool. Verified through `wrangler dev`:
      `/health/ready` 200 with `database: healthy`, in the FastAPI wire shape.
      No connection string in the repo - local dev reads
      `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
- [ ] **CF-26** Proxy fallback: any route the Worker does not implement is
      forwarded to the EC2 origin unchanged. This is what makes the strangler
      fig safe, so it lands before any real route.
- [ ] **CF-27** Deploy to the workers.dev preview and prove both paths: one
      native route, one proxied.

- [ ] **CF-34** Manage Cloudflare account resources with Terraform
      (provider v5.24.0): DNS records, Hyperdrive, Queues, KV, Worker routes.
      **Not** Worker code - wrangler owns that, and wrangler.jsonc is already
      declarative. Import the two resources that exist rather than recreating
      (`flyt-backend`, hyperdrive `95658e25decb4410...`).
      State goes in **R2**, which is S3-compatible, so it does not depend on
      the S3 bucket this migration is meant to delete.
      Worth it because DNS has already cost this project three incidents: CAA
      missing amazon.com, the 200-record cap, and a malformed apex record.

## Phase 2 - Move routes, cheapest risk first

Ordered by blast radius. Nothing that moves money moves early.

- [x] **CF-28** Read-only public routes: health, flight search, popular
      destinations, place suggestions. Cacheable, no writes, no auth.

      Flight search brought over the whole shopping pipeline - markup, facets,
      filters, the BEST ranking, itinerary grouping and offset pagination -
      as pure domain code, with Duffel behind a `FlightSupplier` port and the
      admin-scheduled markup sale behind a `MarkupPolicy` port.

      Verified two ways. `test/search-parity.test.ts` drives the real router
      against a recorded Duffel response and asserts the JSON matches FastAPI
      byte-for-byte, key order included, across all five sorts and every
      filter; regenerate the reference with
      `PYTHONPATH=. uv run --project backend python worker/test/parity_reference.py`.
      Then live against real Duffel, comparing the Worker with FastAPI on the
      same search: 257 key paths on both sides, no difference.

      Not in this ticket, deliberately: price confirmation, seat maps and the
      loyalty PATCH. They read the same Duffel offers but exist to serve
      checkout, so they move with CF-32 and its money paths.

      Follow-up found while starting CF-29: oRPC's error envelope has no
      `detail`, which every client reads (`errorDetail` in the frontend's api
      client), so a 422 reached the user as "Request failed (422)" instead of
      the reason. Errors are now rewritten into FastAPI's shape on the way
      out - see `interfaces/http/fastapi-errors.ts`.

      Two notes for later. Offer lists use the Cache API, not KV: the free
      plan allows 1,000 KV writes a day and a 60-second search cache would
      spend that by lunchtime. And `wrangler dev --remote` proved unreliable
      here - its preview served something other than the local source, with a
      probe route returning the origin's 404 - so local `wrangler dev` against
      the docker Postgres is the verification path, not `--remote`.
- [~] **CF-29** Auth. Split in two by a hard platform limit, and only half of
      it can move.

      **Done: recognising a session.** Every authenticated route needs this,
      and it is cheap - an HMAC verify and one indexed lookup. The Worker now
      verifies HS256 with the same key the Python service signs with, so a
      session issued by either is honoured by both and the cutover logs
      nobody out. `GET /me` is migrated and byte-identical, refusals
      included. The rules from `get_current_user` all came over: purpose
      (a password-reset token is a validly signed JWT for the same key, and
      must not work as a session), deleted, banned, and a password reset
      invalidating tokens issued before it.

      **Sign-in, once Workers Paid is on.** You chose the upgrade, so this
      moved too: `POST /token` and `/logout`. bcrypt is pure JS here -
      measured **~340 ms of CPU** per verify against ~200 ms natively, so it
      needs the Paid plan's budget rather than the free plan's 10 ms. At that
      cost the Standard plan's included 30M CPU-ms covers roughly 85,000
      sign-ins a month before any metered CPU at all.

      Verified live, both directions: a token minted by the Worker is
      accepted by FastAPI and vice versa, the session cookie is byte-identical
      to Starlette's for both local and production settings, and the failed
      login and logout responses match.

      **Why it was nearly blocked, and what it costs to go back.** Stored hashes are bcrypt cost 12.
      Measured: **203 ms of CPU natively**, and pure-JS bcrypt in a Worker is
      several times slower again. The Workers **free plan allows 10 ms of CPU
      per request**; Paid allows up to 5 minutes. So sign-in is roughly 20x
      over budget before the JS penalty.

      Re-hashing does not rescue it. PBKDF2-SHA256 is the only password KDF
      WebCrypto offers, and at any iteration count worth using it is also far
      past 10 ms - the budget rules out password verification as such, not
      bcrypt specifically. Nor can it be moved off the request: a Durable
      Object carries the same limit.

      On the free plan none of this is reachable, so dropping back to it
      means EC2 stays alive purely to check passwords.
      `test/route-ownership.test.ts` pins which paths this Worker owns, so a
      later change cannot quietly capture an unmigrated one.

      **The password routes.** `/change-password`, `/forgot-password`,
      `/reset-password` and `DELETE /me` all moved. Email turned out not to be
      a blocker at all: it goes through Resend's HTTP API, which a Worker
      calls directly, with the branded shell ported from
      `templates/emails/_shell.html` and sends scheduled on `waitUntil` so a
      failed one cannot undo the change that triggered it - the same shape as
      the BackgroundTasks it replaces.

      Checked live against the running service on real accounts, down to the
      rows left behind: refusal statuses and bodies, the reissued cookie on a
      change, the scrubbed `deleted-{id}@flyt.africa` address and both
      timestamps on a delete, and a login token being refused as a reset
      token. One bug came out of it - the 400-to-422 rewrite was catching
      deliberate 400s as well as schema failures, so "Current password is
      incorrect." was answering 422 where the service says 400.

      Still outstanding: `/register/`, which publishes the event that sends
      the welcome email and so waits for CF-31's queue rather than dropping
      it silently; the OAuth callback; and the Durable Object rate limiter,
      since the origin's fastapi-guard limiter does not follow a route to the
      edge.

      Deploy notes. Secrets are set (`SECRET_KEY`, `DUFFEL_API_TOKEN`);
      `RESEND_API_KEY` still needs one. The Worker needs the signing key -
      `npx wrangler secret put SECRET_KEY` with the same value the Python
      service uses, or every existing session reads as invalid. COOKIE_DOMAIN
      (`.flyt.africa`), COOKIE_SECURE and the token lifetime are plain vars in
      wrangler.jsonc, mirroring Doppler's `prd` config; the parent domain is
      what lets the Next.js server read the cookie during SSR.
- [ ] **CF-30** Account reads: bookings list, booking detail, tickets.
- [ ] **CF-31** The 8 event types onto Queues, departure sweep on a Cron
      Trigger. Handlers rewritten against the ports, so the queue consumer
      stays a thin adapter.
- [ ] **CF-32** Checkout, payment confirmation, IPN reconciliation, refunds.
      Last, deliberately. Ship behind a flag and reconcile both systems against
      the same Neon rows before switching.

## Phase 3 - Cutover

- [ ] **CF-14** Bind `api.flyt.africa` to the Worker. DNS is already on
      Cloudflare, so this is a route, not a delegation change.
- [ ] **CF-15** Cut over with the proxy fallback still in place - the Worker
      serves what it owns and forwards the rest, so this stays reversible.
- [ ] **CF-16** Soak through at least one real booking and one payment
      settlement before removing the fallback.

## Phase 4 - Teardown (only after CF-16 is clean)

Order matters. The Terraform state bucket goes **last**, or the ability to
destroy the rest cleanly goes with it.

- [x] **CF-17** Staging destroyed 2026-08-19. The `Release the load balancer`
      step did its job - it succeeded before the cluster went, so the ALB was
      not orphaned. Only ECR survived, refusing deletion while it holds images,
      which is the intended outcome.
- [ ] **CF-18** Destroy production: EC2 instance, Elastic IP, security group.
      **Deliberately last.** The site is linked from a CV as live, and the
      Worker implements health only - EC2 keeps serving through the proxy
      until the rewrite reaches parity.
- [ ] **CF-19** Delete ECR once nothing references its images.
- [ ] **CF-20** Delete the S3 Terraform state bucket. **Last.**
- [ ] **CF-21** Remove `terraform/`, `helm/`, `k8s/`, `k3d/` and the AWS
      workflows; update the README.

## Superseded

- **CF-04/05/06** - Dockerfile audit, embedded Redis, Container scaffold. Done
  and verified (`/health/ready` 200 against Neon, PID 1 correct, clean
  SIGTERM), then dropped with Containers. The commits stay in history; the
  embedded-Redis entrypoint is harmless and gated on `REDIS_EMBEDDED`.
- **CF-07/08** - `wrangler dev` and the container preview. The Worker deployed
  (`flyt-backend`); the container image push is what hit the plan gate.
