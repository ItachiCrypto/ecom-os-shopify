// Shopify types
export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

export interface ShopifyOrder {
  id: string;
  name: string; // "#1001"
  createdAt: string;
  processedAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  customer: { firstName?: string; lastName?: string; email?: string } | null;
  shippingAddress: { country?: string; countryCodeV2?: string; province?: string } | null;
  currentTotalPriceSet: { shopMoney: ShopifyMoney };
  totalPriceSet: { shopMoney: ShopifyMoney };
  subtotalPriceSet: { shopMoney: ShopifyMoney };
  totalRefundedSet: { shopMoney: ShopifyMoney };
  totalShippingPriceSet: { shopMoney: ShopifyMoney };
  totalTaxSet: { shopMoney: ShopifyMoney };
  totalDiscountsSet: { shopMoney: ShopifyMoney };
  paymentGatewayNames: string[];
  lineItems: {
    edges: {
      node: {
        title: string;
        quantity: number;
        variant: { title: string; price: string; sku?: string } | null;
        originalTotalSet: { shopMoney: ShopifyMoney };
      };
    }[];
  };
}

// Custom data types (stored in Blob)
export interface EcomMarket {
  id: string; // "FR"
  name: string; // "France"
  flag: string;
}

export interface PaymentFee {
  pct: number;
  fixe: number;
}

export interface ProductCost {
  // Shopify variant ID (gid://shopify/ProductVariant/XXX) is the key
  productTitle: string; // denormalized for display
  variantTitle: string;
  price: number; // current selling price (from Shopify)
  cogs: number; // cost of goods sold per unit (user input)
  active: boolean; // include in Profit page calculations
}

/**
 * Bundle = "For every [trigger variant] sold, these extra items ship with it".
 * Used to track the real COGS of promo bundles (e.g. "Every ring sold comes
 * with 1 free lube — we still pay the lube's cost").
 */
export interface Bundle {
  id: string;
  name: string; // "Pack Ring + Lub offert"
  // Shopify variant IDs that, when sold, trigger this bundle's extra items
  triggerVariantIds: string[];
  // Extra items included per trigger (real cost, even if customer pays $0 for them)
  items: {
    variantId: string; // variant ID from Shopify (must exist in productCosts)
    quantity: number;  // per 1 trigger sold
  }[];
  active: boolean;
}

export interface MonthlySubscription {
  id: string;
  name: string;
  monthlyAmount: number;
  active: boolean;
}

/**
 * A Meta/Google ad campaign tracked separately within a shop's daily spend.
 * Spend can be entered per (date, campaign) and the daily total is summed.
 */
export interface AdCampaign {
  id: string;
  name: string;
  color?: string; // optional UI tag (CSS color)
  active: boolean;
}

/**
 * One day's ad spend for a shop. Either a single flat amount (legacy) OR a
 * per-campaign breakdown. When `byCampaign` is present, `spend` is the sum.
 */
export interface DailyAdEntry {
  spend: number;
  notes?: string;
  byCampaign?: Record<string, { spend: number; notes?: string }>;
}

export interface EcomConfig {
  shopifyPct: number;
  shopifyFixe: number;
  urssaf: number;
  ir: number;
  tva: number;
  soldeInitial: number;
  markets: EcomMarket[];
  fraisParMethode: Record<string, Record<string, PaymentFee>>;
  objectifCA: number;
  objectifProfit: number;
  alerteRunway: number;
  alerteLivraison: Record<string, number>;
  // Date when this store "started" (new product, new phase, etc).
  // Used as default for date filters. ISO string (YYYY-MM-DD).
  shopStartDate?: string;
  // Tax applied on ad spend (e.g. Meta VAT in Ireland = ~5%)
  taxOnAdSpend?: number;
  // Fixed fee charged per order (e.g. Shopify fixed fee, independent from real payment fees)
  shopifyFixedFeePerOrder?: number;
  // Monthly subscriptions prorated daily in profit calculations
  monthlySubscriptions?: MonthlySubscription[];
  // COGS per variant (key: variant ID)
  productCosts?: Record<string, ProductCost>;
  // Bundles (e.g. "ring + free lube") — extra items that ship with each trigger variant sold
  bundles?: Bundle[];
  // Daily ad spend (key: YYYY-MM-DD). Each entry holds a flat `spend` and an
  // optional per-campaign breakdown — if `byCampaign` is set, `spend` MUST equal
  // the sum of campaign values.
  dailyAds?: Record<string, DailyAdEntry>;
  // Ad campaigns defined for this shop (Meta/Google/etc).
  adCampaigns?: AdCampaign[];
  // Shipping cost brackets: key = max quantity for this bracket, value = shipping cost.
  // E.g. { "1": 3.5, "3": 5, "5": 7, "10": 10 }
  // An order with N total items uses the SMALLEST bracket where N <= bracket.
  // N > largest bracket falls back to the largest bracket's cost.
  shippingCostByQty?: Record<string, number>;
}

