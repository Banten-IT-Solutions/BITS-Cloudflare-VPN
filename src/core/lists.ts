// Proxy list fetchers from worker.js (lines 46-88)
import { KV_PRX_URL, PRX_BANK_URL } from "./constants";

export interface ProxyEntry {
  prxIP: string;
  prxPort: string;
  country: string;
  org: string;
}

// TTL cache: Map<url, {data, expiresAt}>
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const kvPrxCache = new Map<string, CacheEntry<Record<string, string[]>>>();
const prxListCache = new Map<string, CacheEntry<ProxyEntry[]>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getKVPrxList(kvPrxUrl: string = KV_PRX_URL): Promise<Record<string, string[]>> {
  if (!kvPrxUrl) {
    throw new Error("No URL Provided!");
  }

  // Check cache
  const cached = kvPrxCache.get(kvPrxUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const kvPrx = await fetch(kvPrxUrl, {
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  } as any);
  if (kvPrx.status == 200) {
    const data = await kvPrx.json() as Record<string, string[]>;
    kvPrxCache.set(kvPrxUrl, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } else {
    // Return cached data if available (stale-while-revalidate pattern)
    if (cached) {
      return cached.data;
    }
    return {};
  }
}

export async function getPrxList(prxBankUrl: string = PRX_BANK_URL): Promise<ProxyEntry[]> {
  /**
   * Format:
   *
   * <IP>,<Port>,<Country ID>,<ORG>
   * Contoh:
   * 1.1.1.1,443,SG,Cloudflare Inc.
   */
  if (!prxBankUrl) {
    throw new Error("No URL Provided!");
  }

  // Check cache
  const cached = prxListCache.get(prxBankUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const prxBank = await fetch(prxBankUrl, {
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  } as any);
  if (prxBank.status == 200) {
    const text = (await prxBank.text()) || "";

    const prxString = text.split("\n").filter(Boolean);
    const data = prxString
      .map((entry) => {
        const [prxIP, prxPort, country, org] = entry.split(",");
        return {
          prxIP: prxIP || "Unknown",
          prxPort: prxPort || "Unknown",
          country: country || "Unknown",
          org: org || "Unknown Org",
        };
      })
      .filter(Boolean);

    prxListCache.set(prxBankUrl, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  }

  // Return stale cache if available
  if (cached) {
    return cached.data;
  }

  return [];
}
