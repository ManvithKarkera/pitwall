#!/usr/bin/env bash
# Stop the EC2 instance and the RDS database when you're not demoing, to save Free Tier hours.
# Note: AWS restarts a stopped RDS instance automatically after 7 days.
set -euo pipefail
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"
STACK="${PROJECT:-pitwall}"
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
aws ec2 stop-instances --instance-ids "$(out InstanceId)" --query 'StoppingInstances[0].CurrentState.Name' --output text
aws rds stop-db-instance --db-instance-identifier "$(out DatabaseId)" --query DBInstance.DBInstanceStatus --output text
