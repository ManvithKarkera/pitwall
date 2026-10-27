# PitWall demo script

About 10 minutes. The demo runs in two parts: first the website, so she sees what it does, then the AWS console, following one request through every service in the order it touches them. Read the **Say** lines in your own words; the **Click** lines are what to have on screen.

Region for everything: **Asia Pacific (Mumbai) ap-south-1**. Site: https://d1ydawpo9bsoc7.cloudfront.net

---

## Before she arrives (10 minutes earlier)

- [ ] If you stopped the stack, run `./scripts/start.sh` (RDS takes about 5 minutes to come back). Check https://d1ydawpo9bsoc7.cloudfront.net/api/health shows `{"status":"ok"}`.
- [ ] Sign in to the AWS console, switch the region to **Mumbai**, and open these tabs in this order:
  1. CloudFormation → stack `pitwall`
  2. CloudFront → the distribution
  3. S3 → bucket `pitwall-350475136791-ap-south-1`
  4. VPC → `vpc-0c291cd1452645c61` → **Resource map**
  5. EC2 → instance `i-0b907ec08eaf15a22`
  6. RDS → `pitwall-db`
  7. SQS → `pitwall-jobs`
  8. SNS → Topics
  9. Lambda → `pitwall-session-scheduler`
  10. IAM → Roles → `pitwall-ec2-role`
  11. Systems Manager → Parameter Store
  12. CloudWatch → Dashboards → `pitwall`
  13. Billing → Budgets
