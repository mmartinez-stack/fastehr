# Runbook: stand up the development environment on EC2, from scratch

**What this produces:** the app container running on one EC2 instance behind
Caddy (automatic HTTPS), backed by an RDS PostgreSQL instance, reachable at a
Route53 subdomain, with no SSH key pair and no inbound port 22 — break-glass
access is SSM Session Manager.

**Relation to `docs/deployment-development.md`:** that document is the CI/CD
proposal (build on merge, deploy via SSM Run Command). This runbook is the
manual, first-time construction of the environment it deploys into — and it
**supersedes that document's §5.5 database decision**: Postgres is RDS, not a
container on the instance, because the legacy patient import means this
environment will hold real data, which deserves managed storage, backups, and
encryption at rest.

Everything below is copy-paste shell against the AWS CLI v2. Run the local
steps from the repo root on an x86_64 machine (the images are built locally and
pushed; the instance is x86_64, so an ARM Mac needs `--platform linux/amd64`
on the builds).

---

## 0. Prerequisites

- An AWS account and a person with admin access to it (one-time setup needs
  broad permissions; nothing after this runbook does).
- AWS CLI v2 installed locally (`aws --version`).
- Docker installed locally.
- A domain you control. The examples use `example.com` and the subdomain
  `dev.fastehr.example.com` — substitute yours everywhere.

## 1. Configure CLI credentials

If the account uses IAM Identity Center (SSO), prefer it — credentials expire
on their own:

```bash
aws configure sso        # follow the prompts; pick the admin permission set
export AWS_PROFILE=<the-profile-name-you-chose>
```

Otherwise, create an IAM user for yourself with `AdministratorAccess`, create
an access key for it (IAM console → Users → Security credentials), and:

```bash
aws configure            # paste the key id and secret; default region: us-west-2
```

Verify:

```bash
aws sts get-caller-identity
```

## 2. Session variables

Everything below reuses these. Re-export them if you open a new shell.

```bash
export AWS_REGION=us-west-2                      # closest to the LA-area offices
export AWS_DEFAULT_REGION=$AWS_REGION
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

APP_HOST=dev.fastehr.example.com                 # your subdomain
OFFICE_CIDR=203.0.113.0/24                       # your office/VPN egress range

WORK=~/fastehr-aws && mkdir -p "$WORK"           # scratch dir for policy JSON
```

> **Why `OFFICE_CIDR`:** this is a dev EHR box, and real patient records land
> in it the day the legacy import runs against it. HTTPS is allowed from your
> office/VPN range only; only port 80 (the ACME challenge, which serves no app
> content) is open to the world.

## 3. Network and security groups

The default VPC is fine for a single dev box.

```bash
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

# Web instance: 80 to the world (Let's Encrypt HTTP-01), 443 to the office only.
WEB_SG=$(aws ec2 create-security-group --vpc-id "$VPC_ID" \
  --group-name fastehr-dev-web --description 'fastehr dev web instance' \
  --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$WEB_SG" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$WEB_SG" \
  --protocol tcp --port 443 --cidr "$OFFICE_CIDR"

# Database: 5432 from the web security group and from nowhere else.
DB_SG=$(aws ec2 create-security-group --vpc-id "$VPC_ID" \
  --group-name fastehr-dev-db --description 'fastehr dev rds' \
  --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$DB_SG" \
  --protocol tcp --port 5432 --source-group "$WEB_SG"
```

## 4. RDS PostgreSQL

The engine major version matches local dev and CI (PostgreSQL 17). Generate
the master password as hex so it never needs URL-encoding inside
`DATABASE_URL`:

```bash
DB_PASSWORD=$(openssl rand -hex 24)
echo "$DB_PASSWORD"        # store it in your password manager NOW; it is shown nowhere again

aws rds create-db-instance \
  --db-instance-identifier fastehr-dev \
  --engine postgres --engine-version 17 \
  --db-instance-class db.t4g.micro \
  --allocated-storage 20 --storage-type gp3 \
  --master-username fastehr --master-user-password "$DB_PASSWORD" \
  --db-name fastehr \
  --vpc-security-group-ids "$DB_SG" \
  --no-publicly-accessible \
  --storage-encrypted \
  --backup-retention-period 7 \
  --no-multi-az

aws rds wait db-instance-available --db-instance-identifier fastehr-dev   # ~10 min

RDS_HOST=$(aws rds describe-db-instances --db-instance-identifier fastehr-dev \
  --query 'DBInstances[0].Endpoint.Address' --output text)
echo "$RDS_HOST"
```

