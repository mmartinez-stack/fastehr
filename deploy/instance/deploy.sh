#!/usr/bin/env bash
# Rolls one environment to one image tag. Runs on the instance as root, through
# SSM Run Command from the deploy workflow (which first unpacks deploy/instance
# into /opt/fastehr), or by hand from an SSM session:
#
#   /opt/fastehr/deploy.sh dev-0123456789ab
#
# Steps, in order: log in to GHCR with the read-only token from Parameter
# Store, pull both images, refresh the app's runtime configuration from
# Parameter Store, apply migrations as a one-shot container that must exit 0
# (ADR 23), roll the web container, gate on /_smoke, and roll back to the
# previous image if the gate fails.
#
# Never `set -x`: a decrypted DATABASE_URL and the registry token pass through
# here, and Run Command output is captured and readable in the console
# (ADR 24).
set -euo pipefail

write_env() {
  cat > .env <<ENV
WEB_IMAGE=$1
AWS_REGION=$AWS_REGION
LOG_GROUP=$LOG_GROUP
APP_HOST=$APP_HOST
ENV
}

param() {
  aws ssm get-parameter --name "$1" --with-decryption --region "$AWS_REGION" \
    --query Parameter.Value --output text
}

# Everything runs inside main(): bash has parsed the whole file before the
# first command, so the workflow replacing this script underneath a running
# copy is harmless.
main() {
  TAG="${1:?usage: deploy.sh <image tag>}"

  # Written by user-data.sh: names and addresses only.
  # shellcheck disable=SC1091
  . /etc/fastehr/deploy.env
  : "${FASTEHR_ENV:?}" "${AWS_REGION:?}" "${REGISTRY:?}" "${LOG_GROUP:?}" "${APP_HOST:?}"

  APP_DIR=/opt/fastehr
  WEB_IMAGE="$REGISTRY/web:$TAG"
  MIGRATOR_IMAGE="$REGISTRY/migrator:$TAG"

  cd "$APP_DIR"
  chmod 755 "$APP_DIR/deploy.sh"

  # What is running now, so a failed rollout can go back to it.
  PREVIOUS=$(grep -oP '(?<=^WEB_IMAGE=).*' .env 2>/dev/null || true)

  # GHCR: the images are private, so the instance holds a GitHub token with
  # read:packages and nothing else. One level below the app's variables so
  # the sweep further down never copies it into app.env.
  param "/fastehr/$FASTEHR_ENV/ghcr/token" \
    | docker login ghcr.io --username "$(param "/fastehr/$FASTEHR_ENV/ghcr/username")" --password-stdin >/dev/null

  docker pull "$WEB_IMAGE"
  docker pull "$MIGRATOR_IMAGE"

  # Runtime configuration from Parameter Store, one level, not recursive: the
  # RDS master password and the registry token live a level down and are not
  # app variables. umask first so the file is never world-readable, even for
  # an instant.
  umask 077
  mkdir -p /etc/fastehr
  aws ssm get-parameters-by-path --path "/fastehr/$FASTEHR_ENV/" --with-decryption \
    --region "$AWS_REGION" --query 'Parameters[].[Name,Value]' --output text \
    | awk -F'\t' '{ n = $1; sub(/.*\//, "", n); print n "=" $2 }' > /etc/fastehr/app.env
  chmod 600 /etc/fastehr/app.env
  umask 022

  if ! grep -q '^DATABASE_URL=' /etc/fastehr/app.env; then
    echo "DATABASE_URL is not in /fastehr/$FASTEHR_ENV/ in Parameter Store" >&2
    exit 1
  fi

  # Migrations: their own step, must exit 0 before the app rolls (ADR 23). The
  # CA bundle is mounted because DATABASE_URL verifies the server certificate.
  docker run --rm \
    --env-file /etc/fastehr/app.env \
    -v /etc/fastehr/rds-ca.pem:/etc/fastehr/rds-ca.pem:ro \
    --log-driver awslogs \
    --log-opt "awslogs-region=$AWS_REGION" --log-opt "awslogs-group=$LOG_GROUP" --log-opt awslogs-stream=migrator \
    "$MIGRATOR_IMAGE"

  write_env "$WEB_IMAGE"
  docker compose up -d --remove-orphans

  # Health gate. /_smoke needs no database, so a failure here is the app itself
  # rather than the connection (ADR 16).
  ok=false
  for _ in $(seq 1 30); do
    if docker compose exec -T web node -e \
      "fetch('http://127.0.0.1:3000/_smoke').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      ok=true
      break
    fi
    sleep 2
  done

  if [ "$ok" != true ]; then
    echo "smoke check failed for $TAG; rolling back to ${PREVIOUS:-<nothing>}" >&2
    docker compose logs --tail 50 web >&2 || true
    if [ -n "$PREVIOUS" ]; then
      write_env "$PREVIOUS"
      docker compose up -d web
    fi
    exit 1
  fi

  # Applied migrations are not rolled back with the image: only expand/contract
  # migrations are safe to deploy through this script.
  docker image prune -f --filter "until=168h" >/dev/null
  echo "deployed $TAG to $APP_HOST"
}

main "$@"
