# Approximate cost

Region **ap-south-1 (Mumbai)**, on-demand prices in USD, rounded. Check the AWS Pricing Calculator for current figures.

| Service | Configuration | If it runs 24/7 for a month | Free Tier / credits |
|---|---|---|---|
| EC2 | 1 × t3.micro | ~$8.20 | 750 h/month free (12-month Free Tier) |
| EBS | 16 GB gp3 | ~$1.50 | 30 GB free |
| Public IPv4 | 1 Elastic IP | ~$3.65 | 750 h/month free (12-month Free Tier) |
| RDS PostgreSQL | db.t3.micro, Single-AZ, 20 GB gp2 | ~$15 + ~$2.60 storage | 750 h + 20 GB free |
| S3 | a few hundred MB | < $0.05 | 5 GB free |
| CloudFront | low traffic | $0 | 1 TB + 10M requests/month always free |
| SQS | a few thousand messages | $0 | 1M requests/month always free |
| SNS | emails + publishes | $0 | 1,000 emails + 1M publishes always free |
| Lambda + EventBridge | 4–5 runs/month | $0 | always free tier |
| SSM Parameter Store | 10 standard parameters | $0 | standard parameters are free |
| CloudWatch | 2 log groups, 6 custom metrics, 5 alarms, 1 dashboard | ~$0 | 5 GB logs, 10 metrics, 10 alarms, 3 dashboards free |
| AWS Budgets | 1 budget | $0 | first 2 budgets free |
| **Total** | | **≈ $31/month without Free Tier** | **≈ $0 within Free Tier** |

How the cost stays low:
- **No NAT Gateway.** That would cost about $33/month. EC2 sits in a public subnet behind a security group that accepts traffic from CloudFront only, and RDS stays private.
- **Single-AZ RDS** instead of Multi-AZ, which would double the price.
- **One small instance** runs both the API and the worker. There's no load balancer (about $18/month) because CloudFront fronts EC2 directly.
- The **S3 gateway endpoint** is free and avoids data-processing charges.
- **Caching:** repeated comparisons are served from S3 with no compute, and telemetry is cached per lap.
- **Lifecycle rules** expire cached telemetry after 180 days.
- `scripts/stop.sh` stops EC2 and RDS between demos. Stopped, the only ongoing charges are EBS (~$1.50), RDS storage (~$2.60) and the idle Elastic IP (~$3.65).
- `scripts/teardown.sh` deletes everything after grading.
- A **$5 AWS Budget** emails at 80% of actual spend and 100% of forecast spend.

New accounts created after 15 July 2025 get the newer **Free plan**: credits (up to $200) for 6 months instead of 12 months of free hours. The running cost above is then taken from those credits. A month of 24/7 running costs about $31, and much less if the stack is stopped between demos.
