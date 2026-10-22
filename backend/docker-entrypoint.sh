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

# Cloudflare Containers run a single image, so Redis lives here rather than
# as its own service. Deliberately unpersisted: what it holds is rate-limit
# counters and cached searches, and the container's disk is ephemeral
# anyway. Daemonized rather than backgrounded so the app still becomes PID 1
# and keeps receiving SIGTERM directly.
if [ "${REDIS_EMBEDDED}" = "true" ]; then
    redis-server \
        --daemonize yes \
        --bind 127.0.0.1 \
        --port "${REDIS_PORT:-6379}" \
        --save '' \
        --appendonly no \
        --dir /tmp \
        --pidfile /tmp/redis.pid \
        --logfile /tmp/redis.log

    # fastapi-guard opens Redis during app startup and answers 500 to every
    # path - health checks included - if it is not there yet.
    i=0
    while [ "$i" -lt 50 ]; do
        redis-cli -h 127.0.0.1 -p "${REDIS_PORT:-6379}" ping >/dev/null 2>&1 && break
        i=$((i + 1))
        sleep 0.1
    done
    if [ "$i" -eq 50 ]; then
        echo "embedded redis did not answer PING in 5s" >&2
        exit 1
    fi
fi

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
