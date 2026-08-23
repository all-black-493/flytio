<div align="center">

# flyt

**Every airline. One search. The exact fare, locked before you pay.**

[flyt.africa](https://www.flyt.africa) &nbsp;·&nbsp; Search 300+ carriers, hold the price through checkout, and keep every ticket and receipt in one place.

<img src="frontend/public/flyt.png" alt="flyt.africa — flight search and live departures board" width="900">

</div>

---

## What this is

A production travel booking platform. A traveller searches real inventory through [Duffel](https://duffel.com), pays by M-Pesa or card through [Pesapal](https://pesapal.com), and gets an issued ticket with a PDF itinerary — for themselves or for a whole company.

The interesting parts are not the search box. They are the three places where money, suppliers and failure meet:

**Payment and fulfilment are settled separately, and reconciled idempotently.** The checkout is snapshotted before the customer is charged, then replayed against Duffel when Pesapal's IPN confirms. flyt pays the airline the raw fare from its Duffel balance while charging the traveller a marked-up total, so the two ledgers never have to agree in real time — only eventually, and exactly once.

**A Duffel refund credits flyt, not the traveller.** Cancelling an order returns money to flyt's own Duffel balance; getting the customer their money back is an independent movement down the rail they actually paid on. Pesapal also refunds M-Pesa only in full, so partial mobile-money refunds are routed to a staff queue rather than silently failing.

**Schema changes gate the release.** Migrations run as a Helm `pre-upgrade` hook — once per release rather than once per pod — so a migration that fails leaves the previous version serving instead of rolling out code its schema cannot support.

## Architecture

```
                    Next.js 16 · React 19 · TanStack Query
                                    │
                                    ▼
        ┌──────────────────── FastAPI ────────────────────┐
        │  auth · flights · bookings · payments · stays   │
        │  cars · admin · concierge · webhooks · health   │
        └───┬───────────────┬───────────────┬─────────────┘
            │               │               │
            ▼               ▼               ▼
      PostgreSQL         Redis           Kafka
      (Neon)             cache +         4 topics · 8 event types
      SQLModel           rate limits          │
      Alembic                                 ▼
                                        consumer worker
                                        email · notifications
                                        refunds · reminders

   Suppliers   Duffel (air · stays · cars) · Pesapal · Resend · OpenAI
```

The API publishes events fire-and-forget and serves every request without a broker; what stops when Kafka is down is background work, not booking.

### Stack

| Layer | |
|---|---|
| **Frontend** | Next.js 16, React 19, TanStack Query, Tailwind v4, GSAP, zod |
| **Backend** | Python 3.12, FastAPI, SQLModel, Alembic, fastapi-guard |
| **Data** | PostgreSQL 17 (Neon in deployed environments), Redis, Kafka |
| **AI** | pydantic-ai concierge, streamed over the Vercel AI SDK protocol |
| **Infrastructure** | Terraform, Docker, Kubernetes (EKS + Helm), Doppler |
| **Observability** | Prometheus, Grafana, Loki |

## Repository layout

```
backend/      FastAPI service — routers, crud, models, schemas,
              external_services (Duffel, Pesapal, Uber, Resend, OpenAI),
              workers (Kafka consumer), alembic (16 revisions)
frontend/     Next.js app
helm/         backend (API, consumer, migration job) + backend-secrets (Doppler)
terraform/    EC2 production, and kubernetes-staging (EKS, ECR, ElastiCache, ACM)
k8s/          cluster-scoped manifests (ALB IngressClass)
k3d/          local Kubernetes cluster definition
```

## Running it locally

**Backend** — everything it needs comes up in Compose:

```bash
cd backend
cp .env.example .env        # fill in the required values; see backend/config.py
docker compose up -d --build
```

The API is on `:8000`, Grafana on `:3001`, Kafka UI on `:8080`. Secrets come from `.env`, or from Doppler when `DOPPLER_TOKEN` is set — the entrypoint detects it rather than assuming it.

**Frontend**:

```bash
cd frontend
npm install
npm run dev                 # :3000
```

**On Kubernetes**, locally, via k3d:

```bash
make k3d-up        # cluster + Postgres + Redis
make k3d-deploy    # build, import, secret, install
make k3d-test      # proves the Service routes to a ready pod
make help          # everything else
```

## Tests

```bash
cd backend && uv sync --frozen
backend/.venv/bin/pytest backend/tests
```

**339 tests**, no database and no network required — the suite runs against in-memory SQLite with dependency overrides, and every supplier is stubbed. It needs only a Redis to be reachable, because fastapi-guard opens its connection during app startup.

## Deployment

Two environments, both deployed by GitHub Actions using **OIDC role assumption** — no long-lived AWS keys anywhere.

| | Production | Staging |
|---|---|---|
| Host | AWS EC2, Terraform-provisioned | AWS EKS (Auto Mode) |
| Edge | nginx + Let's Encrypt | ALB ingress + ACM |
| Runtime | Docker Compose | Helm — API, consumer and migration job as separate workloads |
| Cache | Redis container | ElastiCache |
| Secrets | Doppler (`prd`) | Doppler (`stg`), synced by the Doppler Kubernetes operator |

Images are published to ECR with **immutable tags**, so a tag is written once and always means the same image; a rollback is naming an earlier `sha-` tag.

## Status

Shipped and live: flight search, booking, payment, ticketing, refunds, PDF itineraries, admin dashboard with RBAC, pricing and discount codes, and the AI concierge.

In progress: **stays and cars** are implemented against Duffel but awaiting product entitlement on the account, and an **Uber Guest Rides** airport pickup — bundled with the flight it belongs to — is awaiting API approval. Both are gated so an unconfigured provider is simply absent rather than a runtime failure.
