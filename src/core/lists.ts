// Proxy list fetchers from worker.js (lines 46-88)
import { KV_PRX_URL, PRX_BANK_URL } from './constants';

export interface ProxyEntry {
  prxIP: string;
  prxPort: string;
  country: string;
  org: string;
}

const CACHE_TTL_S = 300; // 5 minutes
const cache = (globalThis as any).caches?.default as Cache | undefined;

async function readCached(url: string): Promise<string | null> {
  if (!cache) return null;
  const res = await cache.match(url);
  if (!res) return null;
  return await res.text();
}

async function fetchTextWithCache(url: string, fallback: string): Promise<string> {
  const hit = await readCached(url);
  if (hit !== null) return hit;

  const resp = await fetch(url, { cf: { cacheTtl: CACHE_TTL_S, cacheEverything: true } } as any);
  if (resp.status == 200) {
    const text = await resp.text();
    if (cache) {
      await cache.put(
        url,
        new Response(text, {
          headers: {
            'content-type': 'text/plain',
            'cache-control': `public, max-age=${CACHE_TTL_S}`,
          },
        })
      );
    }
    return text;
  }

  return (await readCached(url)) ?? fallback;
}

export async function getKVPrxList(
  kvPrxUrl: string = KV_PRX_URL
): Promise<Record<string, string[]>> {
  if (!kvPrxUrl) {
    throw new Error('No URL Provided!');
  }

  const text = await fetchTextWithCache(kvPrxUrl, '{}');
  try {
    return JSON.parse(text) as Record<string, string[]>;
  } catch {
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
    throw new Error('No URL Provided!');
  }

  const text = await fetchTextWithCache(prxBankUrl, '');
  return text
    .split('\n')
    .filter(Boolean)
    .map(entry => {
      const [prxIP, prxPort, country, org] = entry.split(',');
      return {
        prxIP: prxIP || 'Unknown',
        prxPort: prxPort || 'Unknown',
        country: country || 'Unknown',
        org: org || 'Unknown Org',
      };
    });
}
