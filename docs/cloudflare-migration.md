# AWS → Cloudflare migration

Moving compute off AWS EC2 onto Cloudflare so idle time stops billing.

**Decisions taken:** run the existing FastAPI image on **Cloudflare Containers**
behind a Worker, not a rewrite to Workers. Tear AWS down **only after**
Cloudflare serves production.

**Why not Workers directly:** Python Workers run on Pyodide and support only
pure-Python, PyEmscripten and Pyodide-bundled packages. This tree has 27 of 106
distributions shipping compiled binaries, including `psycopg2-binary` and
`confluent-kafka`. Hyperdrive's supported drivers are all JavaScript, over the
JS `connect()` TCP API — there is no Python path to Postgres. `threading` and
`multiprocessing` are non-functional, so the Kafka consumer cannot exist.
Porting means rewriting 171 files, 339 tests and 16 migrations in TypeScript,
including the payment reconciliation code. Containers runs the image we
already ship.

**Not in the blast radius:** the database. `DATABASE_URL` points at Neon, so
bookings, payments and tickets are not on AWS.

**Known risks**
- Containers is **beta**. No SLA, API may change. This carries live payments.
- Cold start is 2–3s, before Neon's own wake from scale-to-zero.
- No autoscaling. Load is spread manually via `getRandom()`.
- Disk is ephemeral; container identity persists, files do not.

---

## Phase 0 — Prerequisites

- [ ] **CF-01** `wrangler login`, or supply `CLOUDFLARE_API_TOKEN` for headless use.
      Blocked on Jeremy — needs a browser. `cloudflared` is the Tunnel daemon and
      is not this.
- [ ] **CF-02** (attempted — authorization has not reached this session; only
      `cloudflare-docs` exposes tools. Likely needs a session restart.)
      Authorize the Cloudflare MCP servers (`cloudflare-api`,
      `cloudflare-bindings`, `cloudflare-builds`, `cloudflare-observability`)
      via `/mcp`. Optional; better than shelling out to wrangler.
- [ ] **CF-03** Confirm what AWS actually costs today, per service. The EKS
      staging stack was the expensive part (~$100/mo) and may already be gone;
      a small EC2 box is $10–20/mo. Worth knowing the number this project is
      buying back before spending weeks on it.

## Phase 1 — Prove the container runs

- [x] **CF-04** Audit `backend/Dockerfile` against Containers: single exposed
      port, correct entrypoint, image size, no reliance on host state. It
      already runs unprivileged on 8000 as PID 1, which is most of the work.
- [x] **CF-05** Redis runs inside the image. Cloudflare has no managed Redis
      and no sidecar, and fastapi-guard opens Redis during startup and answers
      500 to every path — health checks included — when it is missing. Started
      by the entrypoint only on `REDIS_EMBEDDED`, unpersisted, and waited on
      with PING before the app execs, since losing that race is the
      500-everything failure.
- [x] **CF-06** Scaffold `worker/` — `wrangler.jsonc` with the container binding,
      Durable Object binding and `new_sqlite_classes` migration, plus the
      `Container` subclass (`defaultPort = 8000`, `enableInternet = true`,
      `pingEndpoint = "/health/ready"`, `sleepAfter = "15m"`) and `getRandom`
      load balancing.
- [ ] **CF-07** `wrangler dev` locally. The image itself is already proven:
      running it against staging Neon gives `/health/ready` 200 with database
      and redis both healthy, PID 1 still uvicorn, clean SIGTERM shutdown.
      What remains is exercising it through the Worker rather than directly.
- [ ] **CF-08** Deploy to a `*.workers.dev` preview. Prove `/health/ready`, a
      flight search, and one authenticated route end to end.

## Phase 2 — Parity with production

- [ ] **CF-09** Secrets. Either keep Doppler in the container entrypoint (it
      already detects `DOPPLER_TOKEN`) or move to Worker secrets. Doppler is
      less churn and keeps one source of truth across environments.
- [ ] **CF-10** Migrations. Alembic currently runs as a Helm `pre-upgrade` hook.
      Decide the equivalent: a one-shot container invocation gated before
      rollout, so a failed migration cannot leave new code on an old schema.
- [ ] **CF-11** Kafka consumer. A long-lived consumer does not fit `sleepAfter`.
      Either keep it alive with the storage-touch keepalive, or port the 8 event
      types onto Cloudflare Queues with Cron Triggers for the departure-reminder
      sweep. Queues is the honest fit; it is also the larger change.
- [ ] **CF-12** Observability. Prometheus/Grafana/Loki are Compose services that
      do not come along. Replace with Workers Logs, and Analytics Engine for
      anything custom.
- [ ] **CF-13** Exercise the money paths against Duffel test and Pesapal sandbox
      on the preview deployment: checkout, IPN reconciliation, refund.

## Phase 3 — Cutover

- [ ] **CF-14** Bind `api.flyt.africa` to the Worker. DNS is already on
      Cloudflare, so this is a route, not a delegation change.
- [ ] **CF-15** Cut over. Keep EC2 running and warm as the rollback target — the
      cost of a few days' overlap against being able to undo in one DNS change.
- [ ] **CF-16** Soak. Watch error rate, p95 and cold-start latency under real
      traffic through at least one booking and one payment settlement.

## Phase 4 — Teardown (only after CF-16 is clean)

Order matters. The Terraform state bucket goes **last**, or the ability to
destroy the rest cleanly goes with it.

- [ ] **CF-17** Destroy the staging stack: EKS, ElastiCache, ACM, the GitHub
      OIDC roles. Release the ALB by deleting the Ingress first — it is created
      by the in-cluster controller, is not in Terraform state, and is orphaned
      (still billing) if the cluster goes first.
- [ ] **CF-18** Destroy production: EC2 instance, Elastic IP, security group.
- [ ] **CF-19** Delete ECR once no deployment references its images. It holds
      images and will refuse deletion until emptied.
- [ ] **CF-20** Delete the S3 Terraform state bucket. **Last.**
- [ ] **CF-21** Remove `terraform/`, `helm/`, `k8s/`, `k3d/` and the AWS
      workflows from the repo; update the README's deployment section and
      badges.
