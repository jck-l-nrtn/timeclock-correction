# Deploying to AWS (serverless, no Docker)

Live stack: **DynamoDB + Lambda (zip) + API Gateway (HTTP API) + CloudFront**,
region `us-east-1`.

```
CloudFront
   ├─ default → S3 (React static site)
   └─ /api/*  → API Gateway (HTTP API) → Lambda → DynamoDB
```

Everything is in `aws/template.yaml` (CloudFormation). Deploy with one command,
using the local AWS CLI — **no Docker needed** (the Lambda is a zip, not a container image).

## Deploy / redeploy
```bash
./aws/deploy.sh
```
It builds, packages the Lambda zip, uploads it, deploys/updates the stack,
publishes the web app to S3, and invalidates CloudFront. Prints the app URL.

## Secrets
- `apps/api/.env` → `JIBBLE_CLIENT_ID`, `JIBBLE_CLIENT_SECRET`.
- `aws/.deploy.env` (gitignored) → `SESSION_SECRET`, `REPORT_TOKEN`, `WEB_ORIGIN`,
  `EMAIL_FROM`, `NOTIFY_EMAIL_TO`, `RESEND_API_KEY`.

To change a secret on the running app, edit those and re-run `./aws/deploy.sh`.

## Current deployment
- URL: `https://d2hlt0wztv8fjv.cloudfront.net` (until a custom domain is attached).
- CloudFormation stack: `montane-timeclock`.

## Custom domain — staff.montanepm.com
After the stack exists:
1. **ACM (us-east-1)** → request a cert for `staff.montanepm.com`, validate via DNS.
2. CloudFront console → the distribution → add `staff.montanepm.com` as an
   **Alternate domain**, pick the cert.
3. DNS: CNAME `staff` → the distribution's `*.cloudfront.net`.

## Notes
- **Jibble key:** admin sign-in calls Jibble, so a **valid** `JIBBLE_CLIENT_ID/SECRET`
  is required for anyone to log in. The timesheet / My Info / PTO balance also need it.
- **Email:** set `RESEND_API_KEY` in `aws/.deploy.env` to enable notifications + the weekly PDF.
- The old container-image path (`Dockerfile.lambda`, `.github/workflows/deploy-aws.yml`)
  is superseded by the zip flow above.
