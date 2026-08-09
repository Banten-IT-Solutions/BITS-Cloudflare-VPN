// API routes: /sub, /myip, /check, /proxies
import { Hono } from "hono";
import { getPrxList, getKVPrxList, type ProxyEntry } from "../core/lists";
import { checkPrxHealth } from "../core/relay";
import {
  PORTS,
  PROTOCOLS,
  CORS_HEADER_OPTIONS,
  horse,
  neko,
  v2,
  getFlagEmoji,
  shuffleArray,
} from "../core/constants";

interface Env {
  PRX_BANK_URL?: string;
  KV_PRX_URL?: string;
}

// IP rate limiter: Map<clientIp, timestamp[]>
const rateLimitCache = new Map<string, number[]>();
const LIMIT_WINDOW_MS = 10 * 1000; // 10 seconds
const MAX_REQUESTS = 12;           // Max 12 requests per window

export function createApiRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  // GET /check - health check proxy
  app.get("/check", async (c) => {
    try {
      const clientIP = c.req.header("cf-connecting-ip") || "unknown";
      const now = Date.now();
      let timestamps = rateLimitCache.get(clientIP) || [];
      
      // Remove stale timestamps
      timestamps = timestamps.filter(t => now - t < LIMIT_WINDOW_MS);
      
      if (timestamps.length >= MAX_REQUESTS) {
        return c.json({ error: "Too many requests. Please slow down." }, 429, CORS_HEADER_OPTIONS);
      }
      timestamps.push(now);
      rateLimitCache.set(clientIP, timestamps);

      const target = c.req.query("target");
      if (!target) {
        return c.json({ error: "Missing target parameter" }, 400, CORS_HEADER_OPTIONS);
      }

      // Parse IP:PORT with validation
      const parts = target.split(":");
      if (parts.length !== 2) {
        return c.json({ error: "Invalid target format. Expected IP:PORT" }, 400, CORS_HEADER_OPTIONS);
      }

      const [ip, portStr] = parts;
      const port = parseInt(portStr, 10);

      // Validate IP format (basic IPv4 check)
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4Regex.test(ip)) {
        return c.json({ error: "Invalid IP address format" }, 400, CORS_HEADER_OPTIONS);
      }

      // Validate port range
      if (isNaN(port) || port < 1 || port > 65535) {
        return c.json({ error: "Invalid port number" }, 400, CORS_HEADER_OPTIONS);
      }

      // Restrict to known proxy list only (prevent arbitrary probing)
      const prxBankUrl = c.env.PRX_BANK_URL;
      const proxyList = await getPrxList(prxBankUrl);
      const isAllowed = proxyList.some(prx => prx.prxIP === ip && prx.prxPort === portStr);

      if (!isAllowed) {
        return c.json({ error: "Target not in allowed proxy list" }, 403, CORS_HEADER_OPTIONS);
      }

      const result = await checkPrxHealth(ip, portStr);
      return c.json(result, 200, CORS_HEADER_OPTIONS);
    } catch (error: any) {
      console.error("Error in /check:", error);
      return c.json({ error: "Internal server error", message: error.message }, 500, CORS_HEADER_OPTIONS);
    }
  });

  // GET /sub - subscription generator (raw, v2ray, json)
  const subHandler = async (c: any) => {
    try {
      const url = new URL(c.req.url);
      const domain = url.hostname;
      const serviceName = domain.split(".")[0];

      const filterCC = c.req.query("cc")?.split(",") || [];
      const filterPort = c.req.query("port")?.split(",").map((p: string) => parseInt(p)) || PORTS;
      const filterVPN = c.req.query("vpn")?.split(",").filter((p: string) => PROTOCOLS.includes(p)) || [];
      const protocols = filterVPN.length ? filterVPN : [atob(neko)];
      const filterLimit = parseInt(c.req.query("limit") || "10") || 10;
      const filterFormat = c.req.query("format") || "raw";
      const fillerDomain = c.req.query("domain") || domain;

      const prxBankUrl = c.req.query("prx-list") || c.env.PRX_BANK_URL;
      let prxList = await getPrxList(prxBankUrl);

    if (filterCC.length) {
      prxList = prxList.filter((prx) => filterCC.includes(prx.country));
    }
    shuffleArray(prxList);

    const uuid = crypto.randomUUID();
    const result: string[] = [];

    for (const prx of prxList) {
      const uri = new URL(`${atob(horse)}://${fillerDomain}`);
      uri.searchParams.set("encryption", "none");
      uri.searchParams.set("type", "ws");
      uri.searchParams.set("host", domain);

      for (const port of filterPort) {
        for (const protocol of protocols) {
          if (result.length >= filterLimit) break;

          uri.protocol = protocol;
          uri.port = port.toString();
          uri.username = uuid;

          uri.searchParams.set("security", port == 443 ? "tls" : "none");
          uri.searchParams.set("sni", port == 80 && protocol == atob("dm1lc3M=") ? "" : domain);
          uri.searchParams.set("path", `/${prx.prxIP}-${prx.prxPort}`);

          uri.hash = `${result.length + 1} ${getFlagEmoji(prx.country)} ${prx.org} WS ${
            port == 443 ? "TLS" : "NTLS"
          } [BITS Cloudflare VPN]`;
          result.push(uri.toString());
        }
      }
    }

    let finalResult: string;
    switch (filterFormat) {
      case "raw":
        finalResult = result.join("\n");
        break;
      case atob(v2):
        finalResult = btoa(result.join("\n"));
        break;
      case "json":
        // JSON format for build UI
        const jsonResult = result.map((link, i) => {
          const [proto, rest] = link.split("://");
          const hashIndex = rest.indexOf("#");
          const remark = hashIndex !== -1 ? decodeURIComponent(rest.substring(hashIndex + 1)) : "";
          return { index: i + 1, protocol: proto, link, remark };
        });
        return c.json(jsonResult, 200, CORS_HEADER_OPTIONS);
      default:
        return c.text(`Unsupported format "${filterFormat}". Supported formats: raw, ${atob(v2)}, json.`, 400, CORS_HEADER_OPTIONS);
    }

    return c.text(finalResult, 200, CORS_HEADER_OPTIONS);
    } catch (error: any) {
      console.error("Error in /sub:", error);
      return c.json({ error: "Failed to generate subscription", message: error.message }, 500, CORS_HEADER_OPTIONS);
    }
  };

  app.get("/sub", subHandler);

  // GET /countries - country list + proxy count from KV list (for /country page)
  app.get("/countries", async (c) => {
    try {
      const kvPrx = await getKVPrxList(c.env.KV_PRX_URL);
      const countries = Object.entries(kvPrx)
        .filter(([, arr]) => Array.isArray(arr) && arr.length > 0)
        .map(([code, arr]) => ({ code: code.toUpperCase(), count: arr.length }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
      return c.json({ count: countries.length, countries }, 200, CORS_HEADER_OPTIONS);
    } catch (error: any) {
      console.error("Error in /countries:", error);
      return c.json({ error: "Failed to fetch countries", message: error.message }, 500, CORS_HEADER_OPTIONS);
    }
  });

  // GET /myip - client IP info
  app.get("/myip", async (c) => {
    const req = c.req.raw;
    return c.json(
      {
        ip:
          req.headers.get("cf-connecting-ipv6") ||
          req.headers.get("cf-connecting-ip") ||
          req.headers.get("x-real-ip"),
        colo: req.headers.get("cf-ray")?.split("-")[1],
        ...(req as any).cf,
      },
      200,
      CORS_HEADER_OPTIONS,
    );
  });

  // GET /proxies - proxy list with filter & pagination (for /build page)
  app.get("/proxies", async (c) => {
    try {
      const q = c.req.query("q") || "";
      const ccParam = c.req.query("cc") || "";
      const cc = ccParam ? ccParam.split(",").filter(Boolean) : [];
      const port = c.req.query("port");
      const pageRaw = parseInt(c.req.query("page") || "1") || 1;
      const page = Math.max(1, pageRaw); // Clamp to >= 1
      const limitRaw = parseInt(c.req.query("limit") || "20") || 20;
      const limit = Math.min(Math.max(1, limitRaw), 100); // Clamp 1-100

      const prxBankUrl = c.env.PRX_BANK_URL;
      let items = await getPrxList(prxBankUrl);

      // Filter by country only when cc is not empty
      if (cc.length > 0 && cc[0] !== "") {
        items = items.filter((prx) => cc.includes(prx.country));
      }

      // Filter by port
      if (port) {
        items = items.filter((prx) => prx.prxPort === port);
      }

      // Filter by search query (ip, country, or org)
      if (q) {
        const query = q.toLowerCase();
        items = items.filter(
          (prx) =>
            prx.prxIP.toLowerCase().includes(query) ||
            prx.country.toLowerCase().includes(query) ||
            prx.org.toLowerCase().includes(query),
        );
      }

      const count = items.length;
      const pages = Math.ceil(count / limit);
      const offset = (page - 1) * limit;
      const paginatedItems = items.slice(offset, offset + limit);

      // Unique country list from pre-filter data for filter chips
      const countryCounts = new Map<string, number>();
      for (const prx of items) {
        countryCounts.set(prx.country, (countryCounts.get(prx.country) || 0) + 1);
      }
      const countries = Array.from(countryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({ code, count }));

      return c.json(
        {
          count,
          page,
          pages,
          items: paginatedItems,
          countries,
        },
        200,
        CORS_HEADER_OPTIONS,
      );
    } catch (error: any) {
      console.error("Error in /proxies:", error);
      return c.json({ error: "Failed to fetch proxy list", message: error.message }, 500, CORS_HEADER_OPTIONS);
    }
  });

  return app;
}