Notes on the choices:

- `db.t4g.micro` (Graviton) is fine even though the EC2 instance is x86 — the
  database's architecture is invisible to the app, and t4g is the cheapest.
- `--no-publicly-accessible` + the security group means the only network path
  to this database is from the web instance. Ad-hoc access from your machine
  goes through an SSM port-forward (step 12), never by opening 5432.
- `--backup-retention-period 7` because real records arrive with the import.
- RDS PostgreSQL ships with `rds.force_ssl=1`: connections must use TLS. The
  connection string below handles it.

```bash
DATABASE_URL="postgresql://fastehr:$DB_PASSWORD@$RDS_HOST:5432/fastehr?sslmode=no-verify"
```

> `sslmode=no-verify` encrypts the connection without verifying the RDS CA —
> acceptable inside a VPC on dev. If `prisma migrate deploy` (step 10) rejects
> that mode, the fallbacks are, in order: bake the RDS CA bundle
> (`https://truststore.pki.rds.amazonaws.com/$AWS_REGION/$AWS_REGION-bundle.pem`)
> into the env as `sslrootcert`, or attach a custom parameter group with
> `rds.force_ssl=0`.

## 5. ECR repositories, build, push

Two repositories — the runtime image and the migrator (ADR 23 keeps migrations
out of the runtime image; the `migrator` target exists in the Dockerfile for
exactly this step). Tags are immutable so "what is running" is always
answerable.

```bash
aws ecr create-repository --repository-name fastehr/web      --image-tag-mutability IMMUTABLE
aws ecr create-repository --repository-name fastehr/migrator --image-tag-mutability IMMUTABLE

aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY"

# From the repo root, on the commit you mean to deploy:
TAG=dev-$(git rev-parse --short=12 HEAD)

# NEXT_PUBLIC_APP_URL is inlined at build time (ADR 24): this image is bound
# to this origin and must never be pointed at another environment.
docker build --target runner --build-arg NEXT_PUBLIC_APP_URL="https://$APP_HOST" \
  -t "$REGISTRY/fastehr/web:$TAG" .
docker build --target migrator -t "$REGISTRY/fastehr/migrator:$TAG" .

docker push "$REGISTRY/fastehr/web:$TAG"
docker push "$REGISTRY/fastehr/migrator:$TAG"
```

## 6. IAM role for the instance

The instance authenticates to AWS through its instance profile — no credential
file ever lands on the box. `AmazonSSMManagedInstanceCore` is what replaces
SSH; the inline policy lets it pull the two images.

```bash
cat > "$WORK/ec2-trust.json" <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role --role-name fastehr-dev-instance \
  --assume-role-policy-document "file://$WORK/ec2-trust.json"

aws iam attach-role-policy --role-name fastehr-dev-instance \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

cat > "$WORK/ecr-pull.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    { "Effect": "Allow",
      "Action": ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"],
      "Resource": "arn:aws:ecr:$AWS_REGION:$ACCOUNT_ID:repository/fastehr/*" }
  ]
}
EOF

aws iam put-role-policy --role-name fastehr-dev-instance \
  --policy-name ecr-pull --policy-document "file://$WORK/ecr-pull.json"

aws iam create-instance-profile --instance-profile-name fastehr-dev-instance
aws iam add-role-to-instance-profile --instance-profile-name fastehr-dev-instance \
  --role-name fastehr-dev-instance
```

## 7. EC2 instance and Elastic IP

Amazon Linux 2023 (SSM agent and AWS CLI preinstalled), `t3.small` (x86_64,
matching the local builds), 30 GiB, **no key pair** — nothing SSHes in, ever.
User-data installs Docker and the compose plugin on first boot.

