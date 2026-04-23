// Shopify Admin GraphQL API client
import { getAccessToken } from "./storage";

const API_VERSION = "2026-04";

function assertValidShop(shop: string) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error(`Invalid shop domain: ${shop}`);
  }
}

export async function shopifyGraphQL<T = unknown>(
  shop: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  assertValidShop(shop);
  const token = await getAccessToken(shop);
  if (!token) throw new Error(`No access token for shop ${shop} — app not installed?`);

  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

// ---------- Orders ----------

const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          createdAt
          processedAt
          displayFinancialStatus
          displayFulfillmentStatus
          customer { firstName lastName email }
          shippingAddress { country countryCodeV2 province }
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalRefundedSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          paymentGatewayNames
          transactions(first: 10) {
            id
            kind
            status
            gateway
            amountSet { shopMoney { amount currencyCode } }
            fees {
              amount { amount currencyCode }
              rate
              flatFee { amount currencyCode }
              rateName
            }
          }
          lineItems(first: 50) {
            edges {
              node {
                title
                quantity
                variant {
                  id
                  title
                  price
                  sku
                  product { id title }
                }
                originalTotalSet { shopMoney { amount currencyCode } }
                discountedTotalSet { shopMoney { amount currencyCode } }
                customAttributes { key value }
              }
            }
          }
        }
      }
    }
  }
`;

export async function getOrders(
  shop: string,
  options: { first?: number; query?: string; after?: string } = {}
) {
  const { first = 100, query, after } = options;
  const data = await shopifyGraphQL<{
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string };
      edges: { node: unknown }[];
    };
  }>(shop, ORDERS_QUERY, { first, after, query });
  return {
    orders: data.orders.edges.map((e) => e.node),
    pageInfo: data.orders.pageInfo,
  };
}

export async function getAllOrders(shop: string, maxPages = 10): Promise<unknown[]> {
  const allOrders: unknown[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const { orders, pageInfo } = await getOrders(shop, { first: 250, after });
    allOrders.push(...orders);
    if (!pageInfo.hasNextPage) break;
    after = pageInfo.endCursor;
  }
  return allOrders;
}

// ---------- Shop info ----------

const SHOP_QUERY = `
  query GetShop {
    shop {
      name
      email
      myshopifyDomain
      primaryDomain { url }
      currencyCode
      ianaTimezone
      plan { displayName }
      billingAddress { countryCodeV2 country }
    }
  }
`;

export async function getShopInfo(shop: string) {
  const data = await shopifyGraphQL<{
    shop: {
      name: string;
      email: string;
      myshopifyDomain: string;
      primaryDomain: { url: string };
      currencyCode: string;
      ianaTimezone: string;
      plan: { displayName: string };
      billingAddress: { countryCodeV2: string; country: string } | null;
    };
  }>(shop, SHOP_QUERY);
  return data.shop;
}

// ---------- Markets ----------

const MARKETS_QUERY = `
  query GetMarkets {
    markets(first: 50) {
      edges {
        node {
          id
          name
          handle
          enabled
          primary
          regions(first: 50) {
            edges {
              node {
                ... on MarketRegionCountry {
                  id
                  name
                  code
                  currency { currencyCode }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function getMarkets(shop: string) {
  try {
    const data = await shopifyGraphQL<{
      markets: {
        edges: {
          node: {
            id: string;
            name: string;
            handle: string;
            enabled: boolean;
            primary: boolean;
            regions: { edges: { node: { id: string; name: string; code: string; currency: { currencyCode: string } } }[] };
          };
        }[];
      };
    }>(shop, MARKETS_QUERY);
    return data.markets.edges.map((e) => e.node);
  } catch (e) {
    console.warn("[shopify] markets query failed (scope read_markets may be required):", e);
    return [];
  }
}

// ---------- Products ----------

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!) {
    products(first: $first, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          status
          totalInventory
          featuredImage { url altText }
          variants(first: 20) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryQuantity
                inventoryItem {
                  unitCost { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function getProducts(shop: string, first = 100) {
  const data = await shopifyGraphQL<{
    products: { edges: { node: unknown }[] };
  }>(shop, PRODUCTS_QUERY, { first });
  return data.products.edges.map((e) => e.node);
}
