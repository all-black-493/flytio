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

EXPOSE 80

# Every process in this image goes through the entrypoint, which is what
# injects Doppler secrets when a token is present - so neither the CMD
# below nor compose.yaml's override for the consumer has to mention
# Doppler at all.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# The API is this image's default process, so `docker run` on it starts a
# working server instead of nothing. The Kafka consumer is built from the
# same image but is a genuinely different process, so it - and only it -
# overrides this via `command:` in compose.yaml.
#
# init_db runs first: the migration chain cannot build a schema from
# nothing (see scripts/init_db.py), so against a fresh database Alembic
# fails on its very first statement and takes the container down with it.
CMD ["sh", "-c", "python -m backend.scripts.init_db && alembic upgrade head && fastapi run main.py --port 80 --host 0.0.0.0"]
