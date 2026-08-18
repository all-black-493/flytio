#!/usr/bin/env bash
#
# Builds the Kubernetes Secret the chart reads, from backend/.env.
#
# One source of truth: the file Compose already uses. Maintaining a second
# local env file would drift, and the first symptom of drift is a pod that
# starts and behaves subtly differently from the same code under Compose.
#
# Three kinds of variable are handled differently:
#
#   dropped   - things Compose needs that Kubernetes must not see, either
#               because the chart supplies them (REDIS_*) or because they
#               mean nothing here (COMPOSE_PROFILES). A stale REDIS_HOST in
#               the Secret would override the chart and point pods at a
#               host that does not exist in the cluster.
#   rewritten - DATABASE_URL, which in .env points at Compose's `db` and in
#               the cluster must point at k3d/dependencies.yaml's Service.
#   passed    - everything else, verbatim.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/backend/.env}"
SECRET_NAME="${SECRET_NAME:-flyt-backend-secrets}"
NAMESPACE="${NAMESPACE:-default}"

# Matches k3d/dependencies.yaml's Service.
CLUSTER_DATABASE_URL="${CLUSTER_DATABASE_URL:-postgresql://postgres:postgres@postgres:5432/postgres}"

# Supplied by the chart (helm/backend/values.yaml) or meaningless here.
DROP='^(REDIS_HOST|REDIS_PORT|PYTHONPATH|COMPOSE_PROFILES|DATABASE_URL|DATABASE_MIGRATION_URL)='

if [ ! -f "${ENV_FILE}" ]; then
    echo "ERROR: ${ENV_FILE} not found. Copy backend/.env.example and fill it in." >&2
    exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT
chmod 600 "${tmp}"

# Keep KEY=VALUE lines only - no comments, no blanks, no exported shell
# syntax - then append the cluster-specific database URLs. Both point at
# the same Postgres: there is no pooled/direct split locally, and the
# migration URL still has to be set or migrations fall back to the app URL
# (which is correct here, but silently so - better to be explicit).
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${ENV_FILE}" | grep -Ev "${DROP}" > "${tmp}"
{
    echo "DATABASE_URL=${CLUSTER_DATABASE_URL}"
    echo "DATABASE_MIGRATION_URL=${CLUSTER_DATABASE_URL}"
} >> "${tmp}"

# Apply rather than create: re-runnable, so changing a value in .env and
# re-running is a one-liner instead of a delete-then-create dance.
kubectl create secret generic "${SECRET_NAME}" \
    --namespace "${NAMESPACE}" \
    --from-env-file="${tmp}" \
    --dry-run=client -o yaml | kubectl apply -f -

echo "Secret/${SECRET_NAME} has $(grep -c . "${tmp}") keys (from ${ENV_FILE#"${REPO_ROOT}/"})"

# The app refuses to start without these, and a CrashLoopBackOff with a
# pydantic ValidationError is a slow way to discover a typo in .env.
missing=()
for key in ACCESS_TOKEN_EXPIRE_MINUTES ALGORITHM AUTO_BAN_DURATION AUTO_BAN_THRESHOLD \
           DATABASE_URL DUFFEL_API_TOKEN MAIL_DOMAIN PESAPAL_CONSUMER_KEY \
           PESAPAL_CONSUMER_SECRET RESEND_API_KEY SECRET_KEY; do
    grep -q "^${key}=" "${tmp}" || missing+=("${key}")
done
if [ ${#missing[@]} -gt 0 ]; then
    echo "WARNING: required by backend/config.py but absent - pods will not start:" >&2
    printf '  %s\n' "${missing[@]}" >&2
    exit 1
fi
