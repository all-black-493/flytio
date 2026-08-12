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
