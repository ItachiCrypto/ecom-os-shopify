"use client";

type CacheEntry<T> = {
  value?: T;
  promise?: Promise<T>;
  expires: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL = 30_000;

function getCookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function cacheKeyFor(url: string): string {
  const shop = getCookieValue("ecomos_shop");
  return `${url}|shop=${shop}`;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}

export function cachedJson<T>(url: string, ttl = DEFAULT_TTL): Promise<T> {
  const now = Date.now();
  const key = cacheKeyFor(url);
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (entry?.value !== undefined && entry.expires > now) {
    return Promise.resolve(entry.value);
  }

  if (entry?.promise && entry.expires > now) {
    return entry.promise;
  }

  const promise = fetch(url, { cache: "no-store", credentials: "same-origin" })
    .then((response) => parseJsonResponse<T>(response))
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + ttl });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { promise, expires: now + ttl });
  return promise;
}

export function warmApiCache(urls: string[], ttl = DEFAULT_TTL) {
  urls.forEach((url) => {
    cachedJson<unknown>(url, ttl).catch(() => {
      // Prefetch is opportunistic; pages will surface real errors if needed.
    });
  });
}

export function clearClientApiCache(match?: string | RegExp | ((key: string) => boolean)) {
  if (!match) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    const shouldDelete =
      typeof match === "string"
        ? key.startsWith(match)
        : match instanceof RegExp
        ? match.test(key)
        : match(key);
    if (shouldDelete) cache.delete(key);
  }
}

export function warmRouteData(pathname: string) {
  if (pathname === "/") {
    warmApiCache(["/api/orders?all=true", "/api/data", "/api/shop"]);
    return;
  }

  if (pathname === "/profit") {
    warmApiCache(["/api/orders?all=true", "/api/data", "/api/shop", "/api/ad-spend"]);
    return;
  }

  if (pathname === "/parametres") {
    warmApiCache(["/api/data", "/api/shop", "/api/products"]);
    return;
  }

  if (pathname === "/roas") {
    warmApiCache(["/api/data"]);
  }
}
