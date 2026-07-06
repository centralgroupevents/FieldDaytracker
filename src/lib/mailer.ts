import nodemailer from "nodemailer";

/**
 * Sends one email via Gmail (SMTP + App Password).
 *
 * No-ops (with a warning) if GMAIL_USER / GMAIL_APP_PASSWORD are not set — so
 * the app never crashes when email isn't configured yet, mirroring the
 * behaviour of src/lib/email.ts and src/lib/sheets.ts.
 *
 * SWAPPING PROVIDERS: this is the only place that talks to Gmail. To move to
 * Resend (once you have a verified domain), replace the body of this function
 * and leave every caller unchanged.
 */
export async function sendMail(params: {
  to: string;
  subject: string;
  /** Plain text typed by the operator. Newlines become <br> in the HTML part. */
  body: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const from = process.env.GMAIL_FROM || user;

  if (!user || !pass) {
    console.warn(
      "[mailer] Skipping send — GMAIL_USER / GMAIL_APP_PASSWORD not set."
    );
    return { ok: false, skipped: true };
  }

  const { to, subject, body } = params;
  if (!to.trim()) return { ok: false, error: "No recipient email." };

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  const html = `<div style="font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${textToHtml(
    body
  )}</div>`;

  try {
    await transporter.sendMail({ from, to, subject, text: body, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown mail error";
    console.error("[mailer] Send failed:", message);
    return { ok: false, error: message };
  }
}

function textToHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}
