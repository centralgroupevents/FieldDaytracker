import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendStatusEmail } from "@/lib/email";
import { appendItemToSheet } from "@/lib/sheets";
import type { InventoryItem, InventoryStatus } from "@/lib/types";

// AfterShip posts JSON; we need the raw body to verify the HMAC signature, so
// disable any body parsing/caching.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Maps an AfterShip "tag" to one of our inventory statuses.
 * Tags we don't care about return null and are acknowledged without a change.
 * See https://www.aftership.com/docs/tracking/others/checkpoint-tags
 */
function mapTagToStatus(tag: string | undefined): InventoryStatus | null {
  switch (tag) {
    case "InTransit":
    case "OutForDelivery":
    case "AvailableForPickup":
      return "Shipped";
    case "Delivered":
      return "Delivered";
    default:
      return null;
  }
}

/**
 * Verifies the AfterShip HMAC-SHA256 signature.
 * AfterShip signs the raw request body with your webhook secret and sends the
 * base64 digest in the `aftership-hmac-sha256` header.
 */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.AFTERSHIP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[aftership] AFTERSHIP_WEBHOOK_SECRET not set — rejecting webhook."
    );
    return false;
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("aftership-hmac-sha256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const msg = payload?.msg ?? {};
  const trackingNumber: string | undefined = msg.tracking_number;
  const tag: string | undefined = msg.tag;

  if (!trackingNumber) {
    return NextResponse.json(
      { error: "Missing tracking_number" },
      { status: 400 }
    );
  }

  const newStatus = mapTagToStatus(tag);
  if (!newStatus) {
    // Acknowledge but take no action for tags we don't track.
    return NextResponse.json({ ok: true, ignored: tag ?? "unknown" });
  }

  const supabase = createAdminClient();

  // Find the matching item.
  const { data: existing, error: fetchErr } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("tracking_number", trackingNumber)
    .maybeSingle();

  if (fetchErr) {
    console.error("[aftership] lookup error:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    // 200 so AfterShip doesn't keep retrying for a tracking # we don't have.
    return NextResponse.json({ ok: true, matched: false });
  }

  const previous = existing as InventoryItem;
  if (previous.status === newStatus) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .update({ status: newStatus, carrier: previous.carrier ?? msg.slug ?? null })
    .eq("id", previous.id)
    .select("*")
    .single();

  if (error) {
    console.error("[aftership] update error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const item = data as InventoryItem;

  // Side effects: email on Delivered; spreadsheet append on Delivered.
  const jobs: Promise<unknown>[] = [];
  if (item.status === "Delivered") {
    jobs.push(
      sendStatusEmail({
        itemName: item.item_name,
        status: item.status,
        delta: item.delta,
      })
    );
    jobs.push(appendItemToSheet(item));
  }
  await Promise.allSettled(jobs);

  return NextResponse.json({ ok: true, status: item.status });
}

// Optional: respond to GET for a quick health check / webhook URL validation.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "aftership-webhook" });
}
