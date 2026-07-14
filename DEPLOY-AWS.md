# Deploying to AWS (App Runner + Aurora Serverless v2)

All-AWS, region **us-east-1**. App Runner builds the app from GitHub and runs it;
Aurora Serverless v2 (Postgres, scale-to-zero) is the database. Template:
`aws/cloudformation.yaml`.

## Prerequisites
- AWS CLI configured (`aws configure`) with admin-ish permissions.
- The repo pushed to GitHub (done).

## 1. Create the App Runner → GitHub connection (one time)
App Runner needs OAuth access to the repo, which can't be scripted:
1. AWS Console → **App Runner → GitHub connections → Create connection**.
2. Authorize GitHub, pick the `timeclock-correction` repo, create it.
3. Copy the connection **ARN** (looks like `arn:aws:apprunner:us-east-1:<acct>:connection/...`).

## 2. Deploy the stack
```bash
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name montane-timeclock \
  --template-file aws/cloudformation.yaml \
  --parameter-overrides \
    GitHubConnectionArn="arn:aws:apprunner:us-east-1:...:connection/..." \
    DBMasterPassword="<a-strong-url-safe-password>" \
    JibbleClientId="c3d8419d-2cfd-4438-8ee5-2121425feaa8" \
    JibbleClientSecret="<your-jibble-secret>" \
    SessionSecret="$(openssl rand -hex 32)" \
    ResendApiKey="re_...<your-resend-key>" \
    EmailFrom="onboarding@resend.dev" \
    NotifyEmailTo="<your-email>" \
    ReportToken="$(openssl rand -hex 24)"
```
Takes ~10–15 min (Aurora + first App Runner build). When done:
```bash
aws cloudformation describe-stacks --region us-east-1 \
  --stack-name montane-timeclock \
  --query "Stacks[0].Outputs" --output table
```
Open the **AppUrl** — you should see the Montane Packaging sign-in.

## 3. Custom domain — staff.montanepm.com
CloudFormation can't associate an App Runner custom domain, so do it after:
1. App Runner console → your service → **Custom domains → Link domain** →
   `staff.montanepm.com`.
2. It shows a set of **CNAME records** (validation + the target). Add them in
   your DNS (Route 53 or wherever montanepm.com lives).
3. Wait for it to go **Active** (a few minutes to an hour). `WEB_ORIGIN` is
   already set to `https://staff.montanepm.com`.

## 4. Weekly report scheduler
GitHub → repo **Settings → Secrets and variables → Actions**:
- `APP_URL` = `https://staff.montanepm.com` (or the App Runner URL)
- `REPORT_TOKEN` = the same value you passed as the `ReportToken` parameter

The workflow (`.github/workflows/weekly-report.yml`) then runs Mondays. Test it
now via **Actions → Weekly pay-period report → Run workflow**.

## Notes
- **Scale-to-zero:** Aurora pauses when idle (min 0 ACU) — the first request
  after a quiet spell waits ~15s while it wakes. Keeps cost near zero when unused.
- **Database exposure:** Aurora is reachable over the internet but only with SSL
  + the master password (same model as Neon/Supabase). To make it fully private
  instead, we'd add an App Runner VPC connector + NAT Gateway (~$32/mo more).
- **Updates:** `AutoDeploymentsEnabled` is on — pushing to `main` triggers a new
  App Runner build automatically.
- **Runtime:** App Runner managed Node 18. The app is compatible.
