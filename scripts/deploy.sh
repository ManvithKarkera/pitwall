#!/usr/bin/env bash
# Create/update the whole PitWall stack and ship the code.
#
#   ALERT_EMAIL=you@example.com ./scripts/deploy.sh
#
# Optional: AWS_REGION (default ap-south-1), PROJECT (default pitwall),
#           BUDGET_USD (default 5), SKIP_INFRA=1 to only redeploy code.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AWS_REGION="${AWS_REGION:-ap-south-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"
PROJECT="${PROJECT:-pitwall}"
STACK="$PROJECT"
BUILD="$ROOT/.build"

wait_for_command() { # command-id instance-id: poll until Run Command finishes
  local status
  for _ in $(seq 120); do
    status=$(aws ssm get-command-invocation --command-id "$1" --instance-id "$2" --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Pending|InProgress|Delayed) sleep 10 ;; *) return 0 ;; esac
  done
}
step() { printf '\n\033[1;31m▌\033[0m %s\n' "$*"; }
output() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

step "Checking AWS credentials"
aws sts get-caller-identity --query Arn --output text

if [ "${SKIP_INFRA:-0}" != 1 ]; then
  : "${ALERT_EMAIL:?Set ALERT_EMAIL to the address that should receive alarm and budget emails}"

  step "Ensuring secrets exist in Parameter Store (SecureString)"
  ensure_secret() {
    if ! aws ssm get-parameter --name "$1" >/dev/null 2>&1; then
      aws ssm put-parameter --name "$1" --type SecureString --value "$(openssl rand -base64 33 | tr -dc 'A-Za-z0-9' | head -c 32)" >/dev/null
      echo "created $1"
    else
      echo "exists  $1"
    fi
  }
  ensure_secret "/$PROJECT/db/password"
  ensure_secret "/$PROJECT/jwt_secret"

  PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists \
    --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
    --query 'PrefixLists[0].PrefixListId' --output text)
  PG_VERSION=$(aws rds describe-db-engine-versions --engine postgres --default-only \
    --query 'DBEngineVersions[0].EngineVersion' --output text)
  case "$PG_VERSION" in 17.*|18.*) ;; *) PG_VERSION=17.11 ;; esac

  step "Deploying CloudFormation stack '$STACK' in $AWS_REGION (RDS + CloudFront take ~10-15 min the first time)"
  aws cloudformation deploy \
    --stack-name "$STACK" \
    --template-file "$ROOT/infra/pitwall.yaml" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --tags Project="$PROJECT" \
    --parameter-overrides \
      ProjectName="$PROJECT" AlertEmail="$ALERT_EMAIL" \
      CloudFrontPrefixListId="$PREFIX_LIST" DBEngineVersion="$PG_VERSION" \
      MonthlyBudgetUSD="${BUDGET_USD:-5}"
fi

BUCKET=$(output BucketName)
INSTANCE=$(output InstanceId)
DISTRIBUTION=$(output DistributionId)
SITE=$(output SiteUrl)
FUNCTION=$(output SchedulerFunctionName)

step "Uploading scheduler Lambda code"
rm -rf "$BUILD" && mkdir -p "$BUILD"
cp "$ROOT/lambda/session_scheduler.py" "$BUILD/index.py"
(cd "$BUILD" && zip -q scheduler.zip index.py)
aws lambda update-function-code --function-name "$FUNCTION" --zip-file "fileb://$BUILD/scheduler.zip" --query LastModified --output text

step "Packaging backend release to s3://$BUCKET/releases/backend.tgz"
tar -czf "$BUILD/backend.tgz" -C "$ROOT/backend" --exclude='__pycache__' pitwall requirements.txt
aws s3 cp "$BUILD/backend.tgz" "s3://$BUCKET/releases/backend.tgz" --only-show-errors

step "Waiting for the instance to register with Systems Manager"
for _ in $(seq 60); do
  STATUS=$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$INSTANCE" \
    --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)
  [ "$STATUS" = Online ] && break
  sleep 10
done
[ "$STATUS" = Online ] || { echo "Instance $INSTANCE never came online in SSM"; exit 1; }

step "Installing the release on $INSTANCE (SSM Run Command, no SSH)"
COMMAND=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --comment "pitwall deploy" --timeout-seconds 900 \
  --parameters 'commands=["cloud-init status --wait >/dev/null","/opt/pitwall/deploy.sh"]' \
  --query Command.CommandId --output text)
wait_for_command "$COMMAND" "$INSTANCE"
aws ssm get-command-invocation --command-id "$COMMAND" --instance-id "$INSTANCE" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text | tail -20

step "Building and uploading the frontend"
(cd "$ROOT/frontend" && npm ci --no-audit --no-fund --silent && npm run build --silent)
aws s3 sync "$ROOT/frontend/dist" "s3://$BUCKET/frontend" --delete --only-show-errors \
  --exclude index.html --cache-control "public,max-age=31536000,immutable"
aws s3 cp "$ROOT/frontend/dist/index.html" "s3://$BUCKET/frontend/index.html" --only-show-errors \
  --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/index.html" --query Invalidation.Id --output text

step "Done"
echo "Site:      $SITE"
echo "Health:    $SITE/api/health"
echo "Dashboard: $(output DashboardUrl)"
echo
echo "Load race data with:  ./scripts/seed.sh 2024"
echo "Confirm the SNS subscription email sent to ${ALERT_EMAIL:-your alert address} to receive alarms."
