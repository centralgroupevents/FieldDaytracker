/**
 * Free, offline carrier detection from a tracking number's format.
 * Best-effort — the user can always override the carrier in the form.
 * No external API, no cost.
 */
export function detectCarrier(tracking: string): string | null {
  const s = (tracking || "").replace(/\s+/g, "").toUpperCase();
  if (!s) return null;

  // UPS: 1Z + 16 alphanumeric
  if (/^1Z[0-9A-Z]{16}$/.test(s)) return "UPS";

  // USPS international: 2 letters + 9 digits + "US"  (e.g. EA123456789US)
  if (/^[A-Z]{2}\d{9}US$/.test(s)) return "USPS";
  // USPS domestic: long numeric starting with 9 (typically 20-22 digits)
  if (/^9\d{15,25}$/.test(s)) return "USPS";

  // FedEx: 12 or 15 digit numeric
  if (/^(\d{12}|\d{15})$/.test(s)) return "FedEx";

  // DHL eCommerce prefixes / DHL Express 10-digit
  if (/^(JJD|JVGL|GM|LX)\w+$/.test(s)) return "DHL";
  if (/^\d{10}$/.test(s)) return "DHL";

  return null;
}
