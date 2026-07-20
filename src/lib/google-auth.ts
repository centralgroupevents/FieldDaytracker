import { readFileSync } from "node:fs";
import { google } from "googleapis";

export interface GoogleCreds {
  email: string;
  privateKey: string;
}

/** Turns literal "\n" sequences into real newlines (no-op if already real). */
function normalizeKey(key: string): string {
  return key.replace(/\\n/g, "\n");
}

/**
 * Resolves Google service-account credentials from whichever of these is set,
 * in order of convenience:
 *
 *   1. GOOGLE_SERVICE_ACCOUNT_JSON     — the entire key JSON pasted inline
 *                                        (easiest on Replit: open the .json,
 *                                        copy everything, paste as one Secret)
 *   2. GOOGLE_APPLICATION_CREDENTIALS  — filesystem path to the key JSON
 *   3. GOOGLE_SERVICE_ACCOUNT_EMAIL
 *      + GOOGLE_PRIVATE_KEY            — the two fields separately
 *
 * Returns null (with a warning) if none yield usable credentials.
 */
export function resolveGoogleCredentials(logTag = "google"): GoogleCreds | null {
  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (inlineJson || path) {
    try {
      const raw = inlineJson ?? readFileSync(path as string, "utf8");
      const parsed = JSON.parse(raw) as {
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          email: parsed.client_email,
          privateKey: normalizeKey(parsed.private_key),
        };
      }
      console.warn(
        `[${logTag}] Credentials JSON is missing client_email or private_key.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${logTag}] Could not read/parse credentials JSON: ${msg}`);
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) {
    return { email, privateKey: normalizeKey(key) };
  }

  return null;
}

/** Builds a Sheets-scoped JWT auth client from resolved credentials. */
export function sheetsAuth(creds: GoogleCreds): InstanceType<
  typeof google.auth.JWT
> {
  return new google.auth.JWT({
    email: creds.email,
    key: creds.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}
