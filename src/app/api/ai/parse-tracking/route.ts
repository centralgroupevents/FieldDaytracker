import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_TO_CARRIER: Record<string, string> = {
  ups: "UPS",
  fedex: "FedEx",
  usps: "USPS",
  "dhl": "DHL",
  "dhl-global-mail": "DHL",
  "amazon": "Amazon",
};

/**
 * Detects the carrier for a tracking number via AfterShip's courier-detect
 * endpoint, so the Add Item form can auto-fill the carrier.
 * Body: { trackingNumber: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { trackingNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackingNumber = body.trackingNumber?.trim();
  if (!trackingNumber) {
    return NextResponse.json(
      { error: "trackingNumber is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.AFTERSHIP_API_KEY;
  if (!apiKey) {
    // No key: still return the number so the user can fill the carrier manually.
    return NextResponse.json({
      tracking_number: trackingNumber,
      carrier: null,
      note: "AFTERSHIP_API_KEY not set — enter the carrier manually.",
    });
  }

  try {
    const r = await fetch("https://api.aftership.com/v4/couriers/detect", {
      method: "POST",
      headers: {
        "aftership-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tracking: { tracking_number: trackingNumber } }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json();
    const first = data?.data?.couriers?.[0];
    const carrier = first
      ? SLUG_TO_CARRIER[first.slug] || first.name || null
      : null;
    return NextResponse.json({ tracking_number: trackingNumber, carrier });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Detect error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
