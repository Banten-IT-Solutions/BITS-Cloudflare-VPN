import type { HealthCheck } from "@bits-vpn/shared";

const HEALTH_TTL_MS = 15_000;
const TIMEOUT_MS = 2_000;
const TLS_PORTS = new Set([443, 8443, 2053, 2083, 2087, 2096]);

const cache = new Map<string, { value: HealthCheck; cachedAt: number }>();

/** HEAD-request a proxy to measure delay & reachability. */
export async function checkProxyHealth(ip: string, port = "443"): Promise<HealthCheck> {
  const key = `${ip}:${port}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < HEALTH_TTL_MS) {
    return hit.value;
  }

  const parsedPort = Number.parseInt(port, 10);
  const scheme = TLS_PORTS.has(parsedPort) ? "https" : "http";
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    await fetch(`${scheme}://${ip}:${port}`, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);

    const result: HealthCheck = {
      error: false,
      result: {
        proxy: ip,
        port: parsedPort,
        proxyip: true,
        delay: Date.now() - start,
      },
    };
    cache.set(key, { value: result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    const result: HealthCheck = {
      error: true,
      message: err instanceof Error ? err.message : "failed",
      result: {
        proxy: ip,
        port: parsedPort,
        proxyip: false,
        delay: Math.min(Date.now() - start, TIMEOUT_MS),
      },
    };
    cache.set(key, { value: result, cachedAt: Date.now() });
    return result;
  }
}