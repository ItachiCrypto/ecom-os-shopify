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
