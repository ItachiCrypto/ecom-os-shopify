// Shared client-side data cache with stale-while-revalidate semantics.
// Persists across page navigations because the module-scope Map outlives
// component unmounts. Without this, navigating Dashboard → Profit refetches
// /api/orders?all=true which is the slowest endpoint in the app.

type Subscriber<T> = (data: T) => void;

interface Entry<T> {
  data: T;
  fetchedAt: number;
  inflight?: Promise<T>;
  subscribers: Set<Subscriber<T>>;
}

const cache = new Map<string, Entry<unknown>>();

const DEFAULT_TTL = 60_000; // serve cached data without revalidation for 60s
const STALE_AFTER = 5 * 60_000; // after 5min consider hard-stale (refuse to serve)

function now() {
  return Date.now();
}

async function rawFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error || "";
    } catch {
      // ignore
    }
    throw new Error(`${url} ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

/**
 * Fetch with a shared in-memory cache.
 *  - If cached entry is younger than `ttlMs`, returns it without hitting the network.
 *  - Otherwise returns cached data immediately if available (stale) and revalidates
 *    in the background, notifying any active subscribers when the new data lands.
 *  - If no cached data exists, awaits the network.
 */
export function cachedFetch<T>(
  url: string,
  options: { ttlMs?: number; init?: RequestInit; onUpdate?: (data: T) => void } = {}
): Promise<T> {
  const ttl = options.ttlMs ?? DEFAULT_TTL;
  const entry = cache.get(url) as Entry<T> | undefined;
  const fresh = entry && now() - entry.fetchedAt < ttl;

  if (entry && options.onUpdate) entry.subscribers.add(options.onUpdate);

  // Fresh hit — return cached data, no network.
  if (fresh && entry) {
    return Promise.resolve(entry.data);
  }

  // Already revalidating — piggyback on the inflight request.
  if (entry?.inflight) {
    if (entry.fetchedAt > 0 && now() - entry.fetchedAt < STALE_AFTER) {
      return Promise.resolve(entry.data);
    }
    return entry.inflight;
  }

  const subscribers: Set<Subscriber<T>> = entry?.subscribers ?? new Set<Subscriber<T>>();
  if (options.onUpdate) subscribers.add(options.onUpdate);

  const promise = rawFetch<T>(url, options.init)
    .then((data) => {
      const e: Entry<T> = { data, fetchedAt: now(), subscribers };
      cache.set(url, e as Entry<unknown>);
      subscribers.forEach((cb) => {
        try {
          cb(data);
        } catch {
          // a subscriber crashing must not break others
        }
      });
      return data;
    })
    .catch((err) => {
      const cur = cache.get(url) as Entry<T> | undefined;
      if (cur) cur.inflight = undefined;
      throw err;
    });

  cache.set(url, {
    data: entry?.data,
    fetchedAt: entry?.fetchedAt ?? 0,
    inflight: promise,
    subscribers,
  } as Entry<unknown>);

  // If we have stale data, return it now and let the background refresh notify
  // subscribers when it completes.
  if (entry && entry.fetchedAt > 0 && now() - entry.fetchedAt < STALE_AFTER) {
    return Promise.resolve(entry.data);
  }

  return promise;
}

/** Drop one or more cache entries (e.g. after a mutation). */
export function invalidate(...urls: string[]): void {
  for (const url of urls) cache.delete(url);
}

/** Manually seed the cache (rarely needed). */
export function seedCache<T>(url: string, data: T): void {
  cache.set(url, {
    data,
    fetchedAt: now(),
    subscribers: new Set(),
  } as Entry<unknown>);
}

/** Drop the entire cache (e.g. when switching shops). */
export function clearCache(): void {
  cache.clear();
}
