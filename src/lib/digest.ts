import { google, type sheets_v4 } from "googleapis";
import crypto from "node:crypto";
import { resolveGoogleCredentials, sheetsAuth } from "./google-auth";

/**
 * Daily task digest, News-Scout style.
 *
 * Reads the "Team Daily Schedule" tab of the planning spreadsheet (columns:
 * Date | Wk | Milestone(s) | <one column per teammate>), collects each
 * teammate's tasks for a window of days, and renders a newsletter-style HTML
 * email with Done / In Progress buttons that post back to /api/digest/status.
 *
 * Env:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY  (already used by sheets.ts)
 *   DIGEST_SHEET_ID     spreadsheet ID (defaults to GOOGLE_SHEET_ID)
 *   DIGEST_SHEET_GID    numeric gid of the schedule tab (default 290694620)
 *   TEAM_EMAILS         JSON map of teammate name -> email,
 *                       e.g. {"Anthony":"ant@x.com","Ab":"ab@x.com"}
 *   DIGEST_SECRET       HMAC secret for the status-button links
 *   APP_BASE_URL        public URL of this app (falls back to VERCEL_URL)
 */

const TIME_ZONE = "America/New_York";
const STATUS_TAB = "Task Status";

export interface DayTasks {
  /** Midnight (UTC) of the calendar day. */
  date: Date;
  /** e.g. "Mon Jul 20" */
  dateLabel: string;
  milestone: string | null;
  tasks: string[];
}

export interface TeammateDigest {
  name: string;
  email: string;
  days: DayTasks[];
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export function getTeamEmails(): Record<string, string> {
  const raw = process.env.TEAM_EMAILS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed;
  } catch {
    console.error("[digest] TEAM_EMAILS is not valid JSON.");
    return {};
  }
}

export function getBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function getSheetsClient(): sheets_v4.Sheets | null {
  const creds = resolveGoogleCredentials("digest");
  if (!creds) return null;
  return google.sheets({ version: "v4", auth: sheetsAuth(creds) });
}

function getSpreadsheetId(): string | undefined {
  return process.env.DIGEST_SHEET_ID || process.env.GOOGLE_SHEET_ID;
}

// ---------------------------------------------------------------------------
// Dates (all at calendar-day granularity, in America/New_York)
// ---------------------------------------------------------------------------

/** Today's calendar date in the team's time zone, as a UTC-midnight Date. */
export function todayInTeamTz(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses schedule-cell dates: "Tue Jun 30", "Mon Jul 13", "6/9/2026",
 * "06/14/26". Dates without a year get the year that lands them closest to
 * `reference`.
 */
export function parseScheduleDate(raw: string, reference: Date): Date | null {
  const s = raw.trim();
  if (!s) return null;

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, Number(slash[1]) - 1, Number(slash[2])));
  }

  const words = s.match(/([A-Za-z]{3,})\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
  if (words) {
    const month = MONTHS[words[1].slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    const day = Number(words[2]);
    if (words[3]) return new Date(Date.UTC(Number(words[3]), month, day));
    // No year: pick the candidate closest to the reference date.
    const refYear = reference.getUTCFullYear();
    const candidates = [refYear - 1, refYear, refYear + 1].map(
      (y) => new Date(Date.UTC(y, month, day))
    );
    candidates.sort(
      (a, b) =>
        Math.abs(a.getTime() - reference.getTime()) -
        Math.abs(b.getTime() - reference.getTime())
    );
    return candidates[0];
  }

  return null;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Schedule fetch + parse
// ---------------------------------------------------------------------------

async function resolveTabTitle(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  gid: string
): Promise<string | null> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const match = meta.data.sheets?.find(
    (s) => String(s.properties?.sheetId) === gid
  );
  return match?.properties?.title ?? null;
}

/** Splits a schedule cell into individual task bullets. */
function splitTasks(cell: string): string[] {
  return cell
    .split(/[•\n]/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1);
}

interface ScheduleData {
  rows: string[][];
  headerIdx: number;
  people: { name: string; col: number }[];
}

/**
 * Fetches and parses the schedule tab: locates the header row and the
 * per-teammate columns. Shared by the email digest and the live task board.
 */
async function loadSchedule(): Promise<{ data?: ScheduleData; error?: string }> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  if (!sheets) {
    return {
      error:
        "Google service-account credentials not found. Set GOOGLE_SERVICE_ACCOUNT_JSON (the whole key JSON), or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY.",
    };
  }
  if (!spreadsheetId) {
    return { error: "Set DIGEST_SHEET_ID (or GOOGLE_SHEET_ID) to the spreadsheet ID." };
  }
  const gid = process.env.DIGEST_SHEET_GID || "290694620";
  const title = await resolveTabTitle(sheets, spreadsheetId, gid);
  if (!title) {
    return { error: `No tab with gid ${gid} in spreadsheet.` };
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${title}'!A1:Z500`,
  });
  const rows: string[][] = (res.data.values as string[][]) ?? [];

  // Header row: first cell "Date" and at least one teammate column after
  // Date | Wk | Milestone(s).
  const headerIdx = rows.findIndex(
    (r) =>
      (r[0] ?? "").trim().toLowerCase() === "date" &&
      r.slice(3).some((c) => (c ?? "").trim().length > 0)
  );
  if (headerIdx === -1) {
    return { error: "Could not find the schedule header row." };
  }

  const header = rows[headerIdx];
  const people: { name: string; col: number }[] = [];
  for (let c = 3; c < header.length; c++) {
    const name = (header[c] ?? "").trim();
    if (name) {
      people.push({
        name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
        col: c,
      });
    }
  }
  return { data: { rows, headerIdx, people } };
}

