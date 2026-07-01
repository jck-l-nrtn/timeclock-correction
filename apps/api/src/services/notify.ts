import { config } from "../config.js";
import type { CorrectionRequestDTO } from "@timesheet/shared";

/**
 * Notification boundary. Admin-facing events (new request, decision) can post to
 * a webhook (Slack/Teams/any JSON endpoint) when NOTIFY_WEBHOOK_URL is set;
 * otherwise they log to the console. Magic links NEVER go to a webhook — they
 * contain a login token — so they always log (swap for real email later).
 */
export interface Notifier {
  newRequestSubmitted(request: CorrectionRequestDTO): Promise<void>;
  requestDecided(request: CorrectionRequestDTO): Promise<void>;
  sendMagicLink(email: string, link: string): Promise<void>;
  /** Deliver new-account login details to the employee (email/SMS). */
  sendCredentials(email: string, details: { loginUrl: string; tempPassword: string }): Promise<void>;
}

class ConsoleNotifier implements Notifier {
  async newRequestSubmitted(r: CorrectionRequestDTO): Promise<void> {
    console.log(
      `[notify] New correction request ${r.id} from ${r.employeeName} <${r.employeeEmail}> — ` +
        `${r.eventType} on ${r.date} @ ${r.intendedTime}`
    );
  }

  async requestDecided(r: CorrectionRequestDTO): Promise<void> {
    console.log(`[notify] Request ${r.id} for ${r.employeeEmail} is now "${r.status}"`);
  }

  async sendMagicLink(email: string, link: string): Promise<void> {
    console.log(`[notify] Magic link for ${email}: ${link}`);
  }

  async sendCredentials(email: string, details: { loginUrl: string; tempPassword: string }): Promise<void> {
    // PLACEHOLDER: real delivery is email/SMS to the individual. Credentials must
    // NEVER go to a shared webhook, so this is console-only (inherited by the
    // webhook notifier, which does not override it).
    console.log(
      `[notify] Account for ${email} — sign in at ${details.loginUrl} with your email and ` +
        `password "${details.tempPassword}" (your Jibble kiosk PIN).`
    );
  }
}

class WebhookNotifier extends ConsoleNotifier {
  constructor(private readonly url: string) {
    super();
  }

  private async post(text: string): Promise<void> {
    try {
      await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `text` is the common field for Slack/Teams/Discord incoming webhooks.
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      console.error("[notify] webhook POST failed:", err);
    }
  }

  async newRequestSubmitted(r: CorrectionRequestDTO): Promise<void> {
    await super.newRequestSubmitted(r);
    await this.post(
      `🕒 New timeclock correction from *${r.employeeName}* — ${r.eventType} on ${r.date} at ${r.intendedTime}. Reason: ${r.reason}`
    );
  }

  async requestDecided(r: CorrectionRequestDTO): Promise<void> {
    await super.requestDecided(r);
    await this.post(`✅ Correction ${r.id} for ${r.employeeEmail} is now *${r.status}*.`);
  }
  // sendMagicLink intentionally inherited (console only) — never webhooked.
}

export const notifier: Notifier = config.notify.webhookUrl
  ? new WebhookNotifier(config.notify.webhookUrl)
  : new ConsoleNotifier();
