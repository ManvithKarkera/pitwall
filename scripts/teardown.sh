#!/usr/bin/env bash
# Delete EVERYTHING PitWall created: stack, bucket contents, database, secrets.
set -euo pipefail
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"
PROJECT="${PROJECT:-pitwall}"
read -r -p "This permanently deletes the '$PROJECT' stack, its database and all stored reports. Type the project name to confirm: " answer
[ "$answer" = "$PROJECT" ] || { echo "Aborted."; exit 1; }
BUCKET=$(aws cloudformation describe-stacks --stack-name "$PROJECT" --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
aws s3 rm "s3://$BUCKET" --recursive --only-show-errors
aws cloudformation delete-stack --stack-name "$PROJECT"
echo "Deleting stack (CloudFront takes a while)..."
aws cloudformation wait stack-delete-complete --stack-name "$PROJECT"
aws ssm delete-parameters --names "/$PROJECT/db/password" "/$PROJECT/jwt_secret" >/dev/null
echo "All PitWall resources deleted."
