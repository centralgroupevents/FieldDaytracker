/**
 * Minimal Gemini REST helper (no SDK — version-stable).
 * Returns parsed JSON from the model. Server-only (uses GEMINI_API_KEY).
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function geminiJson(opts: {
  prompt: string;
  image?: { base64: string; mimeType: string };
}): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");

  const parts: any[] = [{ text: opts.prompt }];
  if (opts.image) {
    parts.push({
      inline_data: { mime_type: opts.image.mimeType, data: opts.image.base64 },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
