# BITS Cloudflare VPN

VPN Serverless (VLESS / VMess / Trojan via WebSocket) yang berjalan di infrastruktur Cloudflare Workers. Proyek ini memfasilitasi pembuatan konfigurasi VPN gratis dengan IP proxy negara tujuan (colocation) yang terus diperbarui secara otomatis, dikembangkan oleh [Banten IT Solutions](https://bits.co.id).

> **Arsitektur:** Backend berbasis framework [Hono](https://hono.dev), frontend menggunakan Alpine.js dengan tema Glassmorphic premium, dan core relay WebSocket vanilla dioptimalkan untuk throughput maksimum dan latency minimal.

---

## Fitur Utama

- 🚀 **Empat Halaman Frontend**:
  - `/` — Landing page (hero + kartu CTA menuju seluruh tools).
  - `/build` — **Provider Build**: konfigurator per-server (IP tujuan langsung).
  - `/country` — **Country Build**: konfigurator berbasis path negara (`/ID`, `/ID,SG`) yang memilih proxy acak dari daftar negara (KV).
  - `/convert` — **Converter**: konversi dua arah URI (VLESS / VMess / Trojan) ↔ Clash YAML.
- 🧩 **Multi-Protocol Support** — Mendukung **VLESS** (default), **VMess**, dan **Trojan** via WebSocket (di-decode menggunakan server-side sniffing).
- 📍 **Colocation Filtering** — Filter daftar proxy aktif berdasarkan negara (Colo).
- ⚡ **Real-time Latency & Ping** — Pengecekan latensi langsung ke proxy target dengan optimasi client-side caching dan input debouncing.
- 🔌 **Dynamic Port & SSL** — Mendukung Port `443` (TLS) / Port `80` (Plain).
- 🖥️ **Subscription Formats** — Format output `raw`, `v2ray` (Base64 subscription), dan `json`.
- 🌍 **Country Path Builder** — Generate konfigurasi dengan path `/ID`, `/SG`, atau kombinasi `/ID,SG`; relay memilih proxy acak dari daftar negara via KV.
- 🔁 **URI ↔ Clash Converter** — Konversi VLESS/VMess/Trojan URI menjadi Clash YAML dan sebaliknya.
- 🔨 **Config Builder Dialog** — Generate URI protocol + Clash Proxy YAML dengan parameter SNI, CDN, atau Wildcard Subdomain.
- 🗃️ **Automated IP Sync** — Daftar IP proxy sehat disinkronkan berkala melalui GitHub Actions ke `proxy.txt` dan `KV.json`.

---

## Quick Start

### 1. Prasyarat Deployment
Pastikan Anda telah menginstal Node.js/Bun dan Wrangler CLI secara global:
```sh
npm install -g wrangler
# atau dengan Bun
bun install -g wrangler
```

### 2. Kloning dan Instalasi
```sh
git clone https://github.com/Banten-IT-Solutions/BITS-Cloudflare-VPN.git
cd BITS-Cloudflare-VPN
bun install # atau npm install
```

### 3. Konfigurasi wrangler.toml
Sesuaikan `wrangler.toml` sebelum melakukan deployment (contoh konfigurasi saat ini):
```toml
name = "vpn"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat_v2"]

[vars]
PRX_BANK_URL = "https://raw.githubusercontent.com/Banten-IT-Solutions/BITS-Cloudflare-VPN/main/proxy.txt"

[assets]
directory = "./assets"
binding = "ASSETS"

# Domain utama (custom domain)
[[routes]]
pattern = "yuliana.my.id"
custom_domain = true

# SNI-trick hostname: custom domain eksak agar SSL SAN persis hostname ini muncul
[[routes]]
pattern = "support.zoom.us.yuliana.my.id"
custom_domain = true
```

*Catatan: `KV_PRX_URL` bersifat opsional (default mengarah ke `KV.json` di repositori). Pastikan menambahkan DNS record wildcard (`*.domain.com`) yang ter-proxy (Orange Cloud) jika ingin memakai skema Wildcard.*

### 4. Deploy ke Cloudflare
```bash
wrangler deploy
```

---

## Struktur Navigasi Web

| Halaman | URL | Fungsi |
|---|---|---|
| **Landing Page** | `/` | Halaman pembuka dengan kartu CTA menuju tiga tools utama. |
| **Provider Build** | `/build` | Konfigurator berbasis provider/IP: daftar proxy, filter negara, ping real-time, Select All, dialog config (Protocols, Mode, Domain, Wildcard, Port) → URI + Clash YAML. |
| **Country Build** | `/country` | Pilih negara (kartu multi-select, tanpa checkbox) → config dengan path negara (`/ID`, `/ID,SG`). |
| **Convert** | `/convert` | Konversi URI ↔ Clash YAML (VLESS / VMess / Trojan) dua arah. |

---

## API Endpoints

Semua endpoint API dipusatkan di bawah base path `/api`.

### 1. `GET /api/sub` — Subscription Generator

**Query Parameters:**
| Parameter | Tipe Data | Deskripsi | Default |
|---|---|---|---|
| `vpn` | `string` | Pilihan protokol (pemisah koma). Opsi: `vless`, `vmess`, `trojan` | `vless` |
| `cc` | `string` | Filter kode negara (pemisah koma). Contoh: `ID,SG,US` | Semua negara |
| `port` | `string` | Filter port proxy. Opsi: `443`, `80` | `443` |
| `limit` | `number` | Batas maksimum config yang di-generate (1 s.d 200) | `10` |
| `format` | `string` | Format keluaran. Opsi: `raw`, `v2ray` (Base64), `json` | `raw` |
| `domain` | `string` | Override SNI / Server Hostname tujuan | Hostname request |

**Contoh Request:**
```bash
# Mengambil 5 akun VLESS khusus wilayah Indonesia format plaintext
curl "https://domain.com/api/sub?vpn=vless&cc=ID&limit=5&format=raw"

# Mengambil konfigurasi VMess & Trojan campuran terenkripsi Base64
curl "https://domain.com/api/sub?vpn=vmess,trojan&limit=10&format=v2ray"
```

---

### 2. `GET /api/proxies` — Paginated Proxy List

**Query Parameters:**
| Parameter | Deskripsi |
|---|---|
| `q` | Pencarian substring berdasarkan IP, nama Provider (ISP), atau Negara. |
| `cc` | Filter unit kode negara tertentu (pemisah koma). |
| `port` | Filter berdasarkan port. |
| `page` | Nomor halaman (dimulai dari `1`). |
| `limit` | Jumlah item per halaman (maksimum `100`, default `20`). |

**Contoh Response:**
```json
{
  "count": 561,
  "page": 1,
  "pages": 57,
  "items": [
    {
      "prxIP": "104.22.4.15",
      "prxPort": "443",
      "country": "SG",
      "org": "Cloudflare, Inc."
    }
  ],
  "countries": [
    { "code": "SG", "count": 120 }
  ]
}
```

---

### 3. `GET /api/countries` — Country List (dari KV)

Mengembalikan daftar negara tersedia + jumlah proxy untuk halaman `/country`. Sumber data diambil dari `KV.json` (path relay WebSocket).

**Contoh Response:**
```json
{
  "count": 36,
  "countries": [
    { "code": "CH", "count": 10 },
    { "code": "ID", "count": 1 },
    { "code": "SG", "count": 10 }
  ]
}
```

---

### 4. `GET /api/check` — Allowed Proxy Latency Probe
Melakukan pengecekan latensi ke IP target proxy.

**Query Parameters:**
- `target`: String dengan format `IP:Port`.

> *Keamanan: Endpoint ini dilindungi rate-limit (12 request / 10 detik). Hanya IP/Port yang terdaftar resmi di allowlist yang diizinkan; target tidak sah akan diblokir dengan `403 Forbidden`.*

---

## Logika Pemetaan Config Builder

Saat men-generate konfigurasi di halaman `/build` atau `/country`, sistem memetakan parameter `Bug Domain` dan `Wildcard` menjadi skema berikut:

### Skema Mode SNI
Digunakan jika penyedia jaringan memblokir VPN dengan validasi SNI (SSL/TLS Handshake).

| Opsi Wildcard | Nilai `server` (Target) | Nilai `servername` / `Host` |
|---|---|---|
| **Non Wildcard** (🚫) | `domain-anda.com` | `bug-anda.com` |
| **Wildcard** (✳️) | `bug-anda.com.domain-anda.com` | `bug-anda.com` |

### Skema Mode CDN
Digunakan jika port transit dialihkan ke IP Server CDN (misal Cloudflare IP/IP Bug).

| Opsi Wildcard | Nilai `server` (Target IP) | Nilai `servername` / `Host` |
|---|---|---|
| **Non Wildcard** (🚫) | `bug-anda.com` | `domain-anda.com` |
| **Wildcard** (✳️) | `bug-anda.com` | `bug-anda.com.domain-anda.com` |

---

## Arsitektur Routing WebSocket

Worker memproses upgrade koneksi WebSocket berdasarkan pola routing URL path:

| Pola URL | Aksi & Perilaku |
|---|---|
| `/{IP}-{Port}` | Relay TCP langsung ke target proxy (contoh: `/1.1.1.1-443`). |
| `/{CC}` | Memilih proxy acak dari satu kode negara dari `KV.json` (contoh: `/SG`). |
| `/{CC1,CC2,...}` | Memilih proxy acak di antara beberapa negara yang dipilih (contoh: `/ID,SG`). |

Konfigurasi yang dihasilkan halaman `/country` menggunakan pola part kedua dan ketiga; pola pertama dipakai `/build` dan `/api/sub`.

---

## Pengembangan Lokal

### Struktur Repositori
```
├── assets/
│   ├── index.html       # Landing page
│   ├── build.html       # Config builder (Provider)
│   ├── country.html     # Country path builder
│   └── convert.html     # URI ↔ Clash converter
├── src/
│   ├── index.ts         # Entry point Hono + WebSocket Router
│   ├── core/
│   │   ├── constants.ts # Definisi port, protokol, salt, & helper
│   │   ├── lists.ts     # Cache manager & GitHub proxy list parser
│   │   └── relay.ts     # Core protocol sniffer & WebSocket relay handler
│   └── routes/
│       └── api.ts       # Endpoint API routing
├── KV.json              # Daftar proxy per negara (untuk path /CC)
├── proxy.txt            # Daftar proxy (IP,Port,CC,ORG) untuk /build & /api
├── raw.txt              # Sumber raw IP untuk pipeline sync
├── scan.ts              # Local proxy checker
├── fetch.ts             # Pipeline fetch + kurasi IP (bun run fetch)
├── .github/workflows/   # deploy.yml, sync.yaml, fetch.yaml, scan.yaml, lint.yaml
└── wrangler.toml        # Cloudflare configuration file
```

### Script Development
```bash
# Jalankan local development environment (Wrangler Dev)
bun run dev

# Verifikasi tipe TypeScript
bun run types

# Deploy pembaruan secara instan
bun run deploy

# Pipeline kurasi IP (memetakan ulang proxy.txt / KV.json)
bun run fetch
```

---

## Rekomendasi Penggunaan Kuota (Free Tier)

Cloudflare Workers Free Tier membatasi penggunaan hingga **100.000 request per hari**. Satu sesi koneksi VPN WebSocket dihitung sebagai 1 request saat inisiasi.

Untuk menghindari kehabisan kuota akibat health-check dari aplikasi client seperti Clash:
- ⚠️ Hindari interval pemeriksaan latensi terlalu rapat (misal `interval: 30s`).
- 💡 **Rekomendasi**: ubah parameter `interval` menjadi minimal `300` (5 menit) atau `600` (10 menit).

**Contoh Clash Provider Config:**
```yaml
proxy-providers:
  bits-vpn:
    type: http
    url: "https://domain-anda.com/api/sub?vpn=vless&limit=20&format=raw"
    interval: 600
    health-check:
      enable: true
      interval: 600
      url: http://cp.cloudflare.com/generate_204
```

---

## Keamanan & Proteksi SSRF

1. **SSRF Blocker (Server-Side)**: Core relay memblokir koneksi transit keluar yang ditujukan ke segmen IP privat (RFC 1918), loopback (`127.0.0.0/8`, `::1`), link-local, multicast, dan range port tidak valid.
2. **Safe API Checker**: Endpoint `/api/check` dilindungi rate-limit dan hanya bisa di-probe ke IP proxy terverifikasi.
3. **Thread-Safe WebSocket state**: Parameter proxy menggunakan closure/lexical scope per connection, menjamin tidak pernah bocor atau tertukar antar pengguna yang terhubung bersamaan (no race condition).

---

## Lisensi
Proyek ini didistribusikan di bawah lisensi MIT. Lihat file [LICENSE](LICENSE) untuk informasi lebih lanjut.

---

**Dikembangkan dengan dedikasi oleh [Banten IT Solutions](https://bits.co.id)**
*Jika proyek ini membantu mempermudah kebutuhan VPN Anda, dukung kami dengan memberikan Star ⭐ pada repositori ini!*