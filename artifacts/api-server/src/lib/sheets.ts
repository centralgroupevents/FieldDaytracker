import { google } from "googleapis";
import type { InventoryItem } from "./types.js";

export async function appendItemToSheet(
  item: InventoryItem
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE || "Master!A:H";

  if (!email || !rawKey || !spreadsheetId) {
    console.warn("[sheets] Skipping — Google service-account env vars not all set.");
    return { ok: false, skipped: true };
  }

  const privateKey = rawKey.replace(/\\n/g, "\n");

  try {
    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const row = [
      new Date().toISOString(),
      item.item_name,
      item.status,
      item.unit_price,
      item.current_stock,
      item.target_quantity,
      item.delta,
      item.total_cost,
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sheets error";
    console.error("[sheets] Append failed:", message);
    return { ok: false, error: message };
  }
}
