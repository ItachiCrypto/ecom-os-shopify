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

export const DEFAULT_CONFIG: EcomConfig = {
  shopifyPct: 1.5,
  shopifyFixe: 0.25,
  urssaf: 6.15,
  ir: 1,
  tva: 0,
  soldeInitial: 2500,
  markets: [
    { id: "FR", name: "France", flag: "🇫🇷" },
    { id: "BE", name: "Belgique", flag: "🇧🇪" },
    { id: "CH", name: "Suisse", flag: "🇨🇭" },
    { id: "ES", name: "Espagne", flag: "🇪🇸" },
    { id: "US", name: "USA", flag: "🇺🇸" },
  ],
  fraisParMethode: {
    VISA: { FR: { pct: 1.5, fixe: 0.25 }, BE: { pct: 1.5, fixe: 0.25 }, CH: { pct: 3.5, fixe: 0.25 }, ES: { pct: 1.5, fixe: 0.25 }, US: { pct: 2.9, fixe: 0.30 } },
    Mastercard: { FR: { pct: 1.5, fixe: 0.25 }, BE: { pct: 1.5, fixe: 0.25 }, CH: { pct: 3.5, fixe: 0.25 }, ES: { pct: 1.5, fixe: 0.25 }, US: { pct: 2.9, fixe: 0.30 } },
    PayPal: { FR: { pct: 2.9, fixe: 0.35 }, BE: { pct: 2.9, fixe: 0.35 }, CH: { pct: 2.9, fixe: 0.35 }, ES: { pct: 2.9, fixe: 0.35 }, US: { pct: 2.9, fixe: 0.30 } },
    Bancontact: { FR: { pct: 1.5, fixe: 0.25 }, BE: { pct: 1.5, fixe: 0.25 }, CH: { pct: 0, fixe: 0 }, ES: { pct: 0, fixe: 0 }, US: { pct: 0, fixe: 0 } },
  },
  objectifCA: 500,
  objectifProfit: 100,
  alerteRunway: 5,
  alerteLivraison: { FR: 15, BE: 20, CH: 25, ES: 18, US: 30 },
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
