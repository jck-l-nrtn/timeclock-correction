import "dotenv/config";

/** Centralized, validated environment config. Fail fast on missing values. */
function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: Number(optional("PORT", "4000")),
  nodeEnv: optional("NODE_ENV", "development"),
  // In production the API serves the web app from the same origin. Prefer an
  // explicit WEB_ORIGIN, else Render's injected external URL, else local dev.
  webOrigin:
    optional("WEB_ORIGIN") || optional("RENDER_EXTERNAL_URL") || "http://localhost:5173",

  // Jibble API (wired up in Phase 5). Left blank in dev until a key exists.
  jibble: {
    baseIdentityUrl: optional("JIBBLE_IDENTITY_URL", "https://identity.prod.jibble.io"),
    baseWorkspaceUrl: optional("JIBBLE_WORKSPACE_URL", "https://workspace.prod.jibble.io"),
    baseTimeTrackingUrl: optional("JIBBLE_TIME_TRACKING_URL", "https://time-tracking.prod.jibble.io"),
    clientId: optional("JIBBLE_CLIENT_ID"),
    clientSecret: optional("JIBBLE_CLIENT_SECRET"),
    // Fallback timezone used to compute a Jibble entry's UTC time + offset when a
    // person's own timezone can't be resolved. Montane Packaging is in Utah.
    orgTimeZone: optional("JIBBLE_ORG_TIMEZONE", "America/Denver"),
    // Bulk PTO accrual: the hourly PTO policy to amend, and the per-hour rate.
    ptoAccrualPolicyId: optional("PTO_ACCRUAL_POLICY_ID", "da42e824-aec4-458a-a19d-18d35408427a"),
    ptoAccrualRate: Number(optional("PTO_ACCRUAL_RATE", "0.0385")),
    // When true, reads stay live but WRITES are simulated (no create/delete in
    // Jibble). Lets you demo the full flow without touching production data.
    dryRun: optional("JIBBLE_DRY_RUN", "") === "true",
  },

  // Notifications. If set, admin-facing events POST to this webhook (Slack/Teams).
  notify: {
    webhookUrl: optional("NOTIFY_WEBHOOK_URL"),
  },

  // Email. EMAIL_PROVIDER picks the transport:
  //   "ses"  (default) — AWS SES via the Lambda's IAM role; just set EMAIL_FROM
  //                      to a verified SES sender. No SMTP credentials needed.
  //   "smtp" — plain SMTP (set SMTP_*), or Gmail OAuth2 (set GMAIL_*/GOOGLE_*).
  email: {
    provider: optional("EMAIL_PROVIDER", "ses"),
    smtpHost: optional("SMTP_HOST"),
    smtpPort: Number(optional("SMTP_PORT", "587")),
    smtpUser: optional("SMTP_USER"),
    smtpPass: optional("SMTP_PASS"),
    from: optional("EMAIL_FROM"),
    // Where new-request alerts and the weekly report are sent (the admin/owner).
    notifyTo: optional("NOTIFY_EMAIL_TO"),
    gmail: {
      user: optional("GMAIL_USER"),
      clientId: optional("GOOGLE_CLIENT_ID"),
      clientSecret: optional("GOOGLE_CLIENT_SECRET"),
      refreshToken: optional("GOOGLE_REFRESH_TOKEN"),
    },
  },

  // Weekly pay-period report. `token` gates the send endpoint that the scheduler hits.
  reports: {
    token: optional("REPORT_TOKEN"),
  },

  orgName: optional("ORG_NAME", "Montane Packaging"),

  // DynamoDB (single table). DYNAMO_ENDPOINT is set only for local testing (dynalite).
  aws: {
    region: optional("AWS_REGION", "us-east-1"),
    tableName: optional("TABLE_NAME", "Timeclock"),
    dynamoEndpoint: optional("DYNAMO_ENDPOINT"),
  },

  // Auth. Google SSO is the only normal login; the master admin is break-glass.
  auth: {
    devLoginEnabled: optional("DEV_LOGIN_ENABLED", "true") === "true",
    sessionSecret: optional("SESSION_SECRET", "dev-insecure-secret-change-me"),
    // Break-glass master admin (non-SSO). Always granted admin + full visibility.
    masterAdminEmail: optional("MASTER_ADMIN_EMAIL").trim().toLowerCase(),
    masterAdminPassword: optional("MASTER_ADMIN_PASSWORD"),
  },

  // Google OAuth (Sign in with Google). Create a Web client in Google Cloud and
  // set the id/secret; redirect base is the public origin that serves the app.
  google: {
    clientId: optional("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: optional("GOOGLE_OAUTH_CLIENT_SECRET"),
    // e.g. https://staff.montanepm.com — the callback is <base>/api/auth/google/callback
    redirectBase: optional("OAUTH_REDIRECT_BASE") || optional("WEB_ORIGIN") || "http://localhost:4000",
  },
} as const;

export const isProd = config.nodeEnv === "production";
