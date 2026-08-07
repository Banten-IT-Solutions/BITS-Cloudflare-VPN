# BITS VPN

VLESS proxy relay on Cloudflare Workers — single Worker serves the tunnel, REST API, and static frontend.

<p align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono" alt="Hono">
  <img src="https://img.shields.io/badge/Alpine.js-8BC0D0?style=for-the-badge&logo=alpinedotjs&logoColor=black" alt="Alpine.js">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

## Overview

BITS VPN combines a VLESS-over-WebSocket tunnel relay (`cloudflare:sockets`), a subscription/health-check API (Hono), and a lightweight Alpine.js dashboard — all deployed as a single Cloudflare Worker with bound static assets.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Cloudflare Workers, `cloudflare:sockets`, `nodejs_compat` |
| API | Hono, Zod (validation) |
| Database | Cloudflare D1 (proxy metadata), KV (sub cache) |
| Frontend | Vite, Alpine.js, Tailwind CSS v4 |
| Tooling | Bun (workspaces), TypeScript, wrangler |
| CI/CD | GitHub Actions (typecheck → build → deploy) |

## Repository Structure

```
bits-vpn/
├── apps/
│   ├── worker/                 # Cloudflare Worker (API + tunnel)
│   │   ├── src/
│   │   │   ├── index.ts        # Entry: tunnel detection → Hono → static fallback
│   │   │   ├── api.ts          # REST endpoints (/api/v1/*)
│   │   │   ├── tunnel.ts       # VLESS-over-WebSocket relay
│   │   │   ├── proxy.ts        # D1 queries + KV cache layer
│   │   │   ├── health.ts       # Proxy health checker
│   │   │   └── env.ts          # Env bindings type
│   │   ├── d1/migrations/      # D1 schema migrations
│   │   └── wrangler.toml       # Worker config
│   │
│   └── web/                    # Frontend SPA
│       ├── index.html          # Single page (Alpine.js hash router)
│       ├── src/
│       │   ├── main.ts         # Alpine init
│       │   ├── store.ts        # App state (monitor, build, convert)
│       │   ├── style.css       # Tailwind v4 + fonts
│       │   └── alpine.d.ts     # Type shim
│       └── vite.config.ts      # Vite + Tailwind plugin
│
├── packages/
│   └── shared/                 # Shared Zod schemas + types
│       └── src/index.ts        # ProxySchema, SubQuerySchema, HealthCheckSchema
│
├── .github/workflows/ci.yml   # CI/CD pipeline
├── tsconfig.base.json          # Base TS config
└── package.json                # Bun workspace root
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (latest)
- Cloudflare account with D1 + KV enabled

### Setup

```bash
# Install dependencies
bun install

# Build shared package (required before worker typecheck)
bun run --filter @bits-vpn/shared build

# Apply D1 migrations locally
bun run migrate:local
```

### Development

```bash
# Start frontend dev server (http://localhost:5173)
bun run dev:web

# Start worker dev server (proxies API requests)
bun run dev:worker
```

> The Vite dev server proxies `/api` requests to `https://vpn.bits.co.id` for local development.

### Build & Typecheck

```bash
# Typecheck all packages
bun run typecheck

# Build frontend + worker
bun run build
```

## Deployment

CI/CD runs automatically on push to `main`:

1. **Verify** — `bun install` → `typecheck` → `build`
2. **Deploy** — Build frontend → Apply D1 migrations → `wrangler deploy`

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers/D1/KV permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

### wrangler.toml Setup

Replace placeholder IDs before first deploy:

```toml
[[d1_databases]]
database_id = "your-d1-database-id"    # ← replace

[[kv_namespaces]]
id = "your-kv-namespace-id"            # ← replace
```

Custom domains:

```toml
routes = [
  { pattern = "vpn.bits.co.id", custom_domain = true },
  { pattern = "support.zoom.us.vpn.bits.co.id", custom_domain = true },
]
```

## API Reference

All endpoints are CORS-enabled.

### `GET /api/v1/sub`

Query proxy subscription list from D1 with KV caching (5-min TTL).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cc` | string | — | Country codes, comma-separated (`ID,SG`) |
| `vpn` | string | — | Protocols, comma-separated (`vless,trojan`) |
| `port` | number | — | Port filter (`443`) |
| `domain` | string | — | Domain filter |
| `format` | enum | `raw` | `raw` \| `v2ray` \| `clash` \| `mihomo` \| `provider` |
| `limit` | number | `50` | Max results (1–500) |

**Response formats:**
- `raw`, `v2ray` → `text/plain` — VLESS URIs, newline-separated
- `clash`, `mihomo`, `provider` → `application/json` — JSON array of proxy objects

### `GET /api/v1/check`

Health check a proxy via HEAD request (2s timeout, 15s in-memory cache).

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` or `ip` | string | Target in `ip:port` format |

```json
{
  "error": false,
  "result": {
    "proxy": "1.1.1.1",
    "port": 443,
    "proxyip": true,
    "delay": 42
  }
}
```

TLS ports: `443`, `8443`, `2053`, `2083`, `2087`, `2096` → HTTPS probe; others → HTTP.

### `GET /api/v1/myip`

Returns client IP info from Cloudflare headers.

```json
{
  "ip": "203.0.113.1",
  "colo": "SIN",
  "country": "ID",
  "city": "Jakarta",
  "asn": 13335
}
```

### `GET /api/v1/health`

```json
{ "status": "ok" }
```

## WebSocket Tunnel

VLESS-over-WebSocket relay using `cloudflare:sockets`.

**Connection:** Any request with `Upgrade: websocket` header is handled as tunnel.

**Path formats:**
- `/<IP>:<port>`, `/<IP>-<port>`, `/<IP>=<port>` — direct proxy target
- `/<CC>` or `/<CC1>,<CC2>` — random country-based selection

**Protocol:** VLESS v0 header parsing → TCP relay via `cloudflare:sockets`. UDP is rejected. Early data supported via `sec-websocket-protocol` header (base64 URL-safe encoded).

## D1 Schema

```sql
CREATE TABLE proxies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ip              TEXT NOT NULL,
  port            INTEGER NOT NULL,
  country         TEXT NOT NULL DEFAULT 'XX',
  protocol        TEXT NOT NULL DEFAULT 'vless',
  domain          TEXT NOT NULL DEFAULT '',
  org             TEXT NOT NULL DEFAULT 'Unknown',
  tls             INTEGER NOT NULL DEFAULT 1,
  healthy         INTEGER,
  delay_ms        INTEGER,
  last_checked_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ip, port)
);
-- Indexes: country, protocol, port, domain
```

## Frontend Pages

Hash-routed SPA (`#/monitor`, `#/build`, `#/convert`):

| Route | Status | Description |
|-------|--------|-------------|
| `#/monitor` | Active | Proxy health monitor — checks latency via `/api/v1/check` |
| `#/build` | Stub | Proxy list configuration (placeholder) |
| `#/convert` | Stub | URL/format converter (placeholder) |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Build shared + web + worker |
| `bun run dev:web` | Start Vite dev server |
| `bun run dev:worker` | Start wrangler dev server |
| `bun run typecheck` | Typecheck all packages |
| `bun run migrate:local` | Apply D1 migrations locally |
| `bun run migrate:remote` | Apply D1 migrations to production |

## License

MIT License

---

<p align="center">Built on Cloudflare Workers</p>
