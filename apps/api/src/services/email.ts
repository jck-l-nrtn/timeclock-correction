import nodemailer from "nodemailer";
import { config } from "../config.js";

/**
 * Email over SMTP. Provider-agnostic: point SMTP_* at Gmail, Amazon SES, Resend,
 * Mailgun, etc. If SMTP isn't configured, calls become console logs so the app
 * still runs (and dev doesn't need a mail server).
 */
const g = config.email.gmail;
const gmailReady = Boolean(g.user && g.clientId && g.clientSecret && g.refreshToken);
const smtpReady = Boolean(config.email.smtpHost && config.email.smtpUser);

// Effective "from": explicit EMAIL_FROM, else the Gmail account.
const fromAddress = config.email.from || (gmailReady ? g.user : "");

const transport = gmailReady
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: g.user,
        clientId: g.clientId,
        clientSecret: g.clientSecret,
        refreshToken: g.refreshToken,
      },
    })
  : smtpReady
    ? nodemailer.createTransport({
        host: config.email.smtpHost,
        port: config.email.smtpPort,
        secure: config.email.smtpPort === 465, // 465 = implicit TLS; 587 = STARTTLS
        auth: { user: config.email.smtpUser, pass: config.email.smtpPass },
      })
    : null;

export const emailConfigured = Boolean(transport && fromAddress);

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail(opts: {
  to?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const to = opts.to || config.email.notifyTo;
  if (!transport || !fromAddress || !to) {
    console.log(
      `[email] not configured — would send "${opts.subject}" to ${to || "(no recipient set)"}`
    );
    return;
  }
  await transport.sendMail({
    from: fromAddress,
    to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  });
  console.log(`[email] sent "${opts.subject}" to ${to}`);
}
