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
    // When true, reads stay live but WRITES are simulated (no create/delete in
    // Jibble). Lets you demo the full flow without touching production data.
    dryRun: optional("JIBBLE_DRY_RUN", "") === "true",
  },

  // Notifications. If set, admin-facing events POST to this webhook (Slack/Teams).
  notify: {
    webhookUrl: optional("NOTIFY_WEBHOOK_URL"),
  },

  // Email. Two ways to send:
  //   1. Gmail via OAuth2 — set GMAIL_USER + GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN.
  //   2. Plain SMTP (SES, Resend, Mailgun, Gmail app password, etc.) — set SMTP_*.
  email: {
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

  // Admin auth (Phase 4). Dev fallback lets the skeleton run without Jibble SSO.
  auth: {
    devLoginEnabled: optional("DEV_LOGIN_ENABLED", "true") === "true",
    sessionSecret: optional("SESSION_SECRET", "dev-insecure-secret-change-me"),
  },
} as const;

export const isProd = config.nodeEnv === "production";
