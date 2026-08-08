# BITS Cloudflare VPN

VPN Serverless (VLESS / VMess / Trojan via WebSocket) yang berjalan di infrastruktur Cloudflare Workers. Proyek ini memfasilitasi pembuatan konfigurasi VPN gratis dengan IP proxy negara tujuan (colocation) yang terus diperbarui secara otomatis, dikembangkan oleh [Banten IT Solutions](https://bits.co.id).

> **Arsitektur:** Backend berbasis framework [Hono](https://hono.dev), frontend menggunakan Alpine.js dengan tema Glassmorphic premium, dan core relay WebSocket vanilla dioptimalkan untuk throughput maksimum dan latency minimal.

---

## Fitur Utama

- 🚀 **Dual Frontend Page** — Landing page informatif (`/`) & Halaman konfigurator VPN interaktif (`/build`).
- 🧩 **Multi-Protocol Support** — Mendukung **VLESS** (default), **VMess**, dan **Trojan** via WebSocket (di-decode menggunakan server-side sniffing).
- 📍 **Colocation Filtering** — Filter daftar proxy aktif berdasarkan negara (Colo).
- ⚡ **Real-time Latency & Ping** — Pengecekan latency TCP/UDP real-time langsung ke proxy target dengan optimasi client-side caching dan input debouncing.
- 🔌 **Dynamic Port & SSL** — Mendukung Port `443` (TLS) / Port `80` (Plain).
- 🖥️ **Subscription Formats** — Tersedia format output `raw` (satu tautan per baris), `v2ray` (Base64 subscription), dan `json` (untuk integrasi aplikasi pihak ketiga).
- 🔨 **Config Builder Dialog** — Mendukung generate format `vless://` URI dan Clash Proxy YAML secara instan dengan parameter SNI, CDN, atau Wildcard Subdomain.
- 🛸 **Wildcard Subdomain Support** — Otomatis terintegrasi dengan subdomain wildcard Cloudflare (`*.domain/*`) untuk menyamarkan lalu lintas.
- 🗃️ **Automated IP Sync** — Daftar IP proxy sehat disinkronkan berkala setiap 30 menit melalui GitHub Actions Workflow ke GitHub raw data.

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
git clone https://github.com/bitscoid/BITS-Cloudflare-VPN.git
cd BITS-Cloudflare-VPN
bun install # atau npm install
```

### 3. Konfigurasi wrangler.toml
Sesuaikan `wrangler.toml` sebelum melakukan deployment:
```toml
name = "vpn"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat_v2"]

[vars]
PRX_BANK_URL = "https://raw.githubusercontent.com/bitscoid/BITS-Cloudflare-VPN/main/proxy.txt"

[assets]
directory = "./assets"
binding = "ASSETS"

# Domain Utama (Custom Domain)
[[routes]]
pattern = "yuliana.my.id"
custom_domain = true

# Wildcard Subdomain (Membutuhkan routing zone DNS)
[[routes]]
pattern = "*.yuliana.my.id/*"
zone_name = "yuliana.my.id"
```

*Catatan: Pastikan Anda menambahkan DNS wildcard record (`*.domain.com`) yang ter-proxy (Orange Cloud) di dashboard DNS Cloudflare Anda.*

### 4. Deploy ke Cloudflare
```sh
wrangler deploy
```

---

## Struktur Navigasi Web

| Halaman | URL | Fungsi |
|---|---|---|
| **Landing Page** | `/` | Menampilkan status server, identitas IP publik Anda (My IP), detektor colocation, dan dokumentasi API. |
| **Config Builder** | `/build` | Workspace pembuatan konfigurasi VPN. Dilengkapi selektor proxy, filter wilayah, real-time ping, tombol Select All, dan opsi generator config. |

---

## API Endpoints

Semua endpoint API dipusatkan di bawah base path `/api`.

### 1. `GET /api/sub` — Subscription Generator
Menghasilkan kumpulan tautan konfigurasi (URI) untuk VLESS/VMess/Trojan.

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
Digunakan oleh frontend untuk memuat daftar proxy yang terdaftar.

**Query Parameters:**
| Parameter | Deskripsi |
|---|---|
| `q` | Pencarian substring berdasarkan IP, nama Provider (ISP), atau Negara. |
| `cc` | Filter kode negara tertentu (pemisah koma). |
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

### 3. `GET /api/check` — Allowed Proxy Latency Probe
Melakukan pengecekan latensi TCP/UDP ke IP target proxy.

**Query Parameters:**
- `target`: String dengan format `IP:Port`.

*Keamanan: Endpoint ini dilindungi! Hanya IP/Port yang terdaftar resmi di allowlist database proxy yang diizinkan untuk di-probe. IP privat, localhost, multicast, dan IP luar yang tidak sah akan diblokir dengan respon `403 Forbidden`.*

---

## Logika Pemetaan Config Builder

Saat men-generate konfigurasi di halaman `/build`, sistem akan memetakan parameter `Bug Domain` dan `Wildcard` menjadi skema berikut:

### Skema Mode SNI
Digunakan jika penyedia jaringan memblokir VPN dengan validasi SNI (SSL/TLS Handshake).

| Opsi Wildcard | Nilai `server` (Target IP) | Nilai `servername` / `Host` |
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
| `/{IP}-{Port}` | Melakukan relay koneksi TCP langsung ke target proxy (contoh: `/1.1.1.1-443`). |
| `/{CC1,CC2,...}` | Memilih proxy secara acak (load balancing) dari kode negara yang ditentukan (contoh: `/ID,SG`). |
| `/{CC}` | Memilih proxy secara acak dari satu kode negara (contoh: `/SG`). |

---

## Pengembangan Lokal

### Struktur Repositori
```
├── assets/
│   ├── index.html       # Landing page frontend
│   └── build.html       # Config builder frontend
├── src/
│   ├── index.ts         # Entry point Hono + WebSocket Router
│   ├── core/
│   │   ├── constants.ts # Definisi port, protokol, salt, & helper
│   │   ├── lists.ts     # Cache manager & GitHub proxy list parser
│   │   └── relay.ts     # Core protocol sniffer & WebSocket relay handler
│   └── routes/
│       └── api.ts       # Endpoint API routing
├── scan.ts              # Local/CI proxy checker script
├── wrangler.toml        # Cloudflare configuration file
└── package.json         # Project metadata & dependensi
```

### Script Development
```bash
# Jalankan local development environment (Wrangler Dev)
bun run dev

# Lakukan verifikasi tipe data TypeScript
bun run types

# Deploy pembaruan secara instan
bun run deploy
```

---

## Rekomendasi Penggunaan Kuota (Free Tier)

Cloudflare Workers Free Tier membatasi penggunaan hingga **100.000 request per hari**. Satu sesi koneksi VPN WebSocket dihitung sebagai 1 request saat inisiasi.

Untuk menghindari kehabisan kuota akibat health-check dari aplikasi client seperti Clash:
- ⚠️ Hindari penggunaan interval pemeriksaan latensi yang terlalu rapat (misal `interval: 30s`).
- 💡 **Rekomendasi**: Ubah parameter `interval` menjadi minimal `300` (5 menit) atau `600` (10 menit) di aplikasi client Anda.

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
2. **Safe API Checker**: Endpoint `/api/check` tidak bisa digunakan untuk memindai port jaringan publik di luar daftar IP proxy terverifikasi.
3. **Thread-Safe WebSocket state**: Sistem menggunakan parameter closure/lexical scope per koneksi, menjamin parameter proxy tidak pernah bocor atau tertukar antar pengguna yang terhubung bersamaan (no race condition).

---

## Lisensi
Proyek ini didistribusikan di bawah lisensi MIT. Lihat file [LICENSE](LICENSE) untuk informasi lebih lanjut.

---

**Dikembangkan dengan dedikasi oleh [Banten IT Solutions](https://bits.co.id)**  
*Jika proyek ini membantu mempermudah kebutuhan VPN Anda, dukung kami dengan memberikan Star ⭐ pada repositori ini!*
