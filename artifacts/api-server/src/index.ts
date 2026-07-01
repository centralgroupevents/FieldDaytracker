import express from "express";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { geminiJson } from "./lib/gemini.js";
import { detectCarrier } from "./lib/carrier.js";
import { sendStatusEmail } from "./lib/email.js";
import { appendItemToSheet } from "./lib/sheets.js";
import {
  INVENTORY_STATUSES,
  type InventoryItem,
  type InventoryStatus,
} from "./lib/types.js";

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = Number(process.env.PORT) || 8080;

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error("[api-server] Missing required Supabase env vars.");
}

const WS_OPTIONS = { realtime: { transport: ws as any } };
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, WS_OPTIONS);

// ---------------------------------------------------------------------------
// Auth middleware — validates Supabase bearer token
// ---------------------------------------------------------------------------
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, WS_OPTIONS);
  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Side effects on status change
// ---------------------------------------------------------------------------
const EMAIL_TRIGGER_STATUSES: InventoryStatus[] = ["Pending Order", "Delivered"];
const SHEET_TRIGGER_STATUSES: InventoryStatus[] = ["Delivered", "Picked Up"];

async function runStatusSideEffects(
  item: InventoryItem,
  previousStatus: InventoryStatus | null
): Promise<void> {
  if (item.status === previousStatus) return;
  const jobs: Promise<unknown>[] = [];
  if (EMAIL_TRIGGER_STATUSES.includes(item.status)) {
    jobs.push(sendStatusEmail({ itemName: item.item_name, status: item.status, delta: item.delta }));
  }
  if (SHEET_TRIGGER_STATUSES.includes(item.status)) {
    jobs.push(appendItemToSheet(item));
  }
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[side-effect] failed:", r.reason);
  });
}

// ---------------------------------------------------------------------------
// GET /api/inventory
// ---------------------------------------------------------------------------
app.get("/api/inventory", requireAuth, async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

// ---------------------------------------------------------------------------
// POST /api/inventory
// ---------------------------------------------------------------------------
app.post("/api/inventory", requireAuth, async (req, res) => {
  const input = req.body;
  const name = (input.item_name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "item_name is required" });
    return;
  }
  const unit_price = Number(input.unit_price) || 0;
  const target_quantity = Math.max(0, Math.trunc(Number(input.target_quantity) || 0));
  const current_stock = Math.max(0, Math.trunc(Number(input.current_stock) || 0));
  const status: InventoryStatus =
    target_quantity - current_stock > 0 ? "Pending Order" : "Needed";

  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .insert({
      item_name: name,
      image_url: input.image_url || null,
      receipt_url: input.receipt_url || null,
      unit_price,
      target_quantity,
      current_stock,
      carrier: input.carrier || null,
      tracking_number: input.tracking_number || null,
      tracking_url: input.tracking_url || null,
      status,
    })
    .select("*")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const item = data as InventoryItem;
  runStatusSideEffects(item, null).catch(console.error);
  res.status(201).json({ ok: true, item });
});

// ---------------------------------------------------------------------------
// PATCH /api/inventory/:id/stock
// ---------------------------------------------------------------------------
app.patch("/api/inventory/:id/stock", requireAuth, async (req, res) => {
  const { id } = req.params;
  const newStock = Number(req.body.stock ?? req.body.current_stock);

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    res.status(404).json({ error: fetchErr?.message || "Item not found." });
    return;
  }

  const previous = existing as InventoryItem;
  const current_stock = Math.max(0, Math.trunc(newStock));
  const delta = previous.target_quantity - current_stock;

  let status = previous.status;
  if (delta > 0) {
    if (previous.status === "Needed") status = "Pending Order";
  } else if (previous.status === "Pending Order") {
    status = "Needed";
  }

  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .update({ current_stock, status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const item = data as InventoryItem;
  runStatusSideEffects(item, previous.status).catch(console.error);
  res.json({ ok: true, item });
});

// ---------------------------------------------------------------------------
// PATCH /api/inventory/:id/status
// ---------------------------------------------------------------------------
app.patch("/api/inventory/:id/status", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!INVENTORY_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status: ${status}` });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("inventory_items")
    .select("status")
    .eq("id", id)
    .single();
  const previousStatus = (existing?.status as InventoryStatus) ?? null;

  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const item = data as InventoryItem;
  runStatusSideEffects(item, previousStatus).catch(console.error);
  res.json({ ok: true, item });
});

// ---------------------------------------------------------------------------
// DELETE /api/inventory/:id
// ---------------------------------------------------------------------------
app.delete("/api/inventory/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabaseAdmin
    .from("inventory_items")
    .delete()
    .eq("id", id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/ai/parse-receipt
// ---------------------------------------------------------------------------
app.post("/api/ai/parse-receipt", requireAuth, async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }
  try {
    const result = await geminiJson({
      prompt: `You are a receipt OCR assistant. Extract all line items from this receipt image.
Return ONLY valid JSON in this exact shape (no markdown):
{
  "items": [{ "item_name": string, "unit_price": number, "quantity": number }],
  "carrier": string | null,
  "tracking_number": string | null
}
If a field can't be determined, use null. Prices should be numbers (no currency symbols).`,
      image: { base64: imageBase64, mimeType: mimeType || "image/jpeg" },
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI parse failed";
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/parse-link
// ---------------------------------------------------------------------------
app.post("/api/ai/parse-link", requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  try {
    let html = "";
    try {
      const pageRes = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FieldDayBot/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
      html = await pageRes.text();
    } catch {
      res.json({ note: "Could not fetch that URL — enter details manually." });
      return;
    }

    const snippet = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 4000);

    const result = await geminiJson({
      prompt: `Extract the product name and price from this product page text.
Return ONLY valid JSON (no markdown):
{ "item_name": string | null, "unit_price": number | null }

Page text:
${snippet}`,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI parse failed";
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/parse-tracking
// ---------------------------------------------------------------------------
app.post("/api/ai/parse-tracking", requireAuth, async (req, res) => {
  const { trackingNumber } = req.body;
  if (!trackingNumber) {
    res.status(400).json({ error: "trackingNumber is required" });
    return;
  }
  const carrier = detectCarrier(trackingNumber);
  res.json({
    tracking_number: trackingNumber,
    carrier,
    note: carrier ? undefined : "Carrier not recognized — pick it manually.",
  });
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => console.log(`[api-server] listening on port ${PORT}`));
