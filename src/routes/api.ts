// API routes: /api/v1/sub, /myip, /check, /proxies
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

export function createApiRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  // GET /check - health check proxy
  app.get("/check", async (c) => {
    const target = c.req.query("target");
    if (!target) {
      return c.json({ error: "Missing target parameter" }, 400, CORS_HEADER_OPTIONS);
    }
    const [ip, port] = target.split(":");
    const result = await checkPrxHealth(ip, port || "443");
    return c.json(result, 200, CORS_HEADER_OPTIONS);
  });

  // GET /sub - subscription generator (raw, v2ray, json)
  const subHandler = async (c: any) => {
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
        // Format JSON untuk UI build page
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
  };

  app.get("/sub", subHandler);

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

  // GET /proxies - list proxies with filter & pagination (untuk /build page)
  app.get("/proxies", async (c) => {
    const q = c.req.query("q") || "";
    const ccParam = c.req.query("cc") || "";
    const cc = ccParam ? ccParam.split(",").filter(Boolean) : [];
    const port = c.req.query("port");
    const page = parseInt(c.req.query("page") || "1") || 1;
    const limit = Math.min(parseInt(c.req.query("limit") || "20") || 20, 100);

    const prxBankUrl = c.env.PRX_BANK_URL;
    let items = await getPrxList(prxBankUrl);

    // Filter by country (hanya jika cc tidak kosong)
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

    // Daftar negara unik (dari data sebelum hasil filter) untuk chips filter
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
  });

  return app;
}
