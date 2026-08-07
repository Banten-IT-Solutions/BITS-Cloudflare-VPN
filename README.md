# BITS VPN

Enterprise-grade VPN management platform powered by Cloudflare Workers and Cloudflare Pages.

<p align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/Nuxt_4-18A8F0?style=for-the-badge&logo=nuxt.js" alt="Nuxt 4">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

## Overview

BITS VPN is a modern VPN solution that combines Cloudflare Workers for high-performance tunnel backend with a Nuxt 4 web interface for proxy management. Supports multiple protocols (VLESS, Trojan, Shadowsocks, VMess) with features including subscription API, real-time health monitoring, and multiple export formats.

## Features

- **Multi-Protocol Support** - VLESS, Trojan, Shadowsocks, VMess
- **Cloudflare Workers Backend** - Serverless tunnel with edge performance
- **Modern Web Interface** - Nuxt 4 + Vue 3 + Tailwind CSS
- **Subscription API** - Query parameters for filtering by country, protocol, port
- **Real-time Monitoring** - Proxy health check with latency display
- **Export Formats** - Clash, Mihomo, sing-box, raw, provider
- **Code Quality** - ESLint + Prettier configured, TypeScript
- **Auto Updates** - Dependabot for dependency updates

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Nuxt 4, Vue 3, Tailwind CSS, Pinia |
| Backend | Cloudflare Workers, KV, Cache |
| Deployment | Cloudflare Pages, Cloudflare Workers |
| Code Quality | ESLint, Prettier, TypeScript |

## Repository Structure

```
Cloudflare-VPN/
├── Web/                    # Frontend application (Nuxt 4)
│   ├── pages/              # Build, Convert, Monitor pages
│   ├── components/         # Reusable Vue components
│   ├── stores/             # Pinia state management
│   ├── utils/              # Configuration parsers
│   └── public/             # Static assets
│
├── Proxy/                  # Backend (Cloudflare Workers)
│   ├── _worker.js          # Main worker entry point
│   ├── helper/             # Scanner utilities
│   └── wrangler.toml       # Worker configuration
│
└── .github/
    └── dependabot.yml      # Auto dependency updates
```

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account
- npm or bun

### Frontend Development

```bash
cd Web
npm install
npm run dev
```

Access development server at `http://localhost:3000`.

### Production Build

```bash
cd Web
npm run build
```

### Deployment

**Frontend to Cloudflare Pages:**

```bash
cd Web
npm run build
npx wrangler pages deploy .output/public --project-name=bits-vpn
```

**Backend to Cloudflare Workers:**

```bash
cd Proxy
npx wrangler deploy
```

Or configure custom domain in `wrangler.toml`:

```toml
routes = [
  { pattern = "vpn.bits.co.id", custom_domain = true }
]
```

## API Reference

### Subscription Endpoint

```
GET /api/v1/sub
```

**Query Parameters:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| `cc` | Country code filter | `cc=ID,SG` |
| `format` | Output format | `format=clash` |
| `limit` | Proxy limit | `limit=10` |
| `vpn` | Protocol filter | `vpn=vless,trojan` |
| `port` | Port filter | `port=443` |
| `domain` | Server domain | `domain=zoom.us` |

**Supported Formats:** `raw`, `clash`, `mihomo`, `provider`, `v2ray`

### Health Check Endpoint

```
GET /api/v1/check?ip=<ip:port>
```

Returns JSON with `proxyip` (boolean) and `delay` (ms).

### MyIP Endpoint

```
GET /api/v1/myip
```

Returns client IP information including IP address, country, city, and ISP.

## Pages Overview

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/build` | Build & manage proxy list |
| `/convert` | Convert URLs to various formats |
| `/monitor` | Real-time proxy health monitoring |

## Configuration

Edit profile settings in `/build` page via Settings modal:

- **Server**: Target server (default: `support.zoom.us`)
- **Host**: VPN host (default: `vpn.bits.co.id`)
- **Protocol**: VLESS, Trojan, Shadowsocks, VMess
- **TLS**: Enable/disable TLS
- **Wildcard**: Enable subdomain wildcard

### Environment Variables

Create `.env` file in `Web/` directory:

```env
NUXT_PUBLIC_API_BASE=https://vpn.bits.co.id
NUXT_PUBLIC_GITHUB_PROXY_URL=https://raw.githubusercontent.com/bitscoid/Cloudflare-VPN/refs/heads/main/Proxy/proxyList.txt
NUXT_PUBLIC_FLAG_CDN=https://hatscripts.github.io/circle-flags/flags
```

## Development Scripts

```bash
# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code with Prettier
npm run format

# TypeScript check (Proxy)
cd Proxy && npm run typecheck
```

## License

MIT License - Feel free to use for personal or commercial purposes.

---

<p align="center">Built with ☁️ Cloudflare</p>