# Runbook: stand up the development environment on AWS, from scratch

**What this produces:** the app container running on one EC2 instance behind
Caddy (automatic HTTPS), backed by an RDS PostgreSQL instance, reachable at a
Route53 name, with no SSH key pair and no inbound port 22. Break-glass access
is SSM Session Manager. After this runbook, every push to `development`
deploys itself: GitHub Actions builds the images, pushes them to GHCR, and
rolls the instance through SSM Run Command.

**What it is made of:** the policy documents under `deploy/iam/`, the
instance files under `deploy/instance/`, and this sequence of AWS CLI calls.
ADR 34 has the reasoning; `deploy/README.md` has the map. Resources are
created one by one, so run the steps in order and do not skip the variables.

Everything below is copy-paste shell against the AWS CLI v2, from the repo
root. `envsubst` (package `gettext`) renders the placeholders in `deploy/`.

---

## 0. Prerequisites

- An IAM identity in the client's account with the permissions in
  `deploy/operator-policy.json` (EC2, RDS, Route53, CloudWatch Logs, SSM, and
  IAM limited to roles named `fastehr-*`), or `AdministratorAccess`.
- AWS CLI v2, `envsubst`, `dig`, and the GitHub CLI (`gh`, signed in) locally.
  Docker is not needed: images are built by GitHub Actions.
- A domain whose DNS is a public hosted zone in Route53 in this account.
- A GitHub token that can read packages, for the instance to pull from GHCR:
  a classic personal access token with only the `read:packages` scope, from a
  user who can see the repository. Fine-grained tokens cannot read GHCR.

## 1. Credentials and session variables

```bash
export AWS_PROFILE=fastehr                     # the project profile; see deploy/README.md
export AWS_REGION=us-west-1                    # where the client's existing servers and databases are
export AWS_DEFAULT_REGION=$AWS_REGION
aws sts get-caller-identity

export FASTEHR_ENV=development
export APP_HOST=dev.fastehr.example.com        # yours; must be inside the hosted zone
export ZONE_DOMAIN=example.com                 # the hosted zone's name
export GITHUB_REPOSITORY=mmartinez-stack/fastehr
export GITHUB_ENVIRONMENT=development

export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
WEB_SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' --output text)
WORK=$(mktemp -d)
echo "$ACCOUNT_ID $VPC_ID $WEB_SUBNET_ID $WORK"
```

The default VPC is fine for one development box: its subnets are public,
which the Elastic IP needs, and RDS uses its default subnet group.

## 2. Secrets into Parameter Store

All `SecureString`. The app's variables sit directly under
`/fastehr/<env>/`, named as `.env.example` names them; `deploy.sh` copies
exactly that level into the container's environment. The RDS master password
and the GHCR token sit one level down so that copy never includes them.

```bash
P=/fastehr/$FASTEHR_ENV
aws ssm put-parameter --type SecureString --name "$P/rds/master-password" --value "$(openssl rand -hex 24)"
aws ssm put-parameter --type SecureString --name "$P/BETTER_AUTH_SECRET"  --value "$(openssl rand -base64 32)"
aws ssm put-parameter --type SecureString --name "$P/BETTER_AUTH_URL"     --value "https://$APP_HOST"
aws ssm put-parameter --type SecureString --name "$P/ghcr/username"       --value "<github user the token belongs to>"
aws ssm put-parameter --type SecureString --name "$P/ghcr/token"          --value "<the read:packages token>"
```

`DATABASE_URL` is added in step 4 once the endpoint exists. Twilio, if and
when the account is handed over (docs/legacy-sms-integration.md): the three
`TWILIO_*` names at the same level as `BETTER_AUTH_URL`, all three or none.

## 3. Security groups

Web: 80 and 443 from anywhere, nothing else. Anywhere is deliberate: the
intake link (ADR 29) is opened on patients' phones. Database: 5432 from the
web group only.