/**
 * Builds one digest per teammate covering [start, end] (inclusive).
 * Teammates come from the schedule's header row; only those present in
 * `emails` (case-insensitive) get a digest.
 */
export async function buildDigests(
  start: Date,
  end: Date
): Promise<{ digests: TeammateDigest[]; error?: string }> {
  const { data, error } = await loadSchedule();
  if (error || !data) return { digests: [], error };
  const { rows, headerIdx, people } = data;

  const emails = getTeamEmails();
  const emailFor = (name: string): string | undefined => {
    const key = Object.keys(emails).find(
      (k) => k.trim().toLowerCase() === name.trim().toLowerCase()
    );
    return key ? emails[key] : undefined;
  };

  const byPerson = new Map<string, DayTasks[]>();
  const reference = todayInTeamTz();

  for (const row of rows.slice(headerIdx + 1)) {
    const date = parseScheduleDate(row[0] ?? "", reference);
    if (!date || date < start || date > end) continue;
    const milestone = (row[2] ?? "").trim() || null;

    for (const person of people) {
      const tasks = splitTasks(row[person.col] ?? "");
      if (tasks.length === 0) continue;
      const list = byPerson.get(person.name) ?? [];
      list.push({ date, dateLabel: formatDay(date), milestone, tasks });
      byPerson.set(person.name, list);
    }
  }

  const digests: TeammateDigest[] = [];
  for (const person of people) {
    const email = emailFor(person.name);
    if (!email) continue;
    const days = (byPerson.get(person.name) ?? []).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    digests.push({ name: person.name, email, days });
  }
  return { digests };
}

// ---------------------------------------------------------------------------
// Live task board (mirrors the schedule tab, grouped by day)
// ---------------------------------------------------------------------------

export type TaskStatus = "done" | "progress";

/** One teammate's tasks for one day. */
export interface BoardBlock {
  person: string;
  milestone: string | null;
  tasks: string[];
  /** Current status, from the Task Status tab (null = not started). */
  status: TaskStatus | null;
  /** ISO day key, e.g. "2026-07-20" — matches the email button's key. */
  dayKey: string;
  /** Status-button label (mirrors the email). */
  label: string;
}

export interface BoardDay {
  dayKey: string;
  dateLabel: string;
  kicker: string;
  isToday: boolean;
  blocks: BoardBlock[];
}

export interface Board {
  days: BoardDay[];
  people: string[];
  counts: { today: number; overdue: number; total: number };
}

/**
 * Reads the Task Status tab into a map keyed by `${person}|${dayKey}` (person
 * lowercased). The append log is in chronological order, so later rows win.
 */
