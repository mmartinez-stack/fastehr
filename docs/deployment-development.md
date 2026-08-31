# Development environment: CI/CD to EC2

**Status:** proposal, not decided. Becomes ADR 25 if accepted.
**Scope:** the **development** environment only. No staging, no production.

Merging a PR into `development` builds an image, pushes it to ECR, runs
migrations, and rolls the container on a single EC2 instance — with no SSH keys,
no inbound SSH port, and no long-lived AWS credentials in GitHub.

---

## 1. What already exists, and the one gap

Most of this is already built. `Dockerfile` (ADR 23) is production-ready and
verified, CI (`verify` + `integration`) already runs on pushes to `development`,
and `/_smoke` is a real end-to-end assertion.

**The gap: the image cannot run migrations.** ADR 23 says

> Migrations are deliberately NOT run here. […] run `prisma migrate deploy` as
> its own step in the deployment.

— which is correct, but nothing in the repo provides that step. Verified against
a real build: `apps/web/.next/standalone` contains `@prisma/client` and
`@prisma/client-runtime-utils`, and **no `prisma` CLI** — it is a devDependency
of `@fastehr/db` and Next only traces what the app imports at runtime.

```
apps/web/.next/standalone/node_modules/.pnpm/@prisma+client@7.9.1…   ← runtime, present
apps/web/.next/standalone/**/node_modules/prisma/…                   ← CLI, ABSENT
```

So the first piece of work is a second build target that can apply migrations.
Everything else depends on it.

---

## 2. Decisions, and what was rejected

| Decision | Rejected alternative | Why |
| --- | --- | --- |
| **Artifact: Docker image** | standalone tarball over rsync | The Dockerfile exists, is verified, and pins Node and pnpm. A tarball reintroduces "which Node is on the box". |
| **Registry: ECR (private)** | GHCR | ECR is pulled with the instance's IAM role — **no registry credential ever lands on the box**. GHCR needs a token stored on the instance and rotated. |
| **Auth: GitHub OIDC → IAM role** | `AWS_ACCESS_KEY_ID` in GitHub secrets | Static keys are a standing liability, do not rotate themselves, and leak through anything that prints the environment. OIDC issues a 15-minute token scoped to one repo and one environment. This is the single most important choice here. |
| **Deploy: SSM Run Command** | SSH from Actions | SSH needs a private key in GitHub secrets and port 22 reachable from GitHub's very large IP range. SSM needs **no inbound ports at all** and no key; every command is IAM-authorised and lands in CloudTrail. The security group can have zero inbound SSH. |
| **Runtime: docker compose on the instance** | ECS / App Runner / Kubernetes | The requirement is one dev box. ECS would be the right answer for prod and is disproportionate for a single instance. |
| **Postgres: container on the same instance** | RDS | Dev only, no real data (the UI still reads `src/lib/mock-data.ts`), and RDS is ~$15–30/mo for something with no durability requirement. Upgrade path is a `DATABASE_URL` change and nothing else. |
| **Deploy by immutable git SHA** | `:latest` | `:latest` makes "what is actually running?" unanswerable and rollback guesswork. |
| **Gate on `/_smoke`** | `/health` | ADR 16 keeps `/health` free for a load-balancer liveness probe. `/_smoke` is the deep check and is exactly right for a **one-shot post-deploy assertion** — verified above that it needs no database, so it isolates app failures from Postgres failures. |

### On the compose file

ADR 23 states "there is still no compose file". That sentence is about **local
development**, and it stays true — nobody is asked to run compose to work on
this repo. The file proposed here lives in `deploy/` and is a *deployment
artifact for one server*, the same category as the Dockerfile itself. If this
proposal is accepted, ADR 23 should get a one-line clarification so the next
reader does not think the rule was quietly broken.

---

## 3. Architecture

