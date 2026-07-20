import { google } from "googleapis";
import type { InventoryItem } from "./types";
import { resolveGoogleCredentials, sheetsAuth } from "./google-auth";

/**
 * Appends one row to the master Google Sheet for an item that reached a
 * terminal state ('Delivered' or 'Picked Up').
 *
 * Setup:
 *   1. Create a Google Cloud service account, enable the Sheets API.
 *   2. Share the target spreadsheet with the service-account email (Editor).
 *   3. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID,
 *      and GOOGLE_SHEET_RANGE.
 *
 * No-ops (with a warning) if credentials are missing.
 */
export async function appendItemToSheet(
  item: InventoryItem
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE || "Master!A:H";
  const creds = resolveGoogleCredentials("sheets");

  if (!creds || !spreadsheetId) {
    console.warn(
      "[sheets] Skipping append — Google service-account creds / GOOGLE_SHEET_ID not all set."
    );
    return { ok: false, skipped: true };
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: sheetsAuth(creds) });

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
