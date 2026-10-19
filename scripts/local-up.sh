#!/usr/bin/env bash
# Local stand-ins for the AWS services so the whole app runs on a laptop:
#   PostgreSQL in place of RDS, and the Moto server in place of S3, SQS and SNS.
set -euo pipefail

start() { # name, docker run args...
  local name=$1; shift
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    docker start "$name" >/dev/null
  else
    docker run -d --name "$name" "$@" >/dev/null
  fi
  echo "started $name"
}

start pitwall-db -p 5433:5432 -e POSTGRES_USER=pitwall -e POSTGRES_PASSWORD=pitwall -e POSTGRES_DB=pitwall postgres:16-alpine
start pitwall-aws -p 5000:5000 motoserver/moto:5.0.24

for _ in $(seq 30); do curl -sf http://localhost:5000/moto-api/ >/dev/null && break; sleep 1; done
export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_DEFAULT_REGION=us-east-1
aws="aws --endpoint-url http://localhost:5000"
$aws s3 mb s3://pitwall >/dev/null 2>&1 || true
$aws sqs create-queue --queue-name pitwall-jobs --attributes VisibilityTimeout=600 >/dev/null
$aws sns create-topic --name pitwall-notifications >/dev/null
echo "Local services ready. Copy backend/.env.example to backend/.env if you haven't."