```
  PR merged to development
          │
          ▼
  ┌─────────────────────────────────────────┐
  │ GitHub Actions                          │
  │  verify (lint·typecheck·test·build)     │  ← existing, unchanged
  │  integration (postgres service)         │  ← existing, unchanged
  │            │ both must pass             │
  │            ▼                            │
  │  build-and-push                         │
  │    docker build --target runner   → web │
  │    docker build --target migrator → mig │
  │    push both to ECR as dev-<sha>        │
  │            │                            │
  │            ▼                            │
  │  deploy   (GitHub Environment: development)
  │    OIDC → sts:AssumeRole                │
  │    ssm:SendCommand ──────────────┐      │
  └──────────────────────────────────│──────┘
                                     ▼
  ┌──────────────────────────────────────────────┐
  │ EC2  (Amazon Linux 2023, no inbound SSH)     │
  │   1. aws ecr get-login-password | docker login│
  │   2. docker pull web:dev-<sha>, mig:dev-<sha> │
  │   3. docker run --rm mig  → prisma migrate deploy
  │   4. compose up -d web    (new tag)           │
  │   5. poll /_smoke → roll back on failure      │
  │                                               │
  │   containers: web(3000) · postgres · caddy(443)│
  └──────────────────────────────────────────────┘
```

**No inbound SSH. No AWS keys in GitHub. No registry credential on the box.**

---

## 4. The migrator image

A fourth stage in the existing `Dockerfile`. It reuses `deps` and `build`, so it
adds no install time — only a thin layer carrying the Prisma CLI, the schema and
the committed migrations.

This stage was **built and executed** against a live PostgreSQL 17 container
before being written down. The first draft failed, and the failure changed the
design — see the warning after the code.

```dockerfile
# ---------------------------------------------------------------------------
# migrator — applies committed migrations. NOT part of the runtime image.
#
# The runner stage deliberately contains only the standalone server, which
# traces @prisma/client but not the `prisma` CLI (a devDependency). Migrations
# are their own deployment step (ADR 23), so they need their own artifact.
# ---------------------------------------------------------------------------
FROM base AS migrator
WORKDIR /repo

COPY --from=deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=deps --chown=node:node /repo/packages/db/node_modules ./packages/db/node_modules
COPY --chown=node:node package.json pnpm-workspace.yaml ./
COPY --chown=node:node packages/db ./packages/db

USER node
WORKDIR /repo/packages/db

# The prisma binary directly, NOT `pnpm exec`: pnpm 11 runs a deps-status check
# before exec that attempts an install and writes into the repo root, and
# corepack would re-download pnpm over the network at deploy time. Neither
# belongs in a deployment step.
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
```

> **Why not `pnpm exec prisma …`:** tested, and it fails twice over. pnpm 11's
> pre-exec deps check attempts a write into the (root-owned) repo root and dies
> with `EACCES` under `USER node`; and corepack downloads pnpm from the npm
> registry *at container start*, adding a network dependency to every deploy.
> Invoking `./node_modules/.bin/prisma` directly avoids both, which is also why
> the `COPY` lines carry `--chown=node:node`.

Verified end to end against `postgres:17-alpine`:

```
Applying migration `20260814025641_init`
All migrations have been successfully applied.     ← first run
No pending migrations to apply.                    ← second run: idempotent, exit 0
```

and `\dt` shows `patients` + `_prisma_migrations` created.

Run as a **one-shot container that must exit 0** before the web container is
rolled. It is not a sidecar and never runs concurrently with itself — the deploy
job's concurrency group guarantees that.

**Size caveat:** the stage as written is ~1.57 GB, because it copies the full
workspace `node_modules`. It works and dev does not care, but it is 5× the web
image. The cheap fix — worth doing when someone touches this next — is a
dedicated `pnpm deploy --filter @fastehr/db --prod` stage, or copying only
`packages/db/node_modules` plus the `prisma`/`@prisma/*` store entries. Left
out of scope here to keep the stage obviously correct.

---

## 5. AWS resources

Create these once. Region below is a placeholder — use whichever is closest.

### 5.1 ECR

```bash
AWS_REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws ecr create-repository --repository-name fastehr/web      --image-tag-mutability IMMUTABLE
aws ecr create-repository --repository-name fastehr/migrator --image-tag-mutability IMMUTABLE
```

