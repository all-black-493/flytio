#  Builder stage

FROM python:3.12-slim-trixie AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /backend

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-cache --no-dev

COPY . .


#  Stage Runtime
FROM python:3.12-slim-trixie AS runtime

WORKDIR /backend

# The Doppler CLI is one 12MB static Go binary, so it's copied straight
# out of the official image rather than installed through apt. The apt
# route needs curl, gnupg, ca-certificates and apt-transport-https just to
# fetch a signing key - all of which then live in the final image, which
# is most of what the builder/runtime split above exists to avoid.
COPY --from=dopplerhq/cli:3 /bin/doppler /bin/doppler

# The CLI writes its config here if it ever needs to. With a service token
# in DOPPLER_TOKEN it shouldn't, but the default is $HOME/.doppler and
# this container has no writable home.
ENV DOPPLER_CONFIG_DIR=/tmp/.doppler

COPY --from=builder /backend /backend

# uv deliberately does NOT come along from the builder - it's a ~30MB
# build tool, and leaving it out is most of what this split saves. The
# virtualenv it produced is self-contained, so putting its bin/ first on
# PATH makes `python`, `alembic` and `fastapi` resolve to the pinned,
# already-installed versions. Every command in compose.yaml relies on
# this; run them as `alembic ...`, never `uv run alembic ...`, which is
# what "sh: 1: uv: not found" means when you see it.
ENV PATH="/backend/.venv/bin:$PATH" \
    # The app imports itself as `backend.x` from WORKDIR /backend, so the
    # package's parent has to be importable. Set here as well as in
    # compose.yaml so the image is runnable on its own.
    PYTHONPATH=/

# 8000, not 80. Ports below 1024 need root or CAP_NET_BIND_SERVICE, and
# this image runs unprivileged (below) - binding 80 as a non-root user
# fails with "Permission denied" at startup.
EXPOSE 8000

# Every process in this image goes through the entrypoint, which is what
# injects Doppler secrets when a token is present - so neither the CMD
# below nor compose.yaml's override for the consumer has to mention
# Doppler at all.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as a normal user. Kubernetes' restricted Pod Security Standard
# refuses containers that run as root, and runAsNonRoot cannot be
# satisfied by the manifest alone unless the image has a numeric,
# non-zero UID to fall back on. 1000 also matches the usual host user, so
# files written through a Compose bind mount stay editable instead of
# arriving root-owned.
#
# /tmp is where the Doppler CLI writes (DOPPLER_CONFIG_DIR above), and
# .logs is the optional log file - both need to belong to appuser for a
# non-root process, and neither is needed for the app to serve.
RUN useradd --create-home --uid 1000 --shell /bin/bash appuser \
    && mkdir -p /backend/.logs /tmp/.doppler \
    && chown -R appuser:appuser /backend /tmp/.doppler
USER appuser

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Exec form, one process, no shell. This is what makes graceful shutdown
# work: the CMD becomes PID 1, so the SIGTERM Kubernetes sends on a
# rolling update reaches uvicorn, which finishes in-flight requests before
# exiting. The previous `sh -c "migrate && migrate && serve"` left uvicorn
# as a CHILD of the shell, and a shell forwards nothing - every pod would
# sit out the full termination grace period and then be SIGKILLed
# mid-request.
#
# Migrations are deliberately NOT here any more. With more than one
# replica they would race to ALTER the same tables on every rollout; they
# belong in a Kubernetes init container or Job, and in Compose's `migrate`
# service - all three run the same `python -m backend.scripts.migrate`.
#
# No --workers: under an orchestrator, replication is the cluster's job.
# One process per container keeps the memory footprint predictable and
# lets the scheduler do the scaling (FastAPI's own deployment guidance).
CMD ["fastapi", "run", "main.py", "--port", "8000", "--host", "0.0.0.0"]
