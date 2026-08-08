# BITS-Cloudflare-VPN

VPN serverless (VLESS / VMess / Trojan via WebSocket) berjalan di Cloudflare Workers — IP negara (colocation) gratis melalui CDN Cloudflare, disediakan oleh [Banten IT Solutions](https://bitsco.id).

> **Arsitektur:** Backend menggunakan [Hono](https://hono.dev) framework, frontend Alpine.js (static HTML), relay WebSocket vanilla untuk maksimum performa.

## Fitur

- 🚀 **3 halaman frontend interaktif** — Landing, Build config VPN, Convert URL
- 🧩 Protokol **VLESS** (default), **VMess**, dan **Trojan** via WebSocket
- 📍 Filter proxy berdasarkan negara (colo)
- 🔌 Port `443` (TLS) / `80` (plain)
- 🖥️ Format subscription: `raw`, `v2ray` (base64), `json`
- 🔨 **Build page** — Pilih proxy + config SNI/CDN/Wildcard → generate vless:// + Clash YAML
- 🔄 **Convert page** — vless:// → Clash YAML (client-side, no server)
- 🗃️ IP pool auto-update dari GitHub via CI workflow (setiap 30 menit)
- 🛸 Wildcard subdomain `*.yuliana.my.id` mendukung tunnel

## Quick Start

### 1. Deploy Worker

```sh
npm i -g wrangler
git clone https://github.com/bitscoid/BITS-Cloudflare-VPN
cd BITS-Cloudflare-VPN
wrangler deploy
```

### 2. Setup Custom Domain (Opsional)

Edit `wrangler.toml`:

```toml
[[routes]]
pattern = "yuliana.my.id"          # custom domain
custom_domain = true

[[routes]]
pattern = "*.yuliana.my.id/*"      # wildcard subdomain
zone_name = "yuliana.my.id"

[assets]
directory = "./assets"              # static frontend files
binding = "ASSETS"
```

Tambahkan DNS wildcard record di Cloudflare dashboard:
```
*.yuliana.my.id  →  A/AAAA  (proxied)
```

### 3. Gunakan

Buka `https://yuliana.my.id/build` di browser:
1. Load proxy list → pilih proxy
2. Konfigurasi: Mode (SNI/CDN), Bug domain, Wildcard, SSL
3. Generate → Copy vless:// URLs atau Clash YAML
4. Import ke v2rayN, Nekoray, Clash, atau app VPN lainnya

## Frontend Pages

| URL | Fungsi |
|---|---|
| `/` | **Landing** — Status worker, myip, dokumentasi API |
| `/build` | **Build VPN** — Pilih proxy + dialog config (SNI/CDN, Bug, Wildcard, SSL) → generate vless:// + Clash YAML |
| `/convert` | **Convert** — Paste vless:// URLs → Clash YAML format (pure client-side) |

## API Endpoints

Base URL: `https://yuliana.my.id/api`

### `GET /api/sub` — Subscription Generator

Generate vless/vmess/trojan URLs untuk import ke aplikasi VPN.

**Query Parameters:**

| Parameter | Nilai | Default |
|---|---|---|
| `vpn` | `vless`, `vmess`, `trojan` (comma separated) | `vless` |
| `cc` | Kode negara `ID`, `SG`, `US`, ... (comma separated) | semua |
| `port` | `443`, `80` | `443` |
| `limit` | Jumlah akun (1-200) | `10` |
| `format` | `raw`, `v2ray`, `json` | `raw` |
| `domain` | Custom SNI/domain | hostname request |

**Format Response:**
- `raw` → plaintext URLs (satu per baris)
- `v2ray` → base64(URLs) — untuk subscription v2rayN
- `json` → `[{index, protocol, link, remark}]` — untuk UI

**Contoh:**

```bash
# VLESS, filter Indonesia, 5 akun, format raw
curl "https://yuliana.my.id/api/sub?vpn=vless&cc=ID&limit=5&format=raw"

# VMess + Trojan mix, format v2ray (base64)
curl "https://yuliana.my.id/api/sub?vpn=vmess,trojan&limit=10&format=v2ray"

# JSON format (untuk UI/parsing)
curl "https://yuliana.my.id/api/sub?vpn=vless&limit=3&format=json"
```

### `GET /api/myip` — Client IP Info

Cek IP client, Cloudflare colo, country, city.

**Response:**
```json
{
  "ip": "180.242.129.140",
  "colo": "SIN",
  "city": "Bekasi",
  "country": "ID",
  "httpProtocol": "HTTP/2",
  ...
}
```

### `GET /api/proxies` — Proxy List

List proxy dengan filter & pagination (digunakan oleh build page).

**Query Parameters:**

| Parameter | Fungsi |
|---|---|
| `cc` | Filter country: `ID,SG,US` |
| `q` | Search IP/org (substring) |
| `port` | Filter port: `443` atau `80` |
| `page` | Halaman (default: `1`) |
| `limit` | Items per page (max: `100`) |

**Response:**
```json
{
  "count": 561,
  "page": 1,
  "pages": 29,
  "items": [
    {"prxIP": "1.2.3.4", "prxPort": "443", "country": "ID", "org": "PT Telkom Indonesia"}
  ]
}
```

### `GET /api/check` — Health Check

Test koneksi ke proxy (port probe). ⚠️ Rate-limit dianjurkan untuk mencegah abuse.

**Query:**
- `target` — format `ip:port`

**Response:**
```json
{
  "ip": "1.2.3.4",
  "port": "443",
  "success": true,
  "latency": 123
}
```

## Build Page — Config Dialog

Halaman `/build` memungkinkan generate vless:// custom dengan konfigurasi:

| Field | Opsi | Fungsi |
|---|---|---|
| **Mode** | SNI / CDN | SNI: server=base domain, servername=Bug; CDN: server=Bug, servername=base |
| **Bug** | domain target (mis. `support.zoom.us`) | Domain untuk SNI masking atau server CDN |
| **Wildcard** | Ya / Tidak | Jika Ya, gunakan subdomain wildcard `*.yuliana.my.id` |
| **Subdomain** | input (jika wildcard) | Prefix subdomain: `xyz` → `xyz.yuliana.my.id` |
| **SSL** | 443 / 80 | Port & TLS on/off |

**Mapping Config → Output:**

| Mode | Wildcard | `server` | `servername` + Host |
|---|---|---|---|
| SNI | Tidak | `yuliana.my.id` | `Bug` |
| SNI | **Ya** | `subdomain.yuliana.my.id` | `Bug` |
| CDN | Tidak | `Bug` | `yuliana.my.id` |
| CDN | **Ya** | `Bug` | `subdomain.yuliana.my.id` |

**Output:**
- Tab **URI**: daftar vless:// URLs (untuk copy/paste)
- Tab **YAML**: Clash proxies config (untuk import ke Clash)

## WebSocket Relay

Worker menerima WebSocket upgrade dengan path routing:

| Path Pattern | Behavior |
|---|---|
| `/1.2.3.4-443` | Relay ke proxy `1.2.3.4:443` |
| `/ID,SG` | Random proxy dari KV country code (ID atau SG) |
| `/ID` | Random proxy dari KV country code ID (path length 3) |

Protokol yang di-support: VLESS, VMess, Trojan (auto-detect via protocol sniffer).

## Development

### Struktur Project

```
src/
  index.ts              # Entry: WS upgrade → relay; else Hono app
  core/
    relay.ts            # WebSocket handler + protocol parsers (VLESS/VMess/Trojan)
    lists.ts            # Proxy list fetchers (getKVPrxList, getPrxList)
    constants.ts        # PORTS, PROTOCOLS, CORS, SALT constants
  routes/
    api.ts              # API endpoints (/sub, /myip, /check, /proxies)
assets/
  index.html            # Landing page (Alpine.js)
  build.html            # Build VPN config page
  convert.html          # Convert vless:// → Clash YAML
  shared.css            # Dark theme CSS
```

### Local Development

```bash
# Install dependencies
bun install

# Run dev server
wrangler dev

# Type check
bun x tsc --noEmit

# Deploy
wrangler deploy
```

### CI/CD Workflows

- **`scan.yaml`** — Every 30 menit: health-check proxies, update `proxy.txt` & `KV.json`, commit
- **`deploy.yml`** — Manual trigger: deploy worker ke Cloudflare (input: `ref` branch)

## Panduan Penting

### Free Tier Limits

- **100k requests / hari** (reset harian)
- 1 WebSocket session = 1 request
- ⚠️ **Health-check otomatis (Clash)** dengan `interval: 30s` → ~2.8k request/hari per proxy. Gunakan `interval: 300` (5 menit) atau lebih untuk hemat kuota.

### Clash Config Best Practice

```yaml
proxy-providers:
  vpn:
    type: http
    url: "https://yuliana.my.id/api/sub?vpn=vless&limit=20&format=raw"
    interval: 300           # 5 menit (bukan 30 detik!)
    health-check:
      enable: true
      interval: 300         # 5 menit
      url: http://cp.cloudflare.com/generate_204
```

### Security Notes

- Endpoint `/api/check` (port probe) terbuka publik — pertimbangkan rate-limit atau hapus jika tidak digunakan
- UUID subscription di-generate random per request — tidak ada autentikasi
- `skip-cert-verify: true` pada Clash config — wajar untuk worker CDN, tapi pahami risikonya

## Tech Stack

- **Backend:** Hono v4 (Cloudflare Workers)
- **Frontend:** Alpine.js v3 (CDN, no build step)
- **Runtime:** Cloudflare Workers (V8 isolates)
- **Storage:** GitHub (KV.json, proxy.txt via raw.githubusercontent.com)
- **CI:** GitHub Actions (scan proxy every 30 min)
- **Language:** TypeScript 7.0.2

## Contributing

1. Fork repo
2. Buat branch feature (`git checkout -b feat/amazing-feature`)
3. Commit (`git commit -m 'feat: add amazing feature'`)
4. Push (`git push origin feat/amazing-feature`)
5. Buat Pull Request

## License

MIT License — lihat [LICENSE](LICENSE)

---

**Dibuat dengan ❤️ oleh [Banten IT Solutions](https://bitsco.id)**

Worker ini gratis, tidak perlu bayar. Jika bermanfaat, ⭐ star repo ini!
