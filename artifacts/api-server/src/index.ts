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
  _req: express.Request,
  _res: express.Response,
  next: express.NextFunction
): Promise<void> {
  // App is fully open (no login). Auth enforcement intentionally removed;
  // supabaseAnonKey is still referenced in the env-var check above.
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
      notes: input.notes || null,
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
// PATCH /api/inventory/:id/target  (needed / target quantity)
// ---------------------------------------------------------------------------
app.patch("/api/inventory/:id/target", requireAuth, async (req, res) => {
  const { id } = req.params;
  const newTarget = Number(req.body.target ?? req.body.target_quantity);

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
  const target_quantity = Math.max(0, Math.trunc(newTarget));
  const delta = target_quantity - previous.current_stock;

  // Same auto-status rule as stock: needing units flips Needed -> Pending Order.
  let status = previous.status;
  if (delta > 0) {
    if (previous.status === "Needed") status = "Pending Order";
  } else if (previous.status === "Pending Order") {
    status = "Needed";
  }

  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .update({ target_quantity, status })
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
// PATCH /api/inventory/:id/notes
// ---------------------------------------------------------------------------
app.patch("/api/inventory/:id/notes", requireAuth, async (req, res) => {
  const { id } = req.params;
  const notes = (req.body.notes ?? "").toString();
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .update({ notes: notes || null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, item: data });
});

// ---------------------------------------------------------------------------
// Expenses (non-inventory event costs)
// ---------------------------------------------------------------------------
app.get("/api/expenses", requireAuth, async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("expenses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

app.post("/api/expenses", requireAuth, async (req, res) => {
  const b = req.body;
  const description = (b.description ?? "").trim();
  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }
  const { data, error } = await supabaseAdmin
    .from("expenses")
    .insert({
      description,
      amount: Number(b.amount) || 0,
      category: b.category || "Other",
      paid: Boolean(b.paid),
      notes: b.notes || null,
    })
    .select("*")
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json({ ok: true, expense: data });
});

app.patch("/api/expenses/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const patch: Record<string, unknown> = {};
  if (b.description !== undefined) patch.description = String(b.description);
  if (b.amount !== undefined) patch.amount = Number(b.amount) || 0;
  if (b.category !== undefined) patch.category = String(b.category);
  if (b.paid !== undefined) patch.paid = Boolean(b.paid);
  if (b.notes !== undefined) patch.notes = b.notes || null;
  const { data, error } = await supabaseAdmin
    .from("expenses")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, expense: data });
});

app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabaseAdmin.from("expenses").delete().eq("id", id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => console.log(`[api-server] listening on port ${PORT}`));