```bash
WEB_SG=$(aws ec2 create-security-group --vpc-id "$VPC_ID" --group-name "fastehr-$FASTEHR_ENV-web" \
  --description 'FastEHR web instance, HTTPS and the ACME redirect' --query GroupId --output text)
for port in 80 443; do
  aws ec2 authorize-security-group-ingress --group-id "$WEB_SG" --ip-permissions \
    "IpProtocol=tcp,FromPort=$port,ToPort=$port,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]"
done

DB_SG=$(aws ec2 create-security-group --vpc-id "$VPC_ID" --group-name "fastehr-$FASTEHR_ENV-db" \
  --description 'FastEHR database, 5432 from the web group only' --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$DB_SG" --protocol tcp --port 5432 --source-group "$WEB_SG"

aws ec2 create-tags --resources "$WEB_SG" "$DB_SG" --tags "Key=fastehr:environment,Value=$FASTEHR_ENV"
```

## 4. RDS PostgreSQL

Major version 17 matches local development and CI. The password comes from
Parameter Store through a command substitution, so it is not in the shell
history. About ten minutes.

```bash
aws rds create-db-instance \
  --db-instance-identifier "fastehr-$FASTEHR_ENV" \
  --engine postgres --engine-version 17 \
  --db-instance-class db.t4g.micro \
  --allocated-storage 20 --max-allocated-storage 100 --storage-type gp3 --storage-encrypted \
  --db-name fastehr --master-username fastehr \
  --master-user-password "$(aws ssm get-parameter --name "$P/rds/master-password" --with-decryption --query Parameter.Value --output text)" \
  --vpc-security-group-ids "$DB_SG" \
  --no-publicly-accessible --no-multi-az \
  --backup-retention-period 7 --copy-tags-to-snapshot --deletion-protection \
  --ca-certificate-identifier rds-ca-rsa2048-g1 \
  --enable-cloudwatch-logs-exports postgresql \
  --tags "Key=fastehr:environment,Value=$FASTEHR_ENV"

aws rds wait db-instance-available --db-instance-identifier "fastehr-$FASTEHR_ENV"
RDS_HOST=$(aws rds describe-db-instances --db-instance-identifier "fastehr-$FASTEHR_ENV" \
  --query 'DBInstances[0].Endpoint.Address' --output text)

aws ssm put-parameter --type SecureString --name "$P/DATABASE_URL" --value \
  "postgresql://fastehr:$(aws ssm get-parameter --name "$P/rds/master-password" --with-decryption --query Parameter.Value --output text)@$RDS_HOST:5432/fastehr?sslmode=verify-full&sslrootcert=/etc/fastehr/rds-ca.pem"
```

`db.t4g.micro` is Graviton although the instance is x86: the database's
architecture is invisible to the app, and it is the cheapest class. RDS
forces TLS; the connection string verifies the certificate against the
regional CA bundle that user-data downloads onto the instance.

## 5. Log group

The web container's stdout is the PHI audit trail until the audit table
exists (`apps/web/src/server/audit-log.ts`), so it is kept six years, the
HIPAA documentation retention period.

```bash
aws logs create-log-group --log-group-name "/fastehr/$FASTEHR_ENV/web" \
  --tags "fastehr:environment=$FASTEHR_ENV"
aws logs put-retention-policy --log-group-name "/fastehr/$FASTEHR_ENV/web" --retention-in-days 2192
```

## 6. Instance role

The instance authenticates to AWS through this role and nothing else; no
credential file ever lands on the box. `AmazonSSMManagedInstanceCore` is what
replaces SSH.

```bash
envsubst '$ACCOUNT_ID $AWS_REGION $FASTEHR_ENV' < deploy/iam/instance-policy.json > "$WORK/instance-policy.json"

aws iam create-role --role-name "fastehr-$FASTEHR_ENV-instance" \
  --assume-role-policy-document file://deploy/iam/instance-trust.json \
  --tags "Key=fastehr:environment,Value=$FASTEHR_ENV"
aws iam attach-role-policy --role-name "fastehr-$FASTEHR_ENV-instance" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name "fastehr-$FASTEHR_ENV-instance" \
  --policy-name runtime --policy-document "file://$WORK/instance-policy.json"

aws iam create-instance-profile --instance-profile-name "fastehr-$FASTEHR_ENV-instance"
aws iam add-role-to-instance-profile --instance-profile-name "fastehr-$FASTEHR_ENV-instance" \
  --role-name "fastehr-$FASTEHR_ENV-instance"
sleep 10    # the profile takes a moment to become usable by run-instances
```

