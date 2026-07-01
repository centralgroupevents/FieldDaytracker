import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectCarrier } from "@/lib/carrier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Detects the carrier for a tracking number from its FORMAT — free, offline,
 * no third-party API. The user can override the carrier in the form.
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

  const carrier = detectCarrier(trackingNumber);
  return NextResponse.json({
    tracking_number: trackingNumber,
    carrier,
    note: carrier
      ? undefined
      : "Couldn't tell the carrier from the number — pick it manually.",
  });
}
