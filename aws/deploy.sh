#!/usr/bin/env bash
# One-command deploy to AWS (serverless: DynamoDB + Lambda zip + API Gateway +
# CloudFront). No Docker needed. Requires AWS CLI configured for the target account.
#
#   ./aws/deploy.sh
#
# Secrets: Jibble id/secret come from apps/api/.env; the rest from aws/.deploy.env
# (gitignored — SESSION_SECRET, REPORT_TOKEN, NOTIFY_EMAIL_TO, WEB_ORIGIN,
# EMAIL_FROM). Email uses AWS SES via the Lambda's IAM role (no SMTP creds).
# Missing SESSION_SECRET/REPORT_TOKEN are generated.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${AWS_REGION:-us-east-1}"
STACK=montane-timeclock
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
CODEBUCKET="montane-timeclock-deploy-${ACCOUNT}"

set -a
. apps/api/.env
[ -f aws/.deploy.env ] && . aws/.deploy.env
set +a
: "${SESSION_SECRET:=$(openssl rand -hex 32)}"
: "${REPORT_TOKEN:=$(openssl rand -hex 24)}"
: "${WEB_ORIGIN:=https://staff.montanepm.com}"
: "${NOTIFY_EMAIL_TO:=admin@montanepm.com}"
: "${EMAIL_FROM:=timeclock@montanepm.com}"
: "${ACM_CERT_ARN:=}"
: "${CUSTOM_DOMAIN:=staff.montanepm.com}"

echo "==> Build"
npm run build:shared >/dev/null
npm run build --workspace @timesheet/api >/dev/null
npm run build --workspace @timesheet/web >/dev/null

echo "==> Package Lambda zip"
STAGE=$(mktemp -d)
cp -R node_modules "$STAGE/node_modules"
rm -rf "$STAGE"/node_modules/{typescript,vite,@vitejs,esbuild,@esbuild,rollup,@rollup,tsx,dynalite,.cache,.bin} || true
rm -rf "$STAGE/node_modules/@timesheet/shared"
mkdir -p "$STAGE/node_modules/@timesheet/shared" "$STAGE/apps/api"
cp -R packages/shared/dist packages/shared/package.json "$STAGE/node_modules/@timesheet/shared/"
cp -R apps/api/dist "$STAGE/apps/api/dist"
cp apps/api/package.json "$STAGE/apps/api/package.json"
( cd "$STAGE" && zip -qry function.zip apps node_modules )

KEY="lambda/$(date +%s).zip"
aws s3api head-bucket --bucket "$CODEBUCKET" 2>/dev/null || aws s3 mb "s3://$CODEBUCKET"
aws s3 cp "$STAGE/function.zip" "s3://$CODEBUCKET/$KEY" --only-show-errors

echo "==> Deploy stack"
aws cloudformation deploy --region "$REGION" --stack-name "$STACK" \
  --template-file aws/template.yaml --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides CodeS3Bucket="$CODEBUCKET" CodeS3Key="$KEY" WebOrigin="$WEB_ORIGIN" \
    JibbleClientId="$JIBBLE_CLIENT_ID" JibbleClientSecret="$JIBBLE_CLIENT_SECRET" \
    SessionSecret="$SESSION_SECRET" EmailFrom="$EMAIL_FROM" \
    NotifyEmailTo="$NOTIFY_EMAIL_TO" ReportToken="$REPORT_TOKEN" \
    AcmCertArn="$ACM_CERT_ARN" CustomDomain="$CUSTOM_DOMAIN"

echo "==> Publish web"
WEBBUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='WebBucketName'].OutputValue" --output text)
DIST=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
URL=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" --output text)
aws s3 sync apps/web/dist "s3://$WEBBUCKET" --delete --only-show-errors
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
rm -rf "$STAGE"
echo "==> Done. App: $URL"
