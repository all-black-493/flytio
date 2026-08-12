#!/bin/sh
# Wraps whatever the container was asked to run in `doppler run`, so
# secrets arrive as environment variables without any command in
# compose.yaml (or the Dockerfile's CMD) having to know Doppler exists.
#
# Doppler is OPTIONAL and detected, not assumed. With no DOPPLER_TOKEN -
# local development, CI, anyone who just cloned the repo - this execs the
# command unchanged and config.py reads .env as it always has. That
# matches how every other external dependency in this codebase degrades
# (OPENAI_API_KEY, DUFFEL_WEBHOOK_SECRET): absent means "feature off",
# never "startup failure".
set -e

if [ -n "${DOPPLER_TOKEN}" ]; then
    # --preserve-env is "false" by default, meaning Doppler OVERWRITES
    # anything already in the environment. That's right for secrets, and
    # wrong for the handful of values compose sets to describe the
    # container's own topology: REDIS_HOST=redis is true because of the
    # compose network, not because of anything in Doppler, and a stray
    # REDIS_HOST=localhost in a Doppler config would otherwise silently
    # point this container at itself. Those names are pinned here; every
    # other variable comes from Doppler and wins.
    exec doppler run --preserve-env="PYTHONPATH,REDIS_HOST,REDIS_PORT" -- "$@"
fi

exec "$@"
