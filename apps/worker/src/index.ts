import { Hono } from "hono";
import type { Env } from "./env";
import { apiApp } from "./api";
import { handleTunnel, isTunnelRequest } from "./tunnel";

const app = new Hono<{ Bindings: Env }>();
app.route("/", apiApp);

// Optional: re-export TSo compile the shared lib references in this bundle
app.notFound(async (c) => {
  // Hono's notFound is used as the final fallback: serve static assets.
  // Because Hono route matching runs first, WebSocket/API paths handled above
  // are never routed here.
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return res;
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ── Tunnel (WebSocket) ───────────────────────────────────────────────
    if (isTunnelRequest(url, request)) {
      return handleTunnel(request, url);
    }

    // ── API router + static fallback ─────────────────────────────────────
    return app.fetch(request, env, ctx);
  },
};