export interface Testing {
  id: string;
  name: string;
  createdAt: string;
  days: TestingDay[];
}

export interface TestingDay {
  id: string;
  day: string; // label
  totalOrders: number;
  fbAdsCosts: number;
  cogs: number;
  totalSales: number;
  cpm: number;
  ctr: number;
  cpc: number;
  visitors: number;
  atc: number;
  paymentInitiated: number;
  sales: number;
}

export interface Scenario {
  id: string;
  name: string;
  productName: string;
  prixVente: number;
  margeMinimum: number;
  margeCible: number;
  cogsByMarket: Record<string, number>;
  createdAt: string;
}

export interface Subscription {
  id: string;
  name: string;
  montant: number;
  cycleJours: number;
  dateDebut: string;
  active: boolean;
}

export interface TresorerieEntry {
  id: string;
  date: string;
  caBrut: number;
  nbCommandes: number;
  adsDepenses: number;
  fournisseurPaye: number;
  virementShopify: number;
  notes: string;
}

export interface JournalEntry {
  id: string;
  title: string;
  date: string;
  content: string;
  tags: string[];
}

export interface FournisseurEntry {
  id: string;
  date: string;
  orderShopify: string;
  client: string;
  pays: string;
  variante: string;
  quantite: number;
  cogs: number;
  tracking: string;
  refVersement: string;
  statut: "Paye" | "En attente" | "Livre";
  notes: string;
}

export interface ShopData {
  shop: string;
  accessToken: string;
  installedAt: string;
  config: EcomConfig;
  testings: Testing[];
  scenarios: Scenario[];
  abonnements: Subscription[];
  tresorerie: TresorerieEntry[];
  journal: JournalEntry[];
  fournisseur: FournisseurEntry[];
  favoris: { testings: string[]; scenarios: string[] };
  historique: { id: string; date: string; action: string; details: string }[];
}

// Defaults used ONLY if the user hasn't configured anything yet.
// All values are editable in Paramètres. Markets come from Shopify API.
export const DEFAULT_CONFIG: EcomConfig = {
  shopifyPct: 0, // Real fees come from Shopify transaction data
  shopifyFixe: 0,
  urssaf: 0, // User-configured in Paramètres (French: 6.15%, etc)
  ir: 0,
  tva: 0,
  soldeInitial: 0, // User-configured in Paramètres
  markets: [], // Filled from Shopify Markets API
  fraisParMethode: {}, // Not used — real fees come from Shopify transactions
  objectifCA: 0, // User-configured in Paramètres
  objectifProfit: 0,
  alerteRunway: 7,
  alerteLivraison: {},
  taxOnAdSpend: 5, // Default 5% (Meta/FB VAT)
  shopifyFixedFeePerOrder: 0,
  monthlySubscriptions: [],
  productCosts: {},
  bundles: [],
  dailyAds: {},
};

export function defaultShopData(shop: string, accessToken: string): ShopData {
  return {
    shop,
    accessToken,
    installedAt: new Date().toISOString(),
    config: DEFAULT_CONFIG,
    testings: [],
    scenarios: [],
    abonnements: [],
    tresorerie: [],
    journal: [],
    fournisseur: [],
    favoris: { testings: [], scenarios: [] },
    historique: [],
  };
}
