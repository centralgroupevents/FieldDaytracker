import { NextRequest, NextResponse } from "next/server";
import {
  escapeHtml,
  recordStatus,
  verifyStatus,
  type StatusPayload,
} from "@/lib/digest";

export const dynamic = "force-dynamic";

/**
 * Landing endpoint for the Done / In Progress buttons in the digest email.
 * Verifies the HMAC signature, appends a row to the "Task Status" tab of the
 * schedule spreadsheet, and shows a small confirmation page.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const status = q.get("s");
  const payload: StatusPayload = {
    person: q.get("p") ?? "",
    day: q.get("d") ?? "",
    status: status === "done" ? "done" : "progress",
    label: q.get("l") ?? "",
  };
  const sig = q.get("sig") ?? "";

  if (
    !payload.person ||
    !payload.day ||
    (status !== "done" && status !== "progress") ||
    !verifyStatus(payload, sig)
  ) {
    return new NextResponse("Invalid or expired link.", { status: 400 });
  }

  const saved = await recordStatus(payload);
  const statusLabel = payload.status === "done" ? "Done" : "In Progress";
  const color = payload.status === "done" ? "#059669" : "#a16207";
  const emoji = payload.status === "done" ? "✅" : "⏳";

  const body = saved
    ? `<h1 style="margin:0 0 10px;font-size:40px;">${emoji}</h1>
       <h2 style="margin:0 0 8px;font-family:Georgia,serif;color:#1f2937;">Got it, ${escapeHtml(payload.person)}!</h2>
       <p style="margin:0;color:#4b5563;">
         <strong>${escapeHtml(payload.label || payload.day)}</strong> marked as
         <strong style="color:${color};">${statusLabel}</strong>.
         It&rsquo;s logged in the team spreadsheet &mdash; you can close this tab.
       </p>`
    : `<h1 style="margin:0 0 10px;font-size:40px;">⚠️</h1>
       <h2 style="margin:0 0 8px;font-family:Georgia,serif;color:#1f2937;">Couldn&rsquo;t save that</h2>
       <p style="margin:0;color:#4b5563;">
         The spreadsheet didn&rsquo;t accept the update. Try the button again in
         a minute, or ping the team.
       </p>`;

  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Field Day Daily</title></head>
     <body style="margin:0;background:#f9fafb;font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;">
       <div style="max-width:420px;margin:15vh auto 0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center;">
         ${body}
       </div>
     </body></html>`,
    { status: saved ? 200 : 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
