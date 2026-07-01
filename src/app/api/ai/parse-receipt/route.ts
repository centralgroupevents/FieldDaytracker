import { NextRequest, NextResponse } from "next/server";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reads a receipt / order-confirmation photo with Gemini vision and returns
 * structured line items for the Add Item form to pre-fill.
 * Body: { imageBase64: string, mimeType: string }
 */
export async function POST(req: NextRequest) {

  let body: { imageBase64?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { imageBase64, mimeType } = body;
  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { error: "imageBase64 and mimeType are required" },
      { status: 400 }
    );
  }

  const prompt = `You are an inventory data extractor. Read this receipt or order-confirmation image and extract the purchased products. Return ONLY JSON of this exact shape:
{"items":[{"item_name":string,"unit_price":number,"quantity":number}],"carrier":string|null,"tracking_number":string|null}
Rules: unit_price is the per-unit price in US dollars as a number (no "$" symbol). quantity is an integer (default 1 if unclear). Ignore tax, shipping, subtotal, and total lines — only real products. Use null for carrier/tracking_number when not present.`;

  try {
    const result = await geminiJson({
      prompt,
      image: { base64: imageBase64, mimeType },
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