`IMMUTABLE` is deliberate: a tag that can be overwritten makes "what is running"
unanswerable, which is the same reason the deploy uses SHAs.

Add a lifecycle policy so dev images do not accumulate forever:

```json
{ "rules": [ {
  "rulePriority": 1,
  "description": "keep the 20 most recent dev images",
  "selection": { "tagStatus": "tagged", "tagPrefixList": ["dev-"],
                 "countType": "imageCountMoreThan", "countNumber": 20 },
  "action": { "type": "expire" }
} ] }
```

### 5.2 GitHub OIDC provider

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

### 5.3 Deploy role (assumed by GitHub Actions)

Trust policy — note the `sub` is pinned to **one repo and one GitHub
Environment**, not to a branch. That way the environment's protection rules (and
later, required reviewers) are what gate the credential.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:mmartinez-stack/fastehr:environment:development"
      }
    }
  }]
}
```

Permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "EcrLogin", "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    { "Sid": "EcrPush", "Effect": "Allow",
      "Action": ["ecr:BatchCheckLayerAvailability","ecr:InitiateLayerUpload",
                 "ecr:UploadLayerPart","ecr:CompleteLayerUpload","ecr:PutImage",
                 "ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],
      "Resource": ["arn:aws:ecr:<REGION>:<ACCOUNT_ID>:repository/fastehr/web",
                   "arn:aws:ecr:<REGION>:<ACCOUNT_ID>:repository/fastehr/migrator"] },
    { "Sid": "SsmDeploy", "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": ["arn:aws:ec2:<REGION>:<ACCOUNT_ID>:instance/<INSTANCE_ID>",
                   "arn:aws:ssm:<REGION>::document/AWS-RunShellScript"] },
    { "Sid": "SsmPoll", "Effect": "Allow",
      "Action": ["ssm:GetCommandInvocation","ssm:ListCommandInvocations"],
      "Resource": "*" }
  ]
}
```

`ssm:SendCommand` is scoped to **one instance ARN**. Left as `*` it is a remote
shell on every instance in the account.

### 5.4 Instance role (attached to the EC2 instance profile)

- Managed policy `AmazonSSMManagedInstanceCore` — this is what makes SSM work
  and what replaces SSH.
- ECR pull + Parameter Store read:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    { "Effect": "Allow",
      "Action": ["ecr:BatchGetImage","ecr:GetDownloadUrlForLayer","ecr:BatchCheckLayerAvailability"],
      "Resource": ["arn:aws:ecr:<REGION>:<ACCOUNT_ID>:repository/fastehr/*"] },
    { "Effect": "Allow", "Action": ["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath"],
      "Resource": "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/fastehr/development/*" },
    { "Effect": "Allow", "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:<REGION>:<ACCOUNT_ID>:key/<KEY_ID>" }
  ]
}
```

### 5.5 EC2 instance

| Setting | Value | Why |
| --- | --- | --- |
| AMI | Amazon Linux 2023 | SSM Agent preinstalled; no bootstrap needed to make deploys work |
| Type | **`t3.small`** (2 vCPU, 2 GiB) | See the architecture note below |
| Storage | 30 GiB gp3 | Images (~320 MB each) + Postgres volume + room for a few tags |
| Instance profile | the role from 5.4 | |
| Key pair | **none** | Nothing SSHes in. If you must break glass, use `aws ssm start-session` |
| Security group inbound | 443 (and 80 for the ACME redirect) **from your office/VPN CIDR only** | It is a dev EHR box; do not put it on the open internet |
| Security group outbound | 443 to anywhere | ECR, SSM, and ACME |
| Elastic IP | yes | The DNS record should not move when the instance restarts |

> **Architecture gotcha.** Graviton (`t4g.small`) is ~20% cheaper, but
> GitHub's `ubuntu-latest` runners are x86_64. Building `linux/arm64` there means
> QEMU emulation, which is roughly 5–10× slower, or paying for arm64 runners
> (not free on private repos). **Start on `t3.small` so the runner and the
> instance share an architecture.** Revisit only if the cost matters more than
> the simplicity.

### 5.6 Secrets — Parameter Store, per ADR 24

```bash
aws ssm put-parameter --name /fastehr/development/DATABASE_URL \
  --type SecureString --value 'postgresql://fastehr:<generated>@postgres:5432/fastehr'