## 7. GitHub deploy role

GitHub Actions assumes this through OIDC: a fifteen-minute token scoped to
one repository and one GitHub Environment. It may only send Run Command to
instances tagged for this environment.

```bash
# One provider per account for this issuer. Skip if it already exists.
aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text \
  | grep -q token.actions.githubusercontent.com \
  || aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
       --client-id-list sts.amazonaws.com

# The token's subject. With GitHub's "immutable subject" setting (the default
# for new repositories) it carries the owner and repository ids, so a renamed
# or re-created repository cannot assume the role. The API gives the exact
# prefix either way.
export GITHUB_SUB_PREFIX=$(gh api "repos/$GITHUB_REPOSITORY/actions/oidc/customization/sub" --jq .sub_claim_prefix)
echo "$GITHUB_SUB_PREFIX"     # repo:<owner>@<id>/<name>@<id>, or repo:<owner>/<name>

envsubst '$ACCOUNT_ID $GITHUB_SUB_PREFIX $GITHUB_ENVIRONMENT' < deploy/iam/github-trust.json > "$WORK/github-trust.json"
envsubst '$ACCOUNT_ID $AWS_REGION $FASTEHR_ENV' < deploy/iam/github-policy.json > "$WORK/github-policy.json"

aws iam create-role --role-name "fastehr-$FASTEHR_ENV-github-deploy" \
  --assume-role-policy-document "file://$WORK/github-trust.json" \
  --tags "Key=fastehr:environment,Value=$FASTEHR_ENV"
aws iam put-role-policy --role-name "fastehr-$FASTEHR_ENV-github-deploy" \
  --policy-name deploy --policy-document "file://$WORK/github-policy.json"

DEPLOY_ROLE_ARN=$(aws iam get-role --role-name "fastehr-$FASTEHR_ENV-github-deploy" --query Role.Arn --output text)
```

## 8. EC2 instance and Elastic IP

