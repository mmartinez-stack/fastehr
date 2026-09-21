# ADR 34 — The development environment: CLI-built AWS resources, images in GHCR, deploys through SSM

**Status:** accepted (2026-09-18)  
**Applies to:** `deploy/` · `.github/workflows/deploy-development.yml` · `docs/runbooks/deploy-development-ec2.md`

The AWS resources the app runs on (EC2, RDS, Route53, IAM roles, a log
group, Parameter Store) are created by an ordered sequence of AWS CLI calls
in the runbook, with every policy document and the instance's first-boot
script kept as files under `deploy/`. Images are built by GitHub Actions and
stored in GitHub's container registry (GHCR). Deploys are SSM Run Command
carrying the instance files inside the command. Nothing about the environment
exists only in a console, a shell history, or a markdown heredoc.

## The constraint that shaped this

The account is the client's, and access to it is granted per service. What
was granted: EC2, RDS, Route53, CloudWatch Logs, SSM, and IAM limited to
roles named `fastehr-*`. What was not: ECR, S3, and CloudFormation. The
first draft of this decision used all three (a registry for the images, a
bucket to carry the instance files, and three stacks to create everything
with drift detection and teardown as a unit). Each was replaced by something
that needs no further permission, and the replacements are recorded here so
the next reader does not take them for preferences.

| needed | first draft | now | what it costs |
| --- | --- | --- | --- |
| a place for the images | ECR, pulled with the instance role | GHCR, pulled with a read-only GitHub token | one credential on the box (see below) |
| the instance's files at the deployed commit | S3, synced by CI and by `deploy.sh` | a base64 tarball inside the Run Command | nothing; ~5 KB per deploy |
| creating the resources | CloudFormation stacks | CLI calls in order, policy documents as files | no drift detection, no one-step teardown; the runbook's teardown section is the substitute |

## Why not the obvious alternatives to the pieces that stayed

**GitHub Actions builds the images, not the instance.** Building on a
`t3.small` means the repository and a build toolchain on the box, ten minutes
of CPU per deploy next to the running app, and no build cache. CI already
verifies the commit; building there keeps the instance a runtime and nothing
else.

**A GitHub token on the instance, and what bounds it.** The images are
private, so the instance must authenticate to GHCR. The token has one scope
(`read:packages`), an expiry, lives as a `SecureString` one level below the
app's variables so `deploy.sh` never copies it into the container's
environment, and can be revoked from GitHub in one click. It is the only
credential on the box, and it can read images and nothing else.

**IAM roles rather than access keys, still.** The instance role is what lets
the box read its secrets and write its logs without a stored key, and the
GitHub deploy role is what turns a push into a deploy through a fifteen-minute
federated token scoped to one repository and one GitHub Environment. The
repository is matched by GitHub's immutable subject (owner and repository
ids, not names), so a renamed or re-created repository cannot assume the
role; the runbook reads the exact prefix from GitHub's API. Both roles are
`fastehr-*` by name, which is exactly what the granted IAM permission covers.
Everything this environment does to avoid standing credentials rests on
those two roles; they are the non-negotiable part of the permission request.

**Deploys through SSM, not SSH.** Run Command needs no inbound port, no key
pair, and is IAM-authorised and recorded in CloudTrail. The deploy role may
send it only to instances tagged `fastehr:environment=<env>`, so replacing
the instance changes nothing in the role or the workflow. Session Manager is
the break-glass shell for the same reasons.

## Decisions inside the files

**Port 443 is open to the internet, not to an office range.** The earlier
runbook allowed HTTPS from an office CIDR only. That was wrong for this
product: the self-service intake (ADR 29) texts patients a link they open on
their own phones. Who may read what is decided by authentication and the
tRPC middleware chain (ADR 10), not by the network. Port 22 does not exist.

**Secrets are Parameter Store SecureStrings under `/fastehr/<env>/`**, one
per variable, named as `.env.example` names them (ADR 24). `deploy.sh` reads
exactly that level into `/etc/fastehr/app.env` on every deploy, root-owned,
`0600`, never echoed. The RDS master password and the GHCR token sit one
level down so the same read never sweeps them in.

**Container stdout goes to CloudWatch Logs, kept six years.** The PHI audit
trail is a line on stdout until the audit table exists
(`apps/web/src/server/audit-log.ts`). Docker's default driver would keep it
on the root volume until rotation dropped it. The Caddyfile has no access log
on purpose: request paths carry the intake token (ADR 29).

**The database connection verifies the server certificate.** RDS forces TLS;
the earlier runbook used `sslmode=no-verify`. The instance downloads the
regional RDS CA bundle at first boot and `DATABASE_URL` uses
`sslmode=verify-full&sslrootcert=/etc/fastehr/rds-ca.pem`, mounted into both
the web and migrator containers.

**TLS terminates in Caddy on the instance, not in a load balancer.** One
instance does not need an ALB, and an ALB with ACM roughly doubles the
monthly cost. The proxy flushes immediately because both tRPC's stream link
(ADR 17) and React Server Components stream. ADR 16 keeps `/health` free for
the day a target group wants it.

## What this does not decide

- **Production.** One development environment. Production is a separate
  decision: Multi-AZ, a load balancer, WAF, a restore drill, and, with the
  permissions to do it, the registry and templates the first draft had.
- **Where scheduled jobs run.** The review-sampling script
  (`apps/web/scripts/sample-notes-for-review.ts`, ADR 30) is not in the
  runtime image, which carries only Next's standalone output. Until a jobs
  image exists, sampling runs from the admin's "run now" button. Tracked in
  `deploy/README.md`.
