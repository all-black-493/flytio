#!/usr/bin/env bash

set -euo pipefail
trap 'echo "ERROR: deploy failed at line ${LINENO}" >&2' ERR

: "${DOPPLER_TOKEN:?DOPPLER_TOKEN is required - every application secret comes from Doppler}"
: "${GH_PAT:?GH_PAT is required to clone the repository}"
export DOPPLER_TOKEN

export DEBIAN_FRONTEND=noninteractive

REPO_DIR="flytio"
REPO_URL="https://x-access-token:${GH_PAT}@github.com/all-black-493/flytio.git"
API_DOMAIN="api.flyt.africa"
# /health/ready, not /health: the latter answers 200 even when a
# dependency is down ("degraded"), so it would pass a deploy that cannot
# actually serve. Readiness returns 503 until the database and Redis are
# reachable, which is the condition worth gating on.
HEALTH_URL="http://127.0.0.1:8000/health/ready"


# Which Doppler config this deployment reads. Named explicitly rather than
# left implicit in whatever DOPPLER_TOKEN happens to be scoped to: a token
# swapped for one issued against the wrong config would otherwise pull
# staging's secrets into production silently, and the first symptom would
# be REDIS_TLS=true against the plaintext Redis container - which took the
# site down once already. Mismatched values make doppler fail loudly here
# instead.
DOPPLER_PROJECT="${DOPPLER_PROJECT:-backend}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-prd}"

run_compose() {
    # --preserve-env, NOT `sudo env DOPPLER_TOKEN=...`: arguments are visible
    # in /proc to every user on the box, so the second form prints a live
    # service token in `ps aux` for the whole length of a build. Passing it
    # through the environment keeps it out of argv. This does depend on the
    # sudoers policy allowing the variable through, which is why the deploy
    # checks it below rather than assuming it.
    sudo --preserve-env=DOPPLER_TOKEN doppler run \
        --project "${DOPPLER_PROJECT}" --config "${DOPPLER_CONFIG}" -- docker compose "$@"
}

reclaim_disk() {
    echo '--- Disk before cleanup ---'
    df -h / | tail -1
    sudo docker container prune -f || true
    # No -a: that would take NAMED volumes too, which includes postgres_data.
    sudo docker volume prune -f || true
    sudo docker image prune -af || true
    sudo docker builder prune -af || true

    echo '--- Disk after cleanup ---'
    df -h / | tail -1
}

# --- 1. Swap ---------------------------------------------------------------
# The instance is small enough that `docker build` gets OOM-killed without it.
if [ ! -f /swapfile ]; then
    echo 'Creating 2GB swap file...'
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
else
    echo 'Swap already exists'
    sudo swapon /swapfile 2>/dev/null || true
fi
free -h

# --- 2. Dependencies -------------------------------------------------------
if ! command -v docker &> /dev/null; then
    echo 'Docker not found. Installing...'
    sudo apt-get update -y
    sudo apt-get install -y docker.io docker-compose-v2 git
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker ubuntu
fi

if ! command -v doppler &> /dev/null; then
    echo 'Doppler CLI not found. Installing...'
    # The installer verifies the binary's GPG signature and exits 3 without
    # gnupg present, so the prerequisites go in first.
    sudo apt-get update -y
    sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
    # cli.doppler.com, NOT packages.doppler.com - the latter serves the apt
    # repo and its signing key, but has no install.sh, so `curl --fail`
    # returns 22 on its 404 and (with pipefail) takes the deploy with it.
    curl -sLf --retry 3 --tlsv1.2 --proto '=https' \
        'https://cli.doppler.com/install.sh' | sudo sh
fi

# Compose v1 is long EOL, and this deploy assumes v2 throughout. Stopping
# here beats bringing the stack up through some other path with no secrets -
# an API that boots and then 500s on every request, behind a green deploy.
if ! docker compose version &> /dev/null; then
    echo 'ERROR: docker compose v2 not found. Install the docker-compose-v2 package.' >&2
    exit 1
fi

# Fail at the point of discovery rather than four steps later with containers
# in a restart loop and every deploy step still green.
if ! doppler secrets --only-names --project "${DOPPLER_PROJECT}" --config "${DOPPLER_CONFIG}" > /dev/null 2>&1; then
    echo "ERROR: cannot read Doppler ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}." >&2
    echo '       Either DOPPLER_TOKEN is missing/invalid, or it is scoped to a' >&2
    echo '       different config - which is the failure worth catching here.' >&2
    exit 1
fi
echo "Doppler ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}: $(doppler secrets --only-names --project "${DOPPLER_PROJECT}" --config "${DOPPLER_CONFIG}" | wc -l) secrets in scope"

