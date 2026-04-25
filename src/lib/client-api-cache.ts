"use client";

type CacheEntry<T> = {
  value?: T;
  promise?: Promise<T>;
  expires: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL = 30_000;

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
  const entry = cache.get(url) as CacheEntry<T> | undefined;

  if (entry?.value !== undefined && entry.expires > now) {
    return Promise.resolve(entry.value);
  }

  if (entry?.promise && entry.expires > now) {
    return entry.promise;
  }

  const promise = fetch(url)
    .then((response) => parseJsonResponse<T>(response))
    .then((value) => {
      cache.set(url, { value, expires: Date.now() + ttl });
      return value;
    })
    .catch((error) => {
      cache.delete(url);
      throw error;
    });

  cache.set(url, { promise, expires: now + ttl });
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
