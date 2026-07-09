export const INVENTORY_STATUSES = [
  "Needed",
  "Pending Order",
  "Shipped",
  "Delivered",
  "Picked Up",
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export interface InventoryItem {
  id: string;
  item_name: string;
  image_url: string | null;
  unit_price: number;
  target_quantity: number;
  current_stock: number;
  /** Generated in Postgres: target_quantity - current_stock */
  delta: number;
  status: InventoryStatus;
  tracking_number: string | null;
  carrier: string | null;
  /** Optional custom tracking link; overrides the auto-built carrier URL. */
  tracking_url: string | null;
  /** Separate receipt photo (item photo lives in image_url). */
  receipt_url: string | null;
  notes: string | null;
  /** Generated in Postgres: unit_price * current_stock */
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export const EXPENSE_CATEGORIES = [
  "Permit",
  "Labor",
  "Vendor",
  "Rental",
  "Food",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  paid: boolean;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Builds a carrier tracking URL from carrier + tracking number.
 * Falls back to a universal tracker for unknown carriers.
 */
export function trackingLink(
  carrier: string | null,
  trackingNumber: string | null,
  customUrl?: string | null
): string | null {
  if (customUrl) return customUrl;
  if (!trackingNumber) return null;
  const t = encodeURIComponent(trackingNumber);
  switch ((carrier || "").toUpperCase()) {
    case "UPS":
      return `https://www.ups.com/track?tracknum=${t}`;
    case "FEDEX":
      return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
    case "DHL":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`;
    default:
      return `https://parcelsapp.com/en/tracking/${t}`;
  }
}

/** Tailwind classes for each status badge. */
export const STATUS_STYLES: Record<InventoryStatus, string> = {
  Needed: "bg-red-100 text-red-700 ring-red-600/20",
  "Pending Order": "bg-amber-100 text-amber-700 ring-amber-600/20",
  Shipped: "bg-blue-100 text-blue-700 ring-blue-600/20",
  Delivered: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  "Picked Up": "bg-violet-100 text-violet-700 ring-violet-600/20",
};

// ============================================================================
// OUTREACH TAB
// ============================================================================

export const OUTREACH_STAGES = [
  "New",
  "Contacted",
  "Replied",
  "Confirmed",
  "Closed",
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number];

/** Tailwind classes for each stage badge (mirrors STATUS_STYLES above). */
export const STAGE_STYLES: Record<string, string> = {
  New: "bg-gray-100 text-gray-700 ring-gray-600/20",
  Contacted: "bg-blue-100 text-blue-700 ring-blue-600/20",
  Replied: "bg-amber-100 text-amber-700 ring-amber-600/20",
  Confirmed: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  Closed: "bg-violet-100 text-violet-700 ring-violet-600/20",
};

export interface OutreachContact {
  id: string;
  name: string;
  email: string;
  company: string | null;
  stage: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A file attached to a template or a one-off send. */
export interface OutreachAttachment {
  filename: string;
  /** Public Supabase Storage URL. */
  url: string;
  size?: number;
}

export interface OutreachTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  /** Default CC / BCC applied when this template is used (comma-separated). */
  cc: string | null;
  bcc: string | null;
  /** Files that ride along whenever this template is sent. */
  attachments: OutreachAttachment[];
  created_at: string;
  updated_at: string;
}

export interface OutreachSend {
  id: string;
  contact_id: string | null;
  template_id: string | null;
  to_email: string;
  subject: string;
  status: string;
  error: string | null;
  cc: string | null;
  bcc: string | null;
  created_at: string;
}

/** A send row joined with the contact's name, for the Activity log. */
export interface SendLogRow extends OutreachSend {
  contact: { name: string } | null;
}

/**
 * Fills {{name}}, {{email}}, {{company}} (any {{key}}) from the given vars.
 * Unknown placeholders resolve to an empty string.
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string>
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) =>
    vars[key] !== undefined ? vars[key] : ""
  );
}