aws ssm put-parameter --name /fastehr/development/POSTGRES_PASSWORD \
  --type SecureString --value '<generated>'
```

ADR 24 says a secret must never reach a log. SSM Run Command output is captured
by the service and readable from the console, so the deploy script **must not
echo these**, must not run under `set -x`, and writes them to a root-owned file:

```bash
umask 077
aws ssm get-parameters-by-path --path /fastehr/development/ --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text \
  | awk -F'\t' '{n=$1; sub(/.*\//,"",n); print n "=" $2}' > /etc/fastehr/app.env
chmod 600 /etc/fastehr/app.env
```

`NEXT_PUBLIC_APP_URL` is **not** in here. It is build-inlined (ADR 23/24), so it
is a build argument in the workflow, and it is what makes the image
environment-specific — hence the `dev-` tag prefix, so nobody is tempted to
promote it.

---

## 6. On-instance runtime

`deploy/docker-compose.yml`, deployed once and thereafter only parameterised by
the image tag:

```yaml
name: fastehr

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: fastehr
      POSTGRES_DB: fastehr
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fastehr"]
      interval: 10s
      timeout: 5s
      retries: 5
    # Not published to the host: only the app needs it.

  web:
    image: ${WEB_IMAGE:?required}
    restart: unless-stopped
    env_file: /etc/fastehr/app.env
    depends_on:
      postgres:
        condition: service_healthy
    expose:
      - "3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on:
      - web

volumes:
  pgdata:
  caddy_data:
```

`deploy/Caddyfile` — automatic TLS, two lines:

```
dev.fastehr.example.com {
    reverse_proxy web:3000
}
```

Caddy obtains and renews a Let's Encrypt certificate on its own. It needs a real
DNS A record pointing at the Elastic IP and port 80 reachable for the ACME
challenge. Without a domain, drop Caddy and publish `web` on 80 — but then do
not widen the security group.

---

## 7. The workflow

`.github/workflows/deploy-development.yml` — a **separate file** from `ci.yml`,
so the verification workflow stays readable and reusable.

```yaml
name: Deploy · development

on:
  push:
    branches: [development]

# Deploys must never overlap: two migrate steps against one database is the
# failure this prevents. Unlike CI, do NOT cancel in progress — a half-finished
# deploy is worse than a queued one.
concurrency:
  group: deploy-development
  cancel-in-progress: false

permissions:
  contents: read
  id-token: write        # required for OIDC

env:
  AWS_REGION: us-east-1
  ECR_REGISTRY: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com

