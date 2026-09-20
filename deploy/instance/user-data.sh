#!/usr/bin/env bash
# First boot of the web instance. Rendered by the runbook with envsubst for
# the four ${...} placeholders below, then passed as EC2 user-data. Installs
# Docker and compose, records what deploy.sh needs to know about its
# surroundings, and fetches the RDS CA bundle. It does not start the app:
# there is no image until the first deploy runs.
set -euo pipefail

dnf update -y
dnf install -y docker
systemctl enable --now docker

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/fastehr /etc/fastehr
chmod 700 /etc/fastehr

# Read by deploy.sh. Nothing secret: names and addresses only.
cat > /etc/fastehr/deploy.env <<'ENV'
FASTEHR_ENV=${FASTEHR_ENV}
AWS_REGION=${AWS_REGION}
REGISTRY=ghcr.io/${GITHUB_REPOSITORY}
LOG_GROUP=/fastehr/${FASTEHR_ENV}/web
APP_HOST=${APP_HOST}
ENV

# RDS CA bundle for this region: DATABASE_URL uses
# sslmode=verify-full&sslrootcert=/etc/fastehr/rds-ca.pem.
curl -fsSL "https://truststore.pki.rds.amazonaws.com/${AWS_REGION}/${AWS_REGION}-bundle.pem" \
  -o /etc/fastehr/rds-ca.pem
chmod 644 /etc/fastehr/rds-ca.pem
