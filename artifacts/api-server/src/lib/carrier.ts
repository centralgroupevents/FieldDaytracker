export function detectCarrier(tracking: string): string | null {
  const s = (tracking || "").replace(/\s+/g, "").toUpperCase();
  if (!s) return null;

  if (/^1Z[0-9A-Z]{16}$/.test(s)) return "UPS";

  if (/^[A-Z]{2}\d{9}US$/.test(s)) return "USPS";
  if (/^9\d{15,25}$/.test(s)) return "USPS";

  if (/^(\d{12}|\d{15})$/.test(s)) return "FedEx";

  if (/^(JJD|JVGL|GM|LX)\w+$/.test(s)) return "DHL";
  if (/^\d{10}$/.test(s)) return "DHL";

  return null;
}