async function readStatusMap(): Promise<Map<string, TaskStatus>> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const map = new Map<string, TaskStatus>();
  if (!sheets || !spreadsheetId) return map;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${STATUS_TAB}'!A:E`,
    });
    const rows = (res.data.values as string[][]) ?? [];
    for (const r of rows.slice(1)) {
      const person = (r[1] ?? "").trim().toLowerCase();
      const day = (r[2] ?? "").trim();
      const status = (r[3] ?? "").trim().toLowerCase();
      if (!person || !day) continue;
      map.set(`${person}|${day}`, status.startsWith("done") ? "done" : "progress");
    }
  } catch {
    // Task Status tab may not exist yet — nothing to overlay.
  }
  return map;
}

/**
 * Builds the whole-team board for [start, end], grouped by day. Each day holds
 * one block per teammate who has tasks that day, with the current status
 * overlaid from the Task Status tab.
 */
export async function buildBoard(
  start: Date,
  end: Date
): Promise<{ board?: Board; error?: string }> {
  const { data, error } = await loadSchedule();
  if (error || !data) return { error };
  const { rows, headerIdx, people } = data;

  const statusMap = await readStatusMap();
  const today = todayInTeamTz();
  const todayKey = today.toISOString().slice(0, 10);
  const dayMap = new Map<string, BoardDay>();

  for (const row of rows.slice(headerIdx + 1)) {
    const date = parseScheduleDate(row[0] ?? "", today);
    if (!date || date < start || date > end) continue;
    const dayKey = date.toISOString().slice(0, 10);
    const milestone = (row[2] ?? "").trim() || null;

    let day = dayMap.get(dayKey);
    if (!day) {
      day = {
        dayKey,
        dateLabel: formatDay(date),
        kicker: kickerFor(date, today),
        isToday: dayKey === todayKey,
        blocks: [],
      };
      dayMap.set(dayKey, day);
    }

    for (const person of people) {
      const tasks = splitTasks(row[person.col] ?? "");
      if (tasks.length === 0) continue;
      const existing = day.blocks.find((b) => b.person === person.name);
      if (existing) {
        existing.tasks.push(...tasks);
        if (!existing.milestone && milestone) existing.milestone = milestone;
      } else {
        day.blocks.push({
          person: person.name,
          milestone,
          tasks,
          status: statusMap.get(`${person.name.toLowerCase()}|${dayKey}`) ?? null,
          dayKey,
          label: (milestone || day.dateLabel).slice(0, 80),
        });
      }
    }
  }

  const days = [...dayMap.values()]
    .filter((d) => d.blocks.length > 0)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  // Order blocks within each day by the schedule's people order.
  const order = new Map(people.map((p, i) => [p.name, i]));
  for (const day of days) {
    day.blocks.sort(
      (a, b) => (order.get(a.person) ?? 0) - (order.get(b.person) ?? 0)
    );
  }

  let todayCount = 0;
  let overdueCount = 0;
  let total = 0;
  for (const day of days) {
    for (const block of day.blocks) {
      total += block.tasks.length;
      if (day.dayKey === todayKey) todayCount += block.tasks.length;
      if (day.dayKey < todayKey && block.status !== "done") {
        overdueCount += block.tasks.length;
      }
    }
  }

  return {
    board: {
      days,
      people: people.map((p) => p.name),
      counts: { today: todayCount, overdue: overdueCount, total },
    },
  };
}

// ---------------------------------------------------------------------------
// Status-button links (HMAC-signed so they can't be forged)
// ---------------------------------------------------------------------------

export interface StatusPayload {
  person: string;
  /** ISO day, e.g. "2026-07-20" */
  day: string;
  status: "done" | "progress";
  /** Short label shown in the log (milestone or date). */
  label: string;
}

function payloadString(p: StatusPayload): string {
  return [p.person, p.day, p.status, p.label].join("|");
}

export function signStatus(p: StatusPayload): string {
  const secret = process.env.DIGEST_SECRET || "dev-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(payloadString(p))
    .digest("hex")
    .slice(0, 32);
}

