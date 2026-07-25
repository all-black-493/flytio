#!/bin/bash

set -ex

apt-get update -y
apt-get install -y docker.io docker-compose-v2 git

usermod -aG docker $(whoami)

systemctl start docker
systemctl enable docker

if [ -n "${repo_url}" ]; then
    git clone "https://${gh_pat}@github.com/${repo_url}.git"

    cat <<EOF > flytio/backend/.env
MAIL_USERNAME=${mail_username}
MAIL_PASSWORD=${mail_password}
MAIL_FROM=${mail_from}
MAIL_PORT=${mail_port}
MAIL_SERVER=${mail_server}
ACCESS_TOKEN_EXPIRE_MINUTES=${access_token_expire_minutes}
SECRET_KEY=${secret_key}
ALGORITHM=${algorithm}
DUFFEL_API_TOKEN=${duffel_api_token}
EOF

    cd flytio/backend

    docker compose up -d --build
fi