Amazon Linux 2023 (SSM Agent and the AWS CLI preinstalled), `t3.small`
(x86_64, matching GitHub's runners), 30 GiB encrypted, IMDSv2 only, **no key
pair**. User-data installs Docker and compose and records what `deploy.sh`
needs; it does not start the app.

```bash
envsubst '$FASTEHR_ENV $AWS_REGION $GITHUB_REPOSITORY $APP_HOST' < deploy/instance/user-data.sh > "$WORK/user-data.sh"
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI" --instance-type t3.small --subnet-id "$WEB_SUBNET_ID" \
  --iam-instance-profile "Name=fastehr-$FASTEHR_ENV-instance" \
  --security-group-ids "$WEB_SG" \
  --user-data "file://$WORK/user-data.sh" \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3","Encrypted":true}}]' \
  --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2 \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=fastehr-$FASTEHR_ENV},{Key=fastehr:environment,Value=$FASTEHR_ENV}]" \
  --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

EIP_ALLOC=$(aws ec2 allocate-address --domain vpc \
  --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=fastehr-$FASTEHR_ENV}]" \
  --query AllocationId --output text)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$EIP_ALLOC"
EIP=$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" --query 'Addresses[0].PublicIp' --output text)
echo "instance $INSTANCE_ID at $EIP"
```

The `fastehr:environment` tag is what the deploy role's permission and the
workflow's instance lookup key on. Wait for SSM before going on; this is the
deploy path and the break-glass path:

```bash
aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --query 'InstanceInformationList[0].PingStatus' --output text     # Online, a minute or two after boot
```

If it never comes online, the subnet is not public or outbound 443 is blocked.

## 9. Route53

```bash
ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$ZONE_DOMAIN" \
  --query 'HostedZones[0].Id' --output text | sed 's#/hostedzone/##')

aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch "{
  \"Changes\": [{ \"Action\": \"UPSERT\", \"ResourceRecordSet\": {
    \"Name\": \"$APP_HOST\", \"Type\": \"A\", \"TTL\": 300, \"ResourceRecords\": [{ \"Value\": \"$EIP\" }] } }] }"

dig +short "$APP_HOST"    # the Elastic IP, within a minute
```

Caddy needs the name to resolve to this box before it can pass the ACME
challenge, so do not trigger the first deploy until `dig` agrees.

## 10. Wire GitHub, then deploy

In the repository settings, an Environment named `development` and these
variables (none are secret):

| variable | scope | value |
| --- | --- | --- |
| `DEPLOY_ENABLED` | repository | `true` |
| `AWS_REGION` | environment | `$AWS_REGION` |
| `AWS_DEPLOY_ROLE_ARN` | environment | `$DEPLOY_ROLE_ARN` |
| `NEXT_PUBLIC_APP_URL` | environment | `https://$APP_HOST` |

`DEPLOY_ENABLED` is repository-scoped because a job-level `if` is evaluated
before the job's environment is resolved.

Then run `Deploy · development` from the Actions tab (`workflow_dispatch`) on
the commit you mean to deploy, or merge a PR into `development`. The workflow
verifies, builds both images, pushes them to GHCR, and runs `deploy.sh` on
the instance. Its log ends with `deployed dev-… to <host>`; the first run also
shows every migration in `packages/db/prisma/migrations/` being applied.

From a browser, `https://$APP_HOST` serves the login page over a valid
certificate within a minute of the first deploy.

**Break it once on purpose:** deploy a commit whose `/_smoke` fails and
confirm the previous tag comes back. A rollback path that has never executed
is not a rollback path.

If the migrator rejects the TLS mode, the fallback is `sslmode=no-verify` in
`DATABASE_URL` (encrypted, unverified) and a note against ADR 34. Do not
attach a parameter group with `rds.force_ssl=0`.

## 11. First admin

Sign-up is disabled by design, so the first account is inserted directly and
issued a temporary password. Reach the database through an SSM port-forward
via the instance; 5432 is not open to anything else.

```bash
# Terminal 1, leave running:
aws ssm start-session --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_HOST,portNumber=5432,localPortNumber=15432"

# Terminal 2 (updatedAt has no database default; supply it):
DB_PASSWORD=$(aws ssm get-parameter --name "$P/rds/master-password" --with-decryption --query Parameter.Value --output text)
psql "postgresql://fastehr:$DB_PASSWORD@localhost:15432/fastehr?sslmode=require" -c \
  "INSERT INTO users (id, name, email, role, \"updatedAt\")
   VALUES (gen_random_uuid(), 'Your Name', 'you@diagnosticpartners.com', 'admin', now());"

# Through the tunnel the host is localhost, so the certificate's name cannot
# be verified; uselibpqcompat makes the Node driver encrypt without verifying,
# which is what psql's sslmode=require above already does.
cd packages/db
DATABASE_URL="postgresql://fastehr:$DB_PASSWORD@localhost:15432/fastehr?uselibpqcompat=true&sslmode=require" \
  pnpm issue-temp-password -- --email you@diagnosticpartners.com
```

The temporary password prints once, to your terminal. `aws ssm start-session`
needs the Session Manager plugin installed locally (AWS documents the
download per platform; on a distribution without a package, extracting the
`.deb` and putting `session-manager-plugin` on `PATH` is enough).

Sign in at `https://$APP_HOST/login`; the app forces `/change-password`
first. Further users come from the Users screen. Staff and patient data
arrive through the migration runbooks (`user-migration.md`,
`docs/legacy-data-mapping.md`) over this same port-forward.

Then prove the API end to end with `scripts/api-smoke.sh`
(`docs/runbooks/test-development-api.md` explains every call).

## Operating it

- **A shell on the box:** `aws ssm start-session --target "$INSTANCE_ID"`,
  then `sudo -i`. `docker compose -f /opt/fastehr/docker-compose.yml ps`.
- **Logs:** CloudWatch Logs, group `/fastehr/development/web`, streams `web`,
  `caddy`, `migrator`. The `[phi-audit]` lines are in `web`.
- **Deploy a specific commit:** the workflow with `workflow_dispatch` and
  the ref. By hand, from an SSM session: `/opt/fastehr/deploy.sh dev-<sha>`
  for any tag already in GHCR.
- **Rotate a secret:** `aws ssm put-parameter --overwrite …`, then redeploy
  the current tag; `deploy.sh` re-reads the level every run. The GHCR token
  is a GitHub setting with an expiry; rotate it the same way.
- **Replace the instance:** terminate it, repeat step 8 with the same
  security group and profile, re-associate the Elastic IP, deploy. The log
  group, database, roles, and DNS record are untouched.

## Cost

| Item | Monthly (us-west-1, on-demand) |
| --- | --- |
| EC2 `t3.small` 24/7 | ~$15 |
| 30 GiB gp3 | ~$2.40 |
| RDS `db.t4g.micro` 24/7 | ~$12 |
| RDS 20 GiB gp3 + backups | ~$2.50 |
| Route53 hosted zone | $0.50 |
| CloudWatch Logs, SSM, Elastic IP (attached) | ~$1.50 |
| **Total** | **≈ $34/month** |

GHCR storage for a private repository counts against the GitHub plan's
package quota; the two images are about 320 MB and 1.5 GB per tag, so delete
old tags from the packages page now and then.

## Teardown

Reverse order. The database refuses to delete while deletion protection is
on and leaves a final snapshot when it goes, since it may hold real records.

```bash
aws ec2 terminate-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
aws ec2 release-address --allocation-id "$EIP_ALLOC"
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch "{
  \"Changes\": [{ \"Action\": \"DELETE\", \"ResourceRecordSet\": {
    \"Name\": \"$APP_HOST\", \"Type\": \"A\", \"TTL\": 300, \"ResourceRecords\": [{ \"Value\": \"$EIP\" }] } }] }"

aws rds modify-db-instance --db-instance-identifier "fastehr-$FASTEHR_ENV" --no-deletion-protection --apply-immediately
aws rds delete-db-instance --db-instance-identifier "fastehr-$FASTEHR_ENV" \
  --final-db-snapshot-identifier "fastehr-$FASTEHR_ENV-final-$(date +%Y%m%d)"

aws iam remove-role-from-instance-profile --instance-profile-name "fastehr-$FASTEHR_ENV-instance" --role-name "fastehr-$FASTEHR_ENV-instance"
aws iam delete-instance-profile --instance-profile-name "fastehr-$FASTEHR_ENV-instance"
aws iam detach-role-policy --role-name "fastehr-$FASTEHR_ENV-instance" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam delete-role-policy --role-name "fastehr-$FASTEHR_ENV-instance" --policy-name runtime
aws iam delete-role --role-name "fastehr-$FASTEHR_ENV-instance"
aws iam delete-role-policy --role-name "fastehr-$FASTEHR_ENV-github-deploy" --policy-name deploy
aws iam delete-role --role-name "fastehr-$FASTEHR_ENV-github-deploy"

aws ec2 delete-security-group --group-id "$DB_SG"
aws ec2 delete-security-group --group-id "$WEB_SG"
aws logs delete-log-group --log-group-name "/fastehr/$FASTEHR_ENV/web"     # only if the audit trail is no longer needed
aws ssm delete-parameters --names "$P/DATABASE_URL" "$P/BETTER_AUTH_SECRET" "$P/BETTER_AUTH_URL" \
  "$P/rds/master-password" "$P/ghcr/username" "$P/ghcr/token"
```
