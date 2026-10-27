#!/usr/bin/env bash
# Queue ingestion of every finished qualifying + race session of a season.
# Runs on the EC2 instance through SSM, using its IAM role (no keys on your laptop needed beyond the CLI).
#
#   ./scripts/seed.sh 2024             # Q and R of every 2024 round
#   ./scripts/seed.sh 2025 Q,R,S,SQ    # include sprint sessions
#   ./scripts/seed.sh 2025 standings   # only refresh championship standings for the year's stored races
set -euo pipefail
export AWS_REGION="${AWS_REGION:-ap-south-1}" AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"
STACK="${PROJECT:-pitwall}"
YEAR="${1:?usage: seed.sh YEAR [CODES]}"
CODES="${2:-Q,R}"
wait_for_command() { # command-id instance-id: poll until Run Command finishes
  local status
  for _ in $(seq 120); do
    status=$(aws ssm get-command-invocation --command-id "$1" --instance-id "$2" --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Pending|InProgress|Delayed) sleep 10 ;; *) return 0 ;; esac
  done
}
INSTANCE=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)

if [ "$CODES" = standings ]; then ARGS="--standings"; else ARGS="--codes $CODES"; fi
CMD="cd /opt/pitwall/current && set -a && . /etc/pitwall.env && set +a && sudo -E -u pitwall /opt/pitwall/venv/bin/python -m pitwall.seed --year $YEAR $ARGS"
ID=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters "commands=[\"$CMD\"]" --query Command.CommandId --output text)
wait_for_command "$ID" "$INSTANCE"
aws ssm get-command-invocation --command-id "$ID" --instance-id "$INSTANCE" --query '[Status,StandardOutputContent,StandardErrorContent]' --output text | tail -5
echo "The worker is now ingesting from the queue; watch it in the CloudWatch dashboard or log group /$STACK/worker."
