#!/usr/bin/env bash
# Start the database and the app instance again (the services start on boot).
set -euo pipefail
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"
STACK="${PROJECT:-pitwall}"
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DB=$(out DatabaseId)
aws rds start-db-instance --db-instance-identifier "$DB" --query DBInstance.DBInstanceStatus --output text || true
echo "Waiting for the database..."
aws rds wait db-instance-available --db-instance-identifier "$DB"
aws ec2 start-instances --instance-ids "$(out InstanceId)" --query 'StartingInstances[0].CurrentState.Name' --output text
echo "Up in a minute or two: $(out SiteUrl)"
