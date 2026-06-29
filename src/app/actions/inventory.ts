"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendStatusEmail } from "@/lib/email";
import { appendItemToSheet } from "@/lib/sheets";
import {
  INVENTORY_STATUSES,
  type InventoryItem,
  type InventoryStatus,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  item?: InventoryItem;
}

// Statuses that trigger an email alert.
const EMAIL_TRIGGER_STATUSES: InventoryStatus[] = ["Pending Order", "Delivered"];
// Statuses that trigger a master-spreadsheet append.
const SHEET_TRIGGER_STATUSES: InventoryStatus[] = ["Delivered", "Picked Up"];

/**
 * Fires email + spreadsheet side effects for a status change.
 * Only runs when the status actually changed, so we never double-send.
 */
async function runStatusSideEffects(
  item: InventoryItem,
  previousStatus: InventoryStatus | null
): Promise<void> {
  if (item.status === previousStatus) return;

  const jobs: Promise<unknown>[] = [];

  if (EMAIL_TRIGGER_STATUSES.includes(item.status)) {
    jobs.push(
      sendStatusEmail({
        itemName: item.item_name,
        status: item.status,
        delta: item.delta,
      })
    );
  }

  if (SHEET_TRIGGER_STATUSES.includes(item.status)) {
    jobs.push(appendItemToSheet(item));
  }

  // Run side effects in parallel and never let one failure abort the action.
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => {
    if (r.status === "rejected") {
      console.error("[side-effect] failed:", r.reason);
    }
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createItem(input: {
  item_name: string;
  image_url?: string | null;
  unit_price: number;
  target_quantity: number;
  current_stock: number;
  carrier?: string | null;
  tracking_number?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const name = input.item_name?.trim();
  if (!name) return { ok: false, error: "Item name is required." };

  const unit_price = Number(input.unit_price) || 0;
  const target_quantity = Math.max(0, Math.trunc(Number(input.target_quantity) || 0));
  const current_stock = Math.max(0, Math.trunc(Number(input.current_stock) || 0));

  // Status auto-update rule: if we still need units, mark it Pending Order.
  const status: InventoryStatus =
    target_quantity - current_stock > 0 ? "Pending Order" : "Needed";

  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      item_name: name,
      image_url: input.image_url || null,
      unit_price,
      target_quantity,
      current_stock,
      carrier: input.carrier || null,
      tracking_number: input.tracking_number || null,
      status,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[createItem]", error.message);
    return { ok: false, error: error.message };
  }

  const item = data as InventoryItem;
  await runStatusSideEffects(item, null);

  revalidatePath("/");
  revalidatePath("/inventory");
  return { ok: true, item };
}

// ---------------------------------------------------------------------------
// Update stock (Quick Edit) — applies the status auto-update rule
// ---------------------------------------------------------------------------
export async function updateStock(
  id: string,
  newStock: number
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return { ok: false, error: fetchErr?.message || "Item not found." };
  }

  const previous = existing as InventoryItem;
  const current_stock = Math.max(0, Math.trunc(Number(newStock) || 0));
  const delta = previous.target_quantity - current_stock;

  // Auto-update rule: delta > 0 => Pending Order.
  // If the order is now fully satisfied and it was still Pending, drop back to
  // Needed unless it has already progressed (Shipped/Delivered/Picked Up).
  let status = previous.status;
  if (delta > 0) {
    if (previous.status === "Needed") status = "Pending Order";
  } else if (previous.status === "Pending Order") {
    status = "Needed";
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .update({ current_stock, status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[updateStock]", error.message);
    return { ok: false, error: error.message };
  }

  const item = data as InventoryItem;
  await runStatusSideEffects(item, previous.status);

  revalidatePath("/");
  revalidatePath("/inventory");
  return { ok: true, item };
}

// ---------------------------------------------------------------------------
// Manually set status (e.g. mark Picked Up) — fires side effects
// ---------------------------------------------------------------------------
export async function setStatus(
  id: string,
  status: InventoryStatus
): Promise<ActionResult> {
  if (!INVENTORY_STATUSES.includes(status)) {
    return { ok: false, error: `Invalid status: ${status}` };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("inventory_items")
    .select("status")
    .eq("id", id)
    .single();
  const previousStatus = (existing?.status as InventoryStatus) ?? null;

  const { data, error } = await supabase
    .from("inventory_items")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[setStatus]", error.message);
    return { ok: false, error: error.message };
  }

  const item = data as InventoryItem;
  await runStatusSideEffects(item, previousStatus);

  revalidatePath("/");
  revalidatePath("/inventory");
  return { ok: true, item };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export async function deleteItem(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);

  if (error) {
    console.error("[deleteItem]", error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  return { ok: true };
}
