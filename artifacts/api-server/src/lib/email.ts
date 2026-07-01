import { Resend } from "resend";
import type { InventoryStatus } from "./types.js";

export async function sendStatusEmail(params: {
  itemName: string;
  status: InventoryStatus;
  delta: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.NOTIFY_EMAIL;

  if (!apiKey || !from || !to) {
    console.warn("[email] Skipping — RESEND_API_KEY / RESEND_FROM_EMAIL / NOTIFY_EMAIL not all set.");
    return { ok: false, skipped: true };
  }

  const resend = new Resend(apiKey);
  const { itemName, status, delta } = params;
  const subject = `Field Day: "${itemName}" is now ${status}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h2>Field Day Inventory Update</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px 0;color:#6b7280">Item</td><td style="font-weight:600">${escapeHtml(itemName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Status</td><td style="font-weight:600">${status}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Delta (still needed)</td><td style="font-weight:600">${delta}</td></tr>
      </table>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("[email] Send threw:", message);
    return { ok: false, error: message };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
