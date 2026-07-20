import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import {
  addDays,
  buildDigests,
  getBaseUrl,
  renderDigestHtml,
  todayInTeamTz,
} from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends the daily task digest to every teammate in TEAM_EMAILS.
 * Triggered daily by the GitHub Action in .github/workflows/daily-digest.yml.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` or `?key=CRON_SECRET`
 * when the CRON_SECRET env var is set.
 *
 * Testing helpers:
 *   ?dry=1        render instead of send — returns the first digest's HTML
 *   ?to=Anthony   only send/render that teammate's digest
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    const key = req.nextUrl.searchParams.get("key");
    if (header !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const today = todayInTeamTz();
  const start = addDays(today, -2);
  const end = addDays(today, 7);

  const { digests, error } = await buildDigests(start, end);
  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  const only = req.nextUrl.searchParams.get("to")?.toLowerCase();
  const selected = only
    ? digests.filter((d) => d.name.toLowerCase() === only)
    : digests;

  if (selected.length === 0) {
    return NextResponse.json({
      ok: false,
      error:
        "No digests to send. Check TEAM_EMAILS matches the schedule's name columns.",
    });
  }

  const base = getBaseUrl();

  if (req.nextUrl.searchParams.get("dry")) {
    return new NextResponse(renderDigestHtml(selected[0], today, base), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json(
      { ok: false, error: "RESEND_API_KEY / RESEND_FROM_EMAIL not set." },
      { status: 500 }
    );
  }
  const resend = new Resend(apiKey);

  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const results: Record<string, string> = {};
  for (const digest of selected) {
    const taskCount = digest.days.reduce((n, d) => n + d.tasks.length, 0);
    const { error: sendErr } = await resend.emails.send({
      from,
      to: digest.email,
      subject: `\u{1F4DD} ${digest.name}, ${taskCount} task${taskCount === 1 ? "" : "s"} on your plate — ${dateLabel}`,
      html: renderDigestHtml(digest, today, base),
    });
    results[digest.name] = sendErr ? `error: ${sendErr.message}` : "sent";
  }

  return NextResponse.json({ ok: true, results });
}
