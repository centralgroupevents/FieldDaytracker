import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { resolveGoogleCredentials } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

/**
 * Read-only diagnostics: reports which credential/config sources the running
 * deployment can actually see. Never prints secret values — only booleans,
 * lengths, and the (non-secret) service-account email.
 *
 * Protected by CRON_SECRET when set: /api/digest/diag?key=CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let jsonReport: Record<string, unknown> = { present: Boolean(inlineJson) };
  if (inlineJson) {
    try {
      const parsed = JSON.parse(inlineJson) as {
        client_email?: string;
        private_key?: string;
      };
      jsonReport = {
        present: true,
        parses: true,
        hasClientEmail: Boolean(parsed.client_email),
        hasPrivateKey: Boolean(parsed.private_key),
        clientEmail: parsed.client_email ?? null,
        privateKeyLength: parsed.private_key?.length ?? 0,
      };
    } catch (err) {
      jsonReport = {
        present: true,
        parses: false,
        parseError: err instanceof Error ? err.message : String(err),
        // Common paste mistakes: leading/trailing junk or smart quotes.
        firstChar: inlineJson.trim()[0] ?? null,
        length: inlineJson.length,
      };
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let pathReport: Record<string, unknown> = { present: Boolean(credPath) };
  if (credPath) {
    try {
      readFileSync(credPath, "utf8");
      pathReport = { present: true, path: credPath, readable: true };
    } catch {
      pathReport = { present: true, path: credPath, readable: false };
    }
  }

  const creds = resolveGoogleCredentials("diag");

  return NextResponse.json({
    ok: true,
    credentialsResolved: Boolean(creds),
    resolvedEmail: creds?.email ?? null,
    sources: {
      GOOGLE_SERVICE_ACCOUNT_JSON: jsonReport,
      GOOGLE_APPLICATION_CREDENTIALS: pathReport,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: {
        present: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      },
      GOOGLE_PRIVATE_KEY: {
        present: Boolean(process.env.GOOGLE_PRIVATE_KEY),
        length: process.env.GOOGLE_PRIVATE_KEY?.length ?? 0,
      },
    },
    sheet: {
      DIGEST_SHEET_ID: Boolean(process.env.DIGEST_SHEET_ID),
      GOOGLE_SHEET_ID: Boolean(process.env.GOOGLE_SHEET_ID),
      DIGEST_SHEET_GID: process.env.DIGEST_SHEET_GID || "290694620 (default)",
    },
    digest: {
      TEAM_EMAILS: Boolean(process.env.TEAM_EMAILS),
      DIGEST_SECRET: Boolean(process.env.DIGEST_SECRET),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
      APP_BASE_URL: process.env.APP_BASE_URL || null,
    },
  });
}
