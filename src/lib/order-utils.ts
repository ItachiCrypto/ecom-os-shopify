// Utilities to extract REAL data from Shopify orders (fees, net, etc.)

export interface Money { shopMoney: { amount: string; currencyCode: string } }
export interface TransactionFee {
  amount: { amount: string; currencyCode: string };
  rate?: string | null;
  flatFee?: { amount: string; currencyCode: string } | null;
  rateName?: string | null;
}
export interface Transaction {
  id: string;
  kind: string; // "sale", "refund", etc.
  status: string; // "success", "pending", etc.
  gateway: string;
  amountSet: Money;
  fees: TransactionFee[];
}

export interface OrderWithTransactions {
  currentTotalPriceSet: Money;
  totalRefundedSet: Money;
  transactions: Transaction[];
}

/**
 * Calculate REAL transaction fees from Shopify data.
 * For Shopify Payments, fees come directly from the transaction.
 * For other gateways (PayPal etc), fees may not be available — returns 0.
 */
export function getRealFees(order: OrderWithTransactions): number {
  if (!order.transactions || order.transactions.length === 0) return 0;
  let totalFees = 0;
  for (const tx of order.transactions) {
    if (tx.status !== "success") continue;
    if (tx.kind === "refund") continue; // Don't count refund fees separately
    for (const fee of tx.fees || []) {
      totalFees += parseFloat(fee.amount.amount);
    }
  }
  return totalFees;
}

/**
 * Net received from payments (after Shopify/gateway fees).
 */
export function getNetReceived(order: OrderWithTransactions): number {
  const gross = parseFloat(order.currentTotalPriceSet.shopMoney.amount);
  const refund = parseFloat(order.totalRefundedSet.shopMoney.amount);
  const fees = getRealFees(order);
  return gross - refund - fees;
}

/**
 * Check if the order has real transaction fee data available.
 * Only Shopify Payments provides this; others return 0.
 */
export function hasRealFeeData(order: OrderWithTransactions): boolean {
  return (order.transactions || []).some((tx) => (tx.fees || []).length > 0);
}

/**
 * Format currency using Intl.NumberFormat, shop's currency.
 */
export function fmtMoney(n: number, currency: string, locale = "fr-FR"): string {
  if (!isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
