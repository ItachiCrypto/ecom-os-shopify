export function formatEur(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatCurrency(n: number, currency: string, digits = 2): string {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatNumber(n: number, digits = 0): string {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatPct(n: number, digits = 1): string {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Compute fees for an order
export function computeFees(
  amount: number,
  market: string,
  method: string,
  fraisParMethode: Record<string, Record<string, { pct: number; fixe: number }>>
): number {
  const m = fraisParMethode[method]?.[market];
  if (!m) return 0;
  return (amount * m.pct) / 100 + m.fixe;
}

// Map Shopify payment gateway names to our simplified methods
export function normalizePaymentMethod(gateway: string): string {
  const g = gateway.toLowerCase();
  if (g.includes("visa")) return "VISA";
  if (g.includes("mastercard") || g.includes("master")) return "Mastercard";
  if (g.includes("paypal")) return "PayPal";
  if (g.includes("bancontact")) return "Bancontact";
  if (g.includes("amex")) return "Amex";
  if (g.includes("shopify_payments") || g.includes("shopify payments")) return "Shopify Payments";
  if (g.includes("apple")) return "Apple Pay";
  if (g.includes("google")) return "Google Pay";
  return gateway;
}