# run_compose relies on sudo passing DOPPLER_TOKEN through. If the sudoers
# policy strips it, doppler runs with no token and compose comes up with no
# secrets - so prove it here rather than discover it as a 500 later.
if ! sudo --preserve-env=DOPPLER_TOKEN printenv DOPPLER_TOKEN > /dev/null 2>&1; then
    echo 'ERROR: sudo strips DOPPLER_TOKEN, so the containers would start with' >&2
    echo '       no secrets. Allow it in sudoers, or run compose as a user in' >&2
    echo '       the docker group so sudo is not needed at all.' >&2
    exit 1
fi

# --- 3. Source -------------------------------------------------------------
if [ -d "${REPO_DIR}" ]; then
    echo 'Repo exists, updating...'
    cd "${REPO_DIR}"
    git remote set-url origin "${REPO_URL}"
    # Not `git pull`: the checkout had diverged from origin/main, and with no
    # pull strategy configured git refuses outright ("Need to specify how to
    # reconcile divergent branches"). A deploy target has no local work worth
    # keeping, so take origin verbatim.
    git fetch --prune origin main
    git reset --hard origin/main
else
    echo 'Repo missing, cloning...'
    git clone "${REPO_URL}" "${REPO_DIR}"
    cd "${REPO_DIR}"
fi

cd backend

# --- 4. Secrets ------------------------------------------------------------
# No .env is written any more - every application secret arrives from Doppler
# at container start (see backend/docker-entrypoint.sh). A file left by an
# earlier deploy is destroyed rather than left to rot: `git reset --hard`
# ignores it, it is bind-mounted into the containers, it still feeds Compose's
# variable interpolation, and it is exactly the on-disk copy of every secret
# that moving to Doppler exists to remove.
if [ -f .env ]; then
    echo 'Removing .env left by a pre-Doppler deploy'
    shred -u .env 2>/dev/null || rm -f .env
fi

# --- 5. Deploy -------------------------------------------------------------
run_compose down --remove-orphans
# Reclaim before building, not after: the build writes a fresh image layer
# each deploy and nothing removed the old ones, which filled the 16GB root
# volume ("no space left on device" mid-layer-extract). The space has to be
# there when the build needs it.
reclaim_disk
run_compose up -d --build

# --- 6. Nginx + TLS --------------------------------------------------------
echo '--- Setting up Nginx reverse proxy ---'

if ! command -v nginx &> /dev/null; then
    echo 'Installing Nginx...'
    sudo apt-get update -y
    sudo apt-get install -y nginx
fi

if ! command -v certbot &> /dev/null; then
    echo 'Installing Certbot...'
    sudo apt-get install -y certbot python3-certbot-nginx
fi

# Quoted delimiter, so $host and friends reach nginx as written. They are
# nginx's own variables, not the shell's - unescaped here because, unlike the
# inline version this replaced, there is no surrounding shell string to
# survive first.
sudo tee "/etc/nginx/sites-available/${API_DOMAIN}" > /dev/null <<'NGINX_CONF'
server {
    listen 80;
    server_name api.flyt.africa;

    location / {
        client_max_body_size 2M;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINX_CONF

sudo ln -sf "/etc/nginx/sites-available/${API_DOMAIN}" /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
echo 'Nginx is running on port 80'

# Non-fatal: a first deploy can legitimately run before DNS has propagated,
# and HTTP-only is better than no deploy. CERTBOT_EMAIL lives in Doppler
# rather than Settings - it configures the deploy, not the application.
echo '--- Attempting SSL certificate ---'
sudo certbot --nginx \
    -d "${API_DOMAIN}" \
    --non-interactive \
    --agree-tos \
    --email "$(doppler secrets get CERTBOT_EMAIL --plain)" \
    --cert-name flyt-africa-api \
    --redirect \
    || echo 'WARNING: Certbot failed. DNS may not point here yet; nginx still serves HTTP.'

# --- 7. Prove it actually serves -------------------------------------------
# nginx and certbot succeeding says nothing about the app: with the containers
# down, every step above still passes and the site returns 502. This is the
# only check that distinguishes a deploy from a green checkmark.
echo '--- Verifying the API responds ---'
for i in $(seq 1 24); do
    if curl -fsS -o /dev/null --max-time 5 "${HEALTH_URL}"; then
        echo "API is up after ${i} attempt(s)"
        break
    fi
    if [ "${i}" -eq 24 ]; then
        echo 'ERROR: API never became healthy - container state and logs:' >&2
        run_compose ps || true
        run_compose logs --tail=60 fastapi-app || true
        exit 1
    fi
    sleep 5
done

echo '--- Deploy complete ---'
