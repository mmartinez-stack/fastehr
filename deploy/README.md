# deploy/

Everything that turns a commit into a running environment, as files rather
than as steps in a document. The reasoning is ADR 34; the first-time
construction, as ordered AWS CLI calls, is
`docs/runbooks/deploy-development-ec2.md`.

```
deploy/
  operator-policy.json    the IAM permissions a person needs to run the runbook
  iam/
    instance-trust.json   EC2 may assume the instance role
    instance-policy.json  the instance may read /fastehr/<env>/* and write its log group
    github-trust.json     GitHub OIDC, one repository (by immutable id), one GitHub Environment
    github-policy.json    the deploy role may run commands on instances tagged for the environment
  instance/
    user-data.sh          first boot: Docker, compose, deploy.env, the RDS CA bundle
    docker-compose.yml    the two containers on the box: web (the app) and caddy (TLS)
    Caddyfile             TLS termination and the reverse proxy; no access log (ADR 29)
    deploy.sh             GHCR login, pull, migrate, roll, smoke-gate, roll back; run by SSM
```

The `${...}` placeholders in `iam/` and `user-data.sh` are rendered by the
runbook with `envsubst` for the account, region, environment, repository,
and host name.

## How a deploy moves

```
push to development
  └─ .github/workflows/deploy-development.yml
       verify   (calls ci.yml: lint · typecheck · test · build · integration)
       build    docker build --target runner   → ghcr.io/<owner>/fastehr/web:dev-<sha>
                docker build --target migrator → ghcr.io/<owner>/fastehr/migrator:dev-<sha>
                (pushed with the job's own GITHUB_TOKEN)
       deploy   OIDC → fastehr-<env>-github-deploy
                ssm send-command, carrying deploy/instance/* as a base64 tarball:
                  unpack into /opt/fastehr
                  /opt/fastehr/deploy.sh dev-<sha>
                    ghcr login       read-only token from Parameter Store
                    pull             both images
                    parameter store  /fastehr/<env>/* → /etc/fastehr/app.env (0600)
                    migrator         one-shot container, must exit 0 (ADR 23)
                    compose up       roll web, keep caddy
                    /_smoke          30 tries; on failure, back to the previous tag
```

No SSH key, no inbound 22, no AWS access key anywhere: GitHub gets a
fifteen-minute federated token scoped to one repository and one GitHub
Environment, and the instance authenticates to AWS with its own role. The
one credential on the box is a GitHub token that can read packages and
nothing else.

## Runtime configuration

Parameter Store, region of the environment, `SecureString`, one per
variable, named as `.env.example` names them:

| parameter | value |
| --- | --- |
| `/fastehr/<env>/DATABASE_URL` | `postgresql://fastehr:<pw>@<rds host>:5432/fastehr?sslmode=verify-full&sslrootcert=/etc/fastehr/rds-ca.pem` |
| `/fastehr/<env>/BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `/fastehr/<env>/BETTER_AUTH_URL` | `https://<host name>` |
| `/fastehr/<env>/TWILIO_ACCOUNT_SID`, `…_AUTH_TOKEN`, `…_FROM_NUMBER` | optional; all three or none (ADR 29) |
| `/fastehr/<env>/rds/master-password` | one level down: not an app variable |
| `/fastehr/<env>/ghcr/username`, `/fastehr/<env>/ghcr/token` | one level down: a classic GitHub token with only `read:packages` |

`NEXT_PUBLIC_APP_URL` is not here: it is inlined at build time (ADR 24), so
it is a GitHub variable the build job passes as a build argument.

## GitHub configuration

A GitHub Environment named `development` (the OIDC subject is pinned to it).
Variables, none of them secret:

| variable | scope | value |
| --- | --- | --- |
| `DEPLOY_ENABLED` | repository | `true` once the AWS resources exist; until then pushes are verified and nothing is built |
| `AWS_REGION` | environment | the environment's region |
| `AWS_DEPLOY_ROLE_ARN` | environment | the `fastehr-<env>-github-deploy` role's ARN |
| `NEXT_PUBLIC_APP_URL` | environment | `https://<host name>` |

`DEPLOY_ENABLED` is a repository variable because it is read by a job-level
`if`, which is evaluated before the job's environment is resolved.

## Who can run the runbook

Creating the resources needs EC2, RDS, Route53, CloudWatch Logs, SSM, and
IAM limited to roles and instance profiles named `fastehr-*` plus the GitHub
OIDC provider. `operator-policy.json` is exactly that list; attach it as a
customer-managed policy to the operator's IAM user, or use
`AdministratorAccess`. It is for a person, not for the pipeline: the GitHub
deploy role is far narrower.

## Follow-ups

- **Scheduled jobs have nowhere to run.** The runtime image is Next's
  standalone output only; `apps/web/scripts/sample-notes-for-review.ts`
  (ADR 30) is not in it and neither is the workspace it imports. The weekly
  sampling runs from the admin's "run now" button until a `jobs` image target
  exists.
- **The migrator image cannot run the db scripts.** It carries `packages/db`
  without `packages/contracts`, so `issue-temp-password` and the migration
  scripts fail there with `ERR_MODULE_NOT_FOUND`; they run locally through
  the SSM port-forward instead. Copying `packages/contracts` into that stage
  would make them runnable on the instance.
- **Migrations roll forward only.** `deploy.sh` rolls the image back, never
  the schema, so only expand/contract migrations are safe through it.
- **GHCR tags accumulate.** GHCR has no lifecycle policy; old `dev-*` tags
  are deleted from the repository's packages page by hand, or by a scheduled
  workflow later.
- **A production environment** is a separate decision (ADR 34).