jobs:
  # Reuses the existing checks rather than restating them. If CI is red,
  # nothing deploys.
  verify:
    uses: ./.github/workflows/ci.yml

  build:
    needs: verify
    runs-on: ubuntu-latest
    environment: development          # binds the OIDC subject; see 5.3
    outputs:
      tag: ${{ steps.meta.outputs.tag }}
    steps:
      - uses: actions/checkout@v5

      - id: meta
        run: echo "tag=dev-${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"

      - uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/fastehr-github-deploy
          aws-region: ${{ env.AWS_REGION }}

      - uses: aws-actions/amazon-ecr-login@v2

      - uses: docker/setup-buildx-action@v3

      # The web image. NEXT_PUBLIC_APP_URL is build-inlined (ADR 23/24), which
      # is exactly why the tag is prefixed `dev-`: this image is bound to this
      # environment's origin and must never be promoted.
      - uses: docker/build-push-action@v6
        with:
          context: .
          target: runner
          push: true
          tags: ${{ env.ECR_REGISTRY }}/fastehr/web:${{ steps.meta.outputs.tag }}
          build-args: |
            NEXT_PUBLIC_APP_URL=${{ vars.NEXT_PUBLIC_APP_URL }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - uses: docker/build-push-action@v6
        with:
          context: .
          target: migrator
          push: true
          tags: ${{ env.ECR_REGISTRY }}/fastehr/migrator:${{ steps.meta.outputs.tag }}
          cache-from: type=gha

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: development
    steps:
      - uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/fastehr-github-deploy
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy via SSM
        env:
          TAG: ${{ needs.build.outputs.tag }}
        run: |
          set -euo pipefail
          CMD_ID=$(aws ssm send-command \
            --instance-ids "${{ secrets.EC2_INSTANCE_ID }}" \
            --document-name AWS-RunShellScript \
            --comment "deploy $TAG" \
            --parameters "commands=[\"/opt/fastehr/deploy.sh $TAG\"]" \
            --query 'Command.CommandId' --output text)

          echo "SSM command: $CMD_ID"
          aws ssm wait command-executed \
            --command-id "$CMD_ID" \
            --instance-id "${{ secrets.EC2_INSTANCE_ID }}" || true

          STATUS=$(aws ssm get-command-invocation \
            --command-id "$CMD_ID" --instance-id "${{ secrets.EC2_INSTANCE_ID }}" \
            --query Status --output text)

          aws ssm get-command-invocation \
            --command-id "$CMD_ID" --instance-id "${{ secrets.EC2_INSTANCE_ID }}" \
            --query StandardOutputContent --output text

          if [ "$STATUS" != "Success" ]; then
            aws ssm get-command-invocation \
              --command-id "$CMD_ID" --instance-id "${{ secrets.EC2_INSTANCE_ID }}" \
              --query StandardErrorContent --output text
            exit 1
          fi
```

> `uses: ./.github/workflows/ci.yml` requires `ci.yml` to declare
> `on: workflow_call:`. That is a one-line addition to the existing triggers and
> keeps a single definition of "verified".

---

## 8. The on-instance deploy script

`/opt/fastehr/deploy.sh`, owned by root, `0755`. Deliberately **not** `set -x` —
it handles a decrypted `DATABASE_URL` (ADR 24).

```bash
#!/usr/bin/env bash
set -euo pipefail          # never set -x: secrets pass through here

TAG="${1:?usage: deploy.sh <tag>}"
REGION=us-east-1
ACCOUNT=<ACCOUNT_ID>
REGISTRY="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
APP_DIR=/opt/fastehr
cd "$APP_DIR"

# Records what is running now, so a failed rollout can go back.
PREVIOUS=$(grep -oP '(?<=^WEB_IMAGE=).*' .env 2>/dev/null || echo "")

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

docker pull "$REGISTRY/fastehr/web:$TAG"
docker pull "$REGISTRY/fastehr/migrator:$TAG"

# Refresh runtime config from Parameter Store. umask first; never echoed.
umask 077
mkdir -p /etc/fastehr
aws ssm get-parameters-by-path --path /fastehr/development/ --with-decryption \
  --region "$REGION" --query 'Parameters[].[Name,Value]' --output text \
  | awk -F'\t' '{n=$1; sub(/.*\//,"",n); print n "=" $2}' > /etc/fastehr/app.env
chmod 600 /etc/fastehr/app.env

# Postgres must be healthy before migrating.
set -a; . /etc/fastehr/app.env; set +a
docker compose up -d postgres
timeout 60 bash -c 'until docker compose exec -T postgres pg_isready -U fastehr; do sleep 2; done'

# Migrations: their own step, must exit 0 (ADR 23).
docker run --rm --network fastehr_default --env-file /etc/fastehr/app.env \
  "$REGISTRY/fastehr/migrator:$TAG"

# Roll the app.
echo "WEB_IMAGE=$REGISTRY/fastehr/web:$TAG" > .env
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> .env
docker compose up -d web caddy

# Health gate: /_smoke needs no database, so a failure here is the app itself.
ok=false
for i in $(seq 1 30); do
  if docker compose exec -T web node -e \
     "fetch('http://127.0.0.1:3000/_smoke').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ok=true; break
  fi
  sleep 2
done

if [ "$ok" != true ]; then
  echo "smoke failed; rolling back to ${PREVIOUS:-<none>}"
  docker compose logs --tail 100 web
  if [ -n "$PREVIOUS" ]; then
    echo "WEB_IMAGE=$PREVIOUS" > .env
    echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> .env
    docker compose up -d web
  fi
  exit 1
fi

docker image prune -f --filter "until=168h"
echo "deployed $TAG"
```

**Rollback is app-only and deliberately so.** A migration that has been applied
is not undone by re-running the previous image. With expand/contract migrations
(add a nullable column, backfill, then make it required in a later release)
that is safe; with a destructive migration it is not. On a dev box the honest
answer is to restore the volume or reset the database — which is acceptable
here precisely because it is dev.

---

## 9. EC2 bootstrap (user-data, once)

```bash
#!/usr/bin/env bash
set -euo pipefail
dnf update -y
dnf install -y docker
systemctl enable --now docker

# compose v2 as a docker plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/fastehr /etc/fastehr
# copy deploy/docker-compose.yml, deploy/Caddyfile and deploy.sh into /opt/fastehr
# (one-time, via `aws ssm send-command` or an S3 sync)
```

SSM Agent is preinstalled on Amazon Linux 2023 — nothing to install for deploys
to work. Confirm the instance appears under **Fleet Manager** before the first
deploy; if it does not, the instance role or its outbound 443 is wrong.

---

## 10. Cost

| Item | Monthly (us-east-1, on-demand) |
| --- | --- |
| `t3.small` 24/7 | ~$15.20 |
| 30 GiB gp3 | ~$2.40 |
| ECR storage (20 images × ~320 MB) | ~$0.65 |
| Elastic IP (attached) | $0 |
| SSM, CloudWatch basics | ~$0 |
| **Total** | **≈ $18/month** |

An instance schedule that stops it outside working hours (e.g. 12h × 5d) takes
compute to roughly $4.50/mo. Worth doing for a dev box; the Elastic IP keeps the
DNS record stable across stop/start.

---

## 11. Order of work

1. **Add the `migrator` stage** to `Dockerfile` — the stage in §4 exactly as
   written; it has already been built and verified against a throwaway Postgres
   (first run applies, second run no-ops, schema lands).
2. Add `on: workflow_call:` to `ci.yml` so the deploy workflow can reuse it.
3. Create ECR repositories + lifecycle policy.
4. Create the OIDC provider, deploy role, instance role.
5. Launch the EC2 instance; confirm it registers in SSM Fleet Manager.
6. Put `DATABASE_URL` and `POSTGRES_PASSWORD` in Parameter Store.
7. Copy `deploy/` and `deploy.sh` onto the instance; bring up `postgres` alone.
8. Create the GitHub Environment `development`; add secrets `AWS_ACCOUNT_ID`,
   `EC2_INSTANCE_ID` and variable `NEXT_PUBLIC_APP_URL`.
9. Add `deploy-development.yml`; merge a trivial PR and watch it.
10. **Deliberately break it once** — push an image whose `/_smoke` fails and
    confirm the rollback actually rolls back. A rollback path that has never
    executed is not a rollback path.

---

## 12. Open questions

1. **Is there a DNS name for the dev box?** Caddy's automatic TLS needs one. If
   not, it is HTTP behind a restricted security group until there is.
2. **Who may reach it?** Recommendation is an office/VPN CIDR allowlist rather
   than the open internet, even though the data is invented fixtures today. That
   stops being a preference the moment anything real is loaded.
3. **Does the dev database need backups?** Currently no real data and the UI
   reads fixtures, so the answer is plausibly "no". It changes the day the
   legacy import runs against it — and per the entity-inventory work, that
   import is where real records would first appear.
4. **Should `development` require a green CI before merge?** This pipeline
   assumes the merge commit is already good. Branch protection on `development`
   requiring the `verify` check is what makes that true.
5. **Where do deploy logs live?** SSM captures stdout, truncated at 24 KB. If
   that becomes limiting, point Run Command output at an S3 bucket or CloudWatch
   Logs.
6. **Migrations and rollback** (§8) — is expand/contract the standing rule for
   this project? Worth deciding before the first destructive migration, not
   after.
