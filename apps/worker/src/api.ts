import type { SubQuery, Proxy } from "@bits-vpn/shared";
import { SubQuerySchema } from "@bits-vpn/shared";
import { Hono } from "hono";
import { getCachedSub, getScannedProxies, setCachedSub, queryProxies } from "./proxy";
import { checkProxyHealth } from "./health";
import type { Env } from "./env";
import { cors } from "hono/cors";

/** TextEncoder helper for plain-text subscription bodies. */
const enc = new TextEncoder();

function renderRaw(rows: Proxy[]): string {
  return rows
    .map((p) => `vless://${p.ip}:${p.port}?encryption=none&security=tls#${p.country}-${p.org}`)
    .join("\n");
}

function renderJson(rows: Proxy[]): string {
  return JSON.stringify(rows, null, 2);
}

function render(format: SubQuery["format"], rows: Proxy[]): { bytes: ArrayBuffer; ct: string } {
  switch (format) {
    case "raw":
    case "v2ray":
      return { bytes: enc.encode(renderRaw(rows)).buffer, ct: "text/plain; charset=utf-8" };
    default:
      return { bytes: enc.encode(renderJson(rows)).buffer, ct: "application/json; charset=utf-8" };
  }
}

export const apiApp = new Hono<{ Bindings: Env }>();

apiApp.use("*", cors());

apiApp.get("/api/v1/sub", async (c) => {
  const parsed = SubQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "invalid query" }, 400);
  const q = parsed.data;

  // cache hit
  const cached = await getCachedSub(c.env, q);
  if (cached) {
    return new Response(cached.bytes, { headers: { "Content-Type": cached.contentType } });
  }

  const rows = await queryProxies(c.env, q);
  const { bytes, ct } = render(q.format, rows);
  await setCachedSub(c.env, q, bytes);

  return new Response(bytes, { headers: { "Content-Type": ct } });
});

apiApp.get("/api/v1/proxies", async (c) => {
  const region = c.req.query("region")?.toUpperCase();
  if (region && region !== "ID" && region !== "SG") return c.json({ error: "region must be ID or SG" }, 400);
  try {
    const list = await getScannedProxies(c.env, region);
    return list ? c.json(list) : c.json({ error: "proxy list unavailable" }, 503);
  } catch (error) {
    console.error(JSON.stringify({ message: "read scanned proxy list failed", error: error instanceof Error ? error.message : String(error) }));
    return c.json({ error: "proxy list unavailable" }, 503);
  }
});

apiApp.get("/api/v1/check", async (c) => {
  const target = c.req.query("target") || c.req.query("ip") || "";
  const [ip, port] = target.split(":");
  if (!ip) return c.json({ error: "Missing target or ip query" }, 400);
  const result = await checkProxyHealth(ip, port || "443");
  return c.json(result);
});

apiApp.get("/api/v1/myip", (c) => {
  const cf = c.req.raw.cf as Record<string, unknown> | undefined;
  return c.json({
    ip:
      c.req.header("cf-connecting-ipv6") ||
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-real-ip"),
    colo: c.req.header("cf-ray")?.split("-")[1],
    country: cf?.country,
    city: cf?.city,
    asn: cf?.asn,
  });
});

apiApp.get("/api/v1/health", (c) => c.json({ status: "ok" }));