```bash
cat > "$WORK/user-data.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
dnf update -y
dnf install -y docker
systemctl enable --now docker

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/fastehr /etc/fastehr
EOF

AMI=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI" --instance-type t3.small \
  --iam-instance-profile Name=fastehr-dev-instance \
  --security-group-ids "$WEB_SG" \
  --user-data "file://$WORK/user-data.sh" \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=fastehr-dev}]' \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

# The Elastic IP keeps DNS stable across stop/start (it is free while attached).
EIP_ALLOC=$(aws ec2 allocate-address --query AllocationId --output text)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$EIP_ALLOC"
EIP=$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" \
  --query 'Addresses[0].PublicIp' --output text)
echo "instance $INSTANCE_ID at $EIP"
```

Confirm the instance registered with SSM (this is the deploy path *and* the
break-glass path, so do not proceed until it appears — a minute or two after
boot):

```bash
aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --query 'InstanceInformationList[0].PingStatus'    # → "Online"
```

If it never comes online, the instance profile or outbound 443 is wrong.

## 8. Route53: the subdomain

Two cases, depending on where the domain's DNS lives today.

**Case A — the domain already has a public hosted zone in this account:**

```bash
ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name example.com \
  --query 'HostedZones[0].Id' --output text)
```

**Case B — the domain is registered elsewhere (GoDaddy, Namecheap, …):**
create a hosted zone here and move the domain's DNS to it. Route53 charges
$0.50/month per zone.

```bash
ZONE_ID=$(aws route53 create-hosted-zone --name example.com \
  --caller-reference "fastehr-$(date +%s)" --query 'HostedZone.Id' --output text)

# These four name servers go into the registrar's NS settings for the domain.
aws route53 get-hosted-zone --id "$ZONE_ID" --query 'DelegationSet.NameServers'
```

> Moving the whole domain moves *all* its DNS — recreate any existing records
> (mail, the main site) in the zone **before** switching the NS entries at the
> registrar. If that is not acceptable, delegate only the subdomain instead:
> create the zone for `dev.fastehr.example.com` itself and add its four NS
> records at the registrar as an `NS` record for that name.

**Both cases — point the subdomain at the Elastic IP:**

```bash
cat > "$WORK/dns.json" <<EOF
{ "Changes": [ { "Action": "UPSERT", "ResourceRecordSet": {
  "Name": "$APP_HOST", "Type": "A", "TTL": 300,
  "ResourceRecords": [{ "Value": "$EIP" }] } } ] }
EOF
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --change-batch "file://$WORK/dns.json"

# Wait for propagation before starting Caddy — it needs the name to resolve
# to this box to pass the ACME challenge.
dig +short "$APP_HOST"    # → the Elastic IP
```

## 9. Configure the instance

Open a shell on it (this is what replaced SSH):

```bash
aws ssm start-session --target "$INSTANCE_ID"
```

Everything in this step runs **inside that session**, as root
(`sudo -i`). Substitute the real values — the session is not your local
shell, so `$RDS_HOST` etc. do not exist there.

Runtime environment, per `.env.example` — three values, `0600`, root-owned.
Generate `BETTER_AUTH_SECRET` here so it never exists on any other machine:

```bash
umask 077
cat > /etc/fastehr/app.env <<EOF
DATABASE_URL=postgresql://fastehr:<DB_PASSWORD>@<RDS_HOST>:5432/fastehr?sslmode=no-verify
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://dev.fastehr.example.com
EOF
chmod 600 /etc/fastehr/app.env
```

The compose file and Caddyfile:

```bash
cat > /opt/fastehr/docker-compose.yml <<'EOF'
name: fastehr

services:
  web:
    image: ${WEB_IMAGE:?required}
    restart: unless-stopped
    env_file: /etc/fastehr/app.env
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
  caddy_data:
EOF

cat > /opt/fastehr/Caddyfile <<'EOF'
dev.fastehr.example.com {
    reverse_proxy web:3000
}
EOF
```

Caddy obtains and renews the Let's Encrypt certificate on its own; the DNS
record from step 8 and world-reachable port 80 are all it needs.

## 10. Migrations

Still on the instance. Log in to ECR with the instance role, pull, and run the
migrator as a one-shot container that must exit 0:

```bash
REGISTRY=<ACCOUNT_ID>.dkr.ecr.us-west-2.amazonaws.com
TAG=<the tag pushed in step 5>

aws ecr get-login-password --region us-west-2 \
  | docker login --username AWS --password-stdin "$REGISTRY"

docker run --rm --env-file /etc/fastehr/app.env "$REGISTRY/fastehr/migrator:$TAG"
```