- [ ] Open the site in another tab and sign in.
- [ ] Have one "your report is ready" email open in your inbox as a backup in case a new one is slow.
- [ ] Choose a comparison nobody has run yet (for example a 2026 race, two drivers you haven't compared), so it really goes through the queue instead of coming from the cache.

---

## Part 1 — The website (2–3 minutes)

**Click:** the home page.
**Say:** "PitWall analyses real Formula 1 timing data. This is the home page: an isometric drawing of the car."
**Click:** hover the car, then the rear wing.
**Say:** "Hovering shows what's inside a car, and the rear wing opens its DRS flap. Below are the three things the site does."

**Click:** Driver standings, then Constructors.
**Say:** "These are the official championship tables after every race, for 2024 to 2026. They're stored in my database. A background worker fetched them through a job queue, which I'll show in the console."

**Click:** Compare → a race → Race → pick the two drivers you prepared → Compare.
**Say:** "Now I'll ask for a lap comparison. This is too heavy to do inside a web request: it downloads thousands of telemetry samples, aligns two laps and renders charts and a PDF. So the website only puts a job on a queue and returns straight away. A worker picks it up, and I get an email when it's done."
**Click:** show the status changing from queued to done, then the charts, the track map and the PDF.

> If it's still processing, keep going with Part 2 and come back to it at SQS or SNS. It usually takes 10–30 seconds.

---

## Part 2 — The AWS console (6–7 minutes)

### 1. CloudFormation: the whole system is code
**Click:** stack `pitwall` → **Resources** tab.
**Say:** "Everything I'm about to show was created by one CloudFormation template, `infra/pitwall.yaml`. That's about 55 resources: network, server, database, queue, functions, alarms and budget. I can delete it all with one command and rebuild it the same way. That's Infrastructure as Code."

### 2. CloudFront: the front door
**Click:** the distribution → **Behaviors** tab.
**Say:** "Every visitor arrives at CloudFront, which gives the site HTTPS and caches it close to the user. It has three routes: the website itself and the reports come from S3, and `/api/*` goes to my EC2 server."

### 3. S3: storage
**Click:** the bucket → show the folders `frontend/`, `reports/`, `telemetry/`, `releases/` → **Permissions**: Block Public Access is all on.
**Say:** "S3 holds the built website, every generated report (the charts and PDF you just saw), a cache of lap telemetry so I never download the same lap twice, and my code releases. The bucket is private. Only CloudFront can read it, through Origin Access Control."

### 4. VPC: the network (she asked where it is)
**Click:** the VPC → **Resource map**.
**Say:** "This is my own network, `10.20.0.0/16`. It has three subnets:
- one **public** subnet, `10.20.1.0/24`, for the server, with a route to the internet gateway
- two **private** subnets, `10.20.11.0/24` and `10.20.12.0/24`, in two availability zones, for the database. They have no route to the internet at all.

There's also a free S3 gateway endpoint, so the server reaches S3 without going over the internet."

**Click:** Security groups → the app security group → **Inbound rules**, then the database security group → **Inbound rules**.
**Say:** "These are the two firewalls. The server accepts port 80 only from CloudFront's address list, so nobody can reach it directly. The database accepts port 5432 only from the server's security group. There's no SSH port open anywhere."

### 5. EC2: the compute
**Click:** the instance → **Details**: IAM role `pitwall-ec2-role`, key pair: none.
**Say:** "One t3.micro runs two services: the FastAPI backend that answers the website, and the worker that processes the queue. The worker is long-running and needs about 300 MB to draw charts and PDFs, so it belongs on a server rather than in Lambda. Notice there's no key pair: I connect with Session Manager instead of SSH."
**Click (optional, if time):** Connect → Session Manager → run `systemctl status pitwall-api pitwall-worker`.

### 6. RDS: the database
**Click:** `pitwall-db` → **Connectivity & security**: not publicly accessible, the private subnet group. **Configuration**: PostgreSQL, encrypted.
**Say:** "PostgreSQL on RDS holds the relational data: users, races, sessions, results, about 94,000 laps, the championship standings and every comparison job with its status. It's encrypted, backed up automatically, and only reachable from inside the VPC."

### 7. SQS: the job queue
**Click:** `pitwall-jobs` → **Monitoring** (messages sent and received), then the queue's **Dead-letter queue** setting showing `pitwall-jobs-dlq`.
**Say:** "This queue sits between the website and the worker. The comparison I just started went through here. So did the standings: I queued one job per race and the worker fetched each table. If a job fails, SQS retries it up to 3 times. After that it moves to the dead-letter queue, which sets off an alarm, so a broken job never disappears silently."

### 8. SNS: notifications
**Click:** Topics → `pitwall-user-notifications` → Subscriptions → open one → **Subscription filter policy**.
**Say:** "When a report is ready, the worker publishes to SNS and the user gets an email. Each user's subscription has a filter on their user ID, so you only get emails about your own reports. The second topic, `pitwall-ops-alerts`, sends alarm emails to me."
**Click:** show the "report is ready" email.

### 9. Lambda + EventBridge: automation
**Click:** `pitwall-session-scheduler` → the EventBridge trigger (every Monday 06:00 UTC) → **Monitor** → recent logs.
**Say:** "Every Monday, EventBridge runs this Lambda function. It asks the OpenF1 API which sessions finished in the last 8 days and puts one job per session on the queue, so new race weekends load themselves, and the standings update after each race. The function only has permission to send to the queue. It has no network access to the database and no passwords."

### 10. IAM: least privilege
**Click:** `pitwall-ec2-role` → the policy JSON.
**Say:** "The server's role only allows this one bucket, this one queue, this one topic and parameters under `/pitwall/`. There are no access keys anywhere in the code or on the server: it gets temporary credentials from this role."

### 11. Parameter Store: configuration and secrets
**Click:** Parameter Store, filtered by `/pitwall/`.
**Say:** "The database password and the login-token secret are SecureStrings, encrypted with KMS. The bucket name, queue URL and database host are plain parameters. The app reads them all at startup through its role, so no secret is written in the code."

### 12. CloudWatch: monitoring
**Click:** Dashboard `pitwall`, then **Log groups** `/pitwall/api` and `/pitwall/worker`, then **Alarms**.
**Say:** "Both services send their logs here. The dashboard shows the queue, the server, the database and the number of comparisons completed. There are 5 alarms:
- a job waiting more than 10 minutes
- a job in the dead-letter queue
- errors in the worker
- server CPU above 80%
- errors in the Lambda function

Any of them emails me through SNS."

### 13. Budgets: cost control
**Click:** Budget `pitwall-monthly`.
**Say:** "A $5 monthly budget emails me at 80% of real spend and 100% of forecast spend. To keep costs low there's no NAT gateway and no load balancer, and the database is single-AZ. I stop the server and database between demos with one script, and I'll delete everything after grading."

---

## Close (30 seconds)

**Say:** "So one comparison touched CloudFront, S3, EC2 in my VPC, RDS, SQS, SNS and CloudWatch. Lambda and EventBridge keep the data up to date on their own. IAM and Parameter Store keep it secure, Budgets keeps the cost down, and CloudFormation builds the whole thing."

Services shown, by area:

| Required area | Service |
|---|---|
| Compute | EC2 (+ Lambda for the weekly job) |
| Networking | VPC, subnets, route tables, internet gateway, S3 endpoint, security groups, CloudFront |
| Database | RDS PostgreSQL |
| Storage | S3 |
| Security / IAM | IAM roles, security groups, Parameter Store SecureStrings, Origin Access Control |
| Monitoring | CloudWatch logs, metrics, dashboard, alarms |
| Extra | SQS + dead-letter queue, SNS, EventBridge, CloudFormation, Budgets |

---

## Questions she might ask

**Why EC2 and not Lambda for the main app?**
The worker runs for 10–30 seconds per comparison, needs about 300 MB, and renders images and PDFs with numpy, matplotlib and reportlab. A small always-on server is simpler and cheaper for that. Lambda is used where it fits best: a short scheduled task.

**Why is the server in a public subnet?**
To avoid a NAT gateway, which costs about $33 a month. It's still protected: the security group only accepts traffic from CloudFront, there's no SSH, and the database stays in private subnets with no internet route.

**What happens if the worker crashes in the middle of a job?**
The message isn't deleted from SQS, so it becomes visible again and is retried. After 3 failed attempts it moves to the dead-letter queue and the `pitwall-jobs-dead-lettered` alarm emails me. The comparison is marked failed so the user isn't left waiting.

**How does the server get its passwords?**
From Parameter Store at startup, using its IAM role. The password is a SecureString encrypted with KMS, and nothing secret is in the code or the repository.

**What if two people ask for the same comparison?**
The API builds a cache key from the session, drivers and laps. If the result already exists in S3 it comes back instantly. If the comparison is already running, the second request joins that job instead of starting another. Both users get the email.

**How did you deploy it?**
`scripts/deploy.sh` creates the secrets, deploys the CloudFormation stack, uploads the Lambda code, sends the backend to EC2 through SSM Run Command, and uploads the site to S3 with a CloudFront invalidation. Re-running it with `SKIP_INFRA=1` only updates the code.

**How much does it cost?**
About $1 a day while it's running, and roughly $31 a month if it ran 24/7. It's paid from credits, with a $5 budget alarm. See `docs/cost.md`.

**Where does the data come from?**
OpenF1, a free public API of Formula 1 timing. Laps and results are stored in RDS. Telemetry is downloaded only when someone compares a lap, then cached in S3.

---

## If something goes wrong

- **The comparison is slow:** carry on with the console and come back to it. Show the job in the SQS monitoring graph meanwhile.
- **No email arrives:** show the backup email. Mention that SNS email can take a minute.
- **The site is down:** check you started the stack, then show `/api/health`. If RDS is still starting, use that moment to explain the private subnets.
- **She asks to see a failure:** stop the worker with `sudo systemctl stop pitwall-worker` in Session Manager and run a comparison. The `pitwall-queue-stuck` alarm fires after about 10 minutes. Remember to start the worker again afterwards.
