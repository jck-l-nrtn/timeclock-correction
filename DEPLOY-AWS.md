# Deploying to AWS (serverless: Lambda + DynamoDB + CloudFront)

Fully serverless, region **us-east-1**. Architecture:

```
CloudFront (staff.montanepm.com)
   ├─ default        → S3 (React static site)
   └─ /api/*         → Lambda (container image) → DynamoDB
```

Everything is provisioned by CloudFormation (`aws/template.yaml`) and deployed by
a GitHub Actions workflow (`.github/workflows/deploy-aws.yml`) that builds the
Lambda image, pushes it to ECR, deploys the stack, and publishes the web app.

## 1. AWS credentials for CI
Create an IAM user with permissions to deploy (CloudFormation, Lambda, ECR,
DynamoDB, S3, CloudFront, IAM). Generate an access key.

## 2. GitHub repo secrets
Settings → Secrets and variables → Actions → add:

| Secret | Value |
| --- | --- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | the IAM user's key |
| `JIBBLE_CLIENT_ID` | `c3d8419d-2cfd-4438-8ee5-2121425feaa8` |
| `JIBBLE_CLIENT_SECRET` | your Jibble secret |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `RESEND_API_KEY` | your Resend `re_…` key |
| `EMAIL_FROM` | `onboarding@resend.dev` (or a verified sender) |
| `NOTIFY_EMAIL_TO` | where alerts + the weekly report go |
| `REPORT_TOKEN` | `openssl rand -hex 24` |
| `WEB_ORIGIN` | `https://staff.montanepm.com` |

## 3. Deploy
GitHub → **Actions → Deploy to AWS → Run workflow** (or push to `main`). It
builds + pushes the image, deploys the stack, and publishes the site. First run
takes ~10 min (CloudFront). The workflow prints the **CloudFront URL** at the end.

Open that URL — you should see the Montane Packaging sign-in. Sign in at `/admin`
with a Jibble Admin email + kiosk PIN, then create employee accounts.

## 4. Custom domain — staff.montanepm.com
Easiest to add after CloudFront exists:
1. **ACM (us-east-1)** → request a public cert for `staff.montanepm.com`, validate
   it by adding the CNAME it shows to your DNS.
2. CloudFront console → the distribution → **Settings → Edit** → add
   `staff.montanepm.com` as an **Alternate domain**, pick the ACM cert.
3. In DNS, add a **CNAME** `staff` → the distribution's `d111....cloudfront.net`.

`WEB_ORIGIN` is already set to `https://staff.montanepm.com`.

## 5. Weekly report scheduler
`.github/workflows/weekly-report.yml` runs Mondays. Add repo secrets:
- `APP_URL` = `https://staff.montanepm.com`
- `REPORT_TOKEN` = same value as the deploy `REPORT_TOKEN`

## Notes
- **Cost:** Lambda + DynamoDB on-demand + CloudFront/S3 are effectively **$0/mo**
  at this volume (within free limits). No idle cost.
- **Data model:** single DynamoDB table `Timeclock` with 4 GSIs (see
  `apps/api/src/db/data.ts`). Magic-link tokens auto-expire via TTL.
- **Local tests:** `tsx apps/api/scripts/dynamo-test.ts` and `http-test.ts` run
  the data layer / full app against in-process dynalite (no AWS needed).