Expected: every migration in `packages/db/prisma/migrations/` applies, ending
in `All migrations have been successfully applied.` Re-running it prints
`No pending migrations to apply.` and exits 0 — it is idempotent, and this is
the same step every future deploy runs before rolling the web container.

### Weekly note sampling (DIA-74, ADR 30)

The medical-director review queue is fed by a job that samples one in twenty
of the notes signed since its last run. Cadence is cron's; the job records
the window it covered, so a late or repeated run skips nothing. Install it on
the instance as a weekly line (Monday 06:00 Pacific; the instance clock is
UTC, so 13:00 UTC in summer) running inside the web image:

```bash
sudo tee /etc/cron.d/fastehr-review-sample >/dev/null <<'EOF2'
0 13 * * 1  root  cd /opt/fastehr && docker compose run --rm web node apps/web/scripts/sample-notes-for-review.ts >> /var/log/fastehr-review-sample.log 2>&1
EOF2
```

`--rate <n>` changes "one in twenty"; `--since YYYY-MM-DD` catches up from an
earlier date. An admin who holds the medical-director flag can also run it
from the review page.

## 11. Start and verify

```bash
cd /opt/fastehr
echo "WEB_IMAGE=$REGISTRY/fastehr/web:$TAG" > .env
docker compose up -d

# /_smoke needs no database, so a failure here is the app itself (ADR 16/23):
docker compose exec -T web node -e \
  "fetch('http://127.0.0.1:3000/_smoke').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
  && echo SMOKE-OK
```

Then from a browser **on the office network**: `https://dev.fastehr.example.com`
should serve the login page over a valid certificate. (From anywhere else, 443
is filtered — that is the security group doing its job.)

## 12. First admin

Sign-up is disabled by design, so the first account is inserted directly and
issued a temporary password. The database accepts connections only from inside
the VPC; reach it from your machine through an SSM port-forward via the
instance:

```bash
# Terminal 1 — leave running:
aws ssm start-session --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_HOST,portNumber=5432,localPortNumber=15432"

# Terminal 2 — create the admin row (updatedAt has no DB default; supply it):
psql "postgresql://fastehr:$DB_PASSWORD@localhost:15432/fastehr" -c \
  "INSERT INTO users (id, name, email, role, \"updatedAt\")
   VALUES (gen_random_uuid(), 'Your Name', 'you@diagnosticpartners.com', 'admin', now());"

# Terminal 2 — issue the temporary password (prints to stdout only):
cd packages/db
DATABASE_URL="postgresql://fastehr:$DB_PASSWORD@localhost:15432/fastehr" \
  pnpm issue-temp-password -- --email you@diagnosticpartners.com
```

Sign in at `https://dev.fastehr.example.com/login` with the printed password;
the app forces `/change-password` before anything else. Further users are
created through the Users screen. Staff and patient data arrive via the
migration runbooks (`user-migration.md`, `docs/legacy-data-mapping.md`) run
against this same port-forward.

## Deploying a new version later

Until the CI/CD pipeline from `docs/deployment-development.md` is built, a
deploy is: step 5 (build + push a new `$TAG` locally), then on the instance
step 10 (migrator) and step 11 (`sed -i` the new tag into `/opt/fastehr/.env`,
`docker compose up -d web`). Occasionally `docker image prune -f` to reclaim
disk.

## Cost

| Item | Monthly (us-west-2, on-demand) |
| --- | --- |
| EC2 `t3.small` 24/7 | ~$15 |
| 30 GiB gp3 | ~$2.40 |
| RDS `db.t4g.micro` 24/7 | ~$12 |
| RDS 20 GiB gp3 + backups | ~$2.50 |
| Route53 hosted zone | $0.50 |
| ECR, SSM, Elastic IP (attached) | ~$1 |
| **Total** | **≈ $33/month** |

Stopping the EC2 instance outside working hours roughly halves its line; the
Elastic IP then bills ~$3.60/month while detached-or-stopped, which is still a
net saving. RDS can also be stopped, but restarts itself after 7 days.

## Teardown

In reverse order: `docker compose down` on the instance; terminate the
instance; release the Elastic IP; delete the RDS instance (**take a final
snapshot if the import ever ran** — it holds real patient data); delete the
ECR repositories, the two security groups, the IAM role/profile, and the
Route53 record.
