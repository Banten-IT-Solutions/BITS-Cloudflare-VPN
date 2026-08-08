// Entry point: WS relay + Hono app
import { Hono } from "hono";
import { websocketHandler, setPrxIP } from "./core/relay";
import { getKVPrxList } from "./core/lists";
import { createApiRoutes, createCheckRoute } from "./routes/api";
import { CORS_HEADER_OPTIONS } from "./core/constants";

interface Env {
  PRX_BANK_URL?: string;
  KV_PRX_URL?: string;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

// Mount API routes
app.route("/api/v1", createApiRoutes());
app.route("/", createCheckRoute());

// Serve static assets untuk halaman frontend
const serveAsset = (filename: string) => async (c: any) => {
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = `/${filename}`;
  return c.env.ASSETS.fetch(new Request(assetUrl.toString()));
};

app.get("/", serveAsset("index.html"));
app.get("/build", serveAsset("build.html"));
app.get("/sub", serveAsset("build.html")); // Legacy /sub → build
app.get("/convert", serveAsset("convert.html"));
app.get("/shared.css", serveAsset("shared.css"));

// Fallback 404
app.notFound((c) => c.json({ error: "Not found" }, 404, CORS_HEADER_OPTIONS));

// Export default fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const upgradeHeader = request.headers.get("Upgrade");

      // Handle WebSocket upgrade untuk relay
      if (upgradeHeader === "websocket") {
        const prxMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);

        if (url.pathname.length == 3 || url.pathname.match(",")) {
          const prxKeys = url.pathname.replace("/", "").toUpperCase().split(",");
          const prxKey = prxKeys[Math.floor(Math.random() * prxKeys.length)];
          const kvPrx = await getKVPrxList(env.KV_PRX_URL);

          const prxIP = kvPrx[prxKey][Math.floor(Math.random() * kvPrx[prxKey].length)];
          setPrxIP(prxIP);

          return await websocketHandler(request);
        } else if (prxMatch) {
          setPrxIP(prxMatch[1]);
          return await websocketHandler(request);
        }
      }

      // Semua request non-WS → Hono app
      return app.fetch(request, env, ctx);
    } catch (err: any) {
      return new Response(`An error occurred: ${err.toString()}`, {
        status: 500,
        headers: CORS_HEADER_OPTIONS,
      });
    }
  },
};