export function verifyStatus(p: StatusPayload, sig: string): boolean {
  const expected = signStatus(p);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function statusUrl(base: string, p: StatusPayload): string {
  const params = new URLSearchParams({
    p: p.person,
    d: p.day,
    s: p.status,
    l: p.label,
    sig: signStatus(p),
  });
  return `${base}/api/digest/status?${params.toString()}`;
}

/** Appends a button click to the "Task Status" tab (creating it if missing). */
export async function recordStatus(p: StatusPayload): Promise<boolean> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  if (!sheets || !spreadsheetId) return false;

  const row = [
    new Date().toLocaleString("en-US", { timeZone: TIME_ZONE }),
    p.person,
    p.day,
    p.status === "done" ? "Done" : "In Progress",
    p.label,
  ];
  const append = () =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${STATUS_TAB}'!A:E`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

  try {
    await append();
    return true;
  } catch {
    // Tab probably doesn't exist yet — create it with a header, then retry.
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: STATUS_TAB } } }],
        },
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${STATUS_TAB}'!A:E`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["Timestamp", "Teammate", "Task Day", "Status", "Tasks"]],
        },
      });
      await append();
      return true;
    } catch (err) {
      console.error("[digest] Failed to record status:", err);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Email rendering — mirrors the News Scout newsletter style
// ---------------------------------------------------------------------------

const GOLD = "#a16207"; // deadline / kicker gold
const INK = "#1f2937";
const MUTED = "#4b5563";
const FAINT = "#9ca3af";
const RULE = "#e5e7eb";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kickerFor(day: Date, today: Date): string {
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "CATCH-UP";
  if (diff === 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  return "UPCOMING";
}

function buttonRow(digest: TeammateDigest, day: DayTasks, base: string): string {
  const label = (day.milestone || day.dateLabel).slice(0, 80);
  const common = {
    person: digest.name,
    day: day.date.toISOString().slice(0, 10),
    label,
  };
  const doneUrl = statusUrl(base, { ...common, status: "done" });
  const progressUrl = statusUrl(base, { ...common, status: "progress" });
  return `
    <p style="margin:14px 0 0;">
      <span style="font-size:13px;color:${FAINT};vertical-align:middle;">&#128204;&nbsp;</span>
      <a href="${doneUrl}"
         style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:7px 14px;border-radius:999px;">&#10003;&nbsp;Done</a>
      &nbsp;
      <a href="${progressUrl}"
         style="display:inline-block;background:#ffffff;color:${GOLD};border:1px solid ${GOLD};text-decoration:none;font-size:12px;font-weight:600;padding:6px 14px;border-radius:999px;">&#9203;&nbsp;In&nbsp;Progress</a>
    </p>`;
}

export function renderDigestHtml(
  digest: TeammateDigest,
  today: Date,
  base: string
): string {
  const sections = digest.days
    .map((day) => {
      const kicker = kickerFor(day.date, today);
      const title = day.milestone
        ? day.milestone
        : `Your tasks for ${day.dateLabel}`;
      const bullets = day.tasks
        .map(
          (t) =>
            `<li style="margin:0 0 6px;color:${MUTED};font-size:14px;line-height:1.5;">${escapeHtml(t)}</li>`
        )
        .join("");
      return `
        <div style="padding:22px 0;border-bottom:1px solid ${RULE};">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;color:${GOLD};text-transform:uppercase;">
            ${kicker} &middot; ${escapeHtml(day.dateLabel.toUpperCase())}
          </p>
          <h2 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:700;color:${INK};">
            ${escapeHtml(title)}
          </h2>
          <ul style="margin:0;padding-left:18px;">${bullets}</ul>
          ${buttonRow(digest, day, base)}
        </div>`;
    })
    .join("");

  const empty = `
    <div style="padding:28px 0;text-align:center;color:${FAINT};font-size:14px;">
      Nothing on the schedule for this window. Enjoy the breather &#127881;
    </div>`;

  return `
  <div style="background:#f9fafb;padding:24px 12px;">
    <div style="font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:auto;background:#ffffff;border:1px solid ${RULE};border-radius:12px;padding:28px 30px;">
      <h1 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:23px;color:${INK};">
        &#128221; Field Day Daily &mdash; ${escapeHtml(digest.name)}
      </h1>
      <p style="margin:0 0 6px;color:${MUTED};font-size:14px;line-height:1.5;">
        Your tasks from the past 2 days and the week ahead, pulled from the
        team schedule. Tap <strong>Done</strong> or <strong>In&nbsp;Progress</strong>
        on any block &mdash; it logs straight to the spreadsheet.
      </p>
      ${sections || empty}
      <p style="margin:18px 0 0;color:${FAINT};font-size:12px;">
        Sent automatically every morning by Field Day Tracker &middot;
        ${escapeHtml(formatDay(today))}
      </p>
    </div>
  </div>`;
}
