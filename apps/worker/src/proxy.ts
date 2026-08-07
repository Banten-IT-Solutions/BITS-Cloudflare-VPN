import type { SubQuery, Proxy, ProxyList } from "@bits-vpn/shared";
import { ProxyListSchema } from "@bits-vpn/shared";
import type { Env } from "./env";

/**
 * Data access layer over D1 + KV.
 *
 * - D1 holds the authoritative proxy metadata (allows SQL filtering).
 * - KV caches the rendered subscription payload keyed by normalized query params.
 */

const SUB_CACHE_PREFIX = "sub:";
const SUB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SCANNED_LIST_KEY = "proxy-lists/latest.json";

function subCacheKey(q: SubQuery): string {
  return `${SUB_CACHE_PREFIX}${[
    q.cc ?? "all",
    q.vpn ?? "all",
    q.port ?? "any",
    q.domain ?? "nd",
    q.format,
    q.limit,
  ].join("|")}`;
}

export async function queryProxies(env: Env, q: SubQuery): Promise<Proxy[]> {
  const conditions: string[] = ["1 = 1"];
  const args: (string | number)[] = [];

  if (q.cc) {
    const codes = q.cc.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (codes.length) {
      conditions.push(`country IN (${codes.map(() => "?").join(",")})`);
      args.push(...codes);
    }
  }
  if (q.vpn) {
    const protos = q.vpn.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (protos.length) {
      conditions.push(`protocol IN (${protos.map(() => "?").join(",")})`);
      args.push(...protos);
    }
  }
  if (q.port) {
    conditions.push("port = ?");
    args.push(q.port);
  }
  if (q.domain) {
    conditions.push("domain = ?");
    args.push(q.domain);
  }

  const where = conditions.join(" AND ");
  const stmt = env.DB.prepare(
    `SELECT ip, port, country, protocol, domain, tls FROM proxies
     WHERE ${where} LIMIT ?`,
  );
  const { results } = await stmt.bind(...args, q.limit).all<Proxy>();

  return results.map((r) => ({ ...r, tls: Boolean(r.tls) }));
}

export async function getScannedProxies(env: Env, region?: string): Promise<ProxyList | null> {
  const object = await env.PROXY_LISTS.get(SCANNED_LIST_KEY);
  if (!object) return null;
  const list = ProxyListSchema.safeParse(await object.json<unknown>());
  if (!list.success) throw new Error("invalid scanned proxy list");
  return region ? { ...list.data, proxies: list.data.proxies.filter((proxy) => proxy.region === region) } : list.data;
}

/** Read-through cache for a rendered subscription payload. */
export async function getCachedSub(env: Env, q: SubQuery): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const cached = await env.KV.get(subCacheKey(q), "arrayBuffer");
  if (!cached) return null;
  return { bytes: cached, contentType: q.format === "raw" ? "text/plain" : "application/json" };
}

export async function setCachedSub(env: Env, q: SubQuery, buffer: ArrayBuffer): Promise<void> {
  await env.KV.put(subCacheKey(q), buffer, { expirationTtl: Math.floor(SUB_CACHE_TTL_MS / 1000) });
}
