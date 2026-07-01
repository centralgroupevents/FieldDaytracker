import { NextRequest, NextResponse } from "next/server";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Best-effort product name + price from a product URL.
 * Amazon frequently blocks server fetches — when that happens we return nulls
 * with a note so the UI can ask the user to type it manually.
 * Body: { url: string }
 */
export async function POST(req: NextRequest) {

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "A valid http(s) URL is required" },
      { status: 400 }
    );
  }

  let html = "";
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html",
      },
      // Don't hang the request forever on a slow/blocking store.
      signal: AbortSignal.timeout(12000),
    });
    html = await r.text();
  } catch {
    html = "";
  }

  if (!html) {
    return NextResponse.json({
      item_name: null,
      unit_price: null,
      note: "Could not read this page (the store may block automated access). Please enter it manually.",
    });
  }

  const snippet = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .slice(0, 20000);

  const prompt = `From this e-commerce product page, extract the main product's name and price. Return ONLY JSON: {"item_name":string|null,"unit_price":number|null}. unit_price is a number in US dollars (no "$"). If you cannot confidently find them, use null. PAGE HTML:\n${snippet}`;

  try {
    const result = await geminiJson({ prompt });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
