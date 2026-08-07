import { ProxyListSchema, ScannedProxySchema, type ScannedProxy } from "@bits-vpn/shared";

interface Env {
  PROXY_LISTS: R2Bucket;
  SOURCE_URLS: string;
  MAX_CANDIDATES: string;
  MAX_CONCURRENCY: string;
  PROBE_TIMEOUT_MS: string;
  MAX_DELAY_MS: string;
}

type Candidate = Omit<ScannedProxy, "last_checked" | "response_time_ms">;

const LATEST_KEY = "proxy-lists/latest.json";
const RETRIES = 2;

function positiveInt(value: string, fallback: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function isIPv4(ip: string): boolean {
  const parts = ip.split(".");
  return parts.length === 4 && parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function parseSource(body: string, source: string): Candidate[] {
  try {
    const parsed: unknown = JSON.parse(body);
    const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "proxies" in parsed && Array.isArray(parsed.proxies) ? parsed.proxies : [];
    return entries.flatMap((entry): Candidate[] => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as Record<string, unknown>;
      const ip = typeof value.ip === "string" ? value.ip.trim() : "";
      const port = typeof value.port === "number" ? value.port : Number(value.port);
      const region = typeof value.region === "string" ? value.region.toUpperCase() : typeof value.country === "string" ? value.country.toUpperCase() : "";
      return isIPv4(ip) && Number.isInteger(port) && port >= 1 && port <= 65535 && (region === "ID" || region === "SG")
        ? [{ ip, port, region, source }]
        : [];
    });
  } catch {
    return body.split(/\r?\n/).flatMap((line): Candidate[] => {
      const match = line.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\s+(ID|SG)$/i);
      if (!match) return [];
      const ip = match[1]!;
      const port = Number(match[2]);
      const region = match[3]!.toUpperCase() as "ID" | "SG";
      return isIPv4(ip) && port >= 1 && port <= 65535 ? [{ ip, port, region, source }] : [];
    });
  }
}

async function fetchSource(url: string): Promise<Candidate[]> {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json, text/plain;q=0.9" } });
      if (!response.ok) throw new Error(`source returned ${response.status}`);
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > 1_000_000) throw new Error("source exceeds 1 MB");
      return parseSource(await response.text(), url);
    } catch (error) {
      if (attempt === RETRIES) {
        console.error(JSON.stringify({ message: "proxy source failed", source: url, error: error instanceof Error ? error.message : String(error) }));
        return [];
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  return [];
}

async function validate(candidate: Candidate, timeoutMs: number, maxDelayMs: number): Promise<ScannedProxy | null> {
  const scheme = [443, 8443, 2053, 2083, 2087, 2096].includes(candidate.port) ? "https" : "http";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(`${scheme}://${candidate.ip}:${candidate.port}/`, { method: "HEAD", signal: controller.signal, redirect: "manual" });
      const responseTime = Date.now() - started;
      if (response.status < 500 && responseTime <= maxDelayMs) {
        return ScannedProxySchema.parse({ ...candidate, last_checked: new Date().toISOString(), response_time_ms: responseTime });
      }
      return null;
    } catch {
      if (attempt === RETRIES) return null;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function scan(env: Env): Promise<void> {
  const started = Date.now();
  const sources = env.SOURCE_URLS.split(",").map((url) => url.trim()).filter((url) => {
    try { return new URL(url).protocol === "https:"; } catch { return false; }
  });
  if (!sources.length) throw new Error("SOURCE_URLS must contain one or more HTTPS endpoints");

  const maxCandidates = positiveInt(env.MAX_CANDIDATES, 500, 2_000);
  const concurrency = positiveInt(env.MAX_CONCURRENCY, 10, 25);
  const timeoutMs = positiveInt(env.PROBE_TIMEOUT_MS, 2_000, 10_000);
  const maxDelayMs = positiveInt(env.MAX_DELAY_MS, 2_000, 10_000);
  const candidates = (await Promise.all(sources.map(fetchSource))).flat().filter((candidate, index, all) => all.findIndex((other) => other.ip === candidate.ip && other.port === candidate.port) === index).slice(0, maxCandidates);
  const valid: ScannedProxy[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (next < candidates.length) {
      const candidate = candidates[next++];
      if (!candidate) continue;
      const checked = await validate(candidate, timeoutMs, maxDelayMs);
      if (checked) valid.push(checked);
    }
  }));

  valid.sort((left, right) => left.response_time_ms - right.response_time_ms);
  const document = ProxyListSchema.parse({ generated_at: new Date().toISOString(), proxies: valid });
  const body = JSON.stringify(document);
  await env.PROXY_LISTS.put(LATEST_KEY, body, { httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=300" } });
  await env.PROXY_LISTS.put(`proxy-lists/history/${document.generated_at}.json`, body, { httpMetadata: { contentType: "application/json" } });
  console.log(JSON.stringify({ message: "proxy scan complete", sources: sources.length, candidates: candidates.length, valid: valid.length, success_rate: candidates.length ? valid.length / candidates.length : 0, duration_ms: Date.now() - started }));
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await scan(env);
  },
} satisfies ExportedHandler<Env>;
