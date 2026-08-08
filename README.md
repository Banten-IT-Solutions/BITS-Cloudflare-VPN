# BITS-Cloudflare-VPN

VPN serverless (VLESS / VMess / Trojan via WebSocket) berjalan di Cloudflare Workers — IP negara (colocation) gratis melalui CDN Cloudflare, disediakan oleh [Banten IT Solutions](https://bitsco.id).

> **Catatan penting:** Worker ini sekarang **self-contained** — tidak lagi reverse-proxy ke bits.co.id.
> Halaman `https://<domain>/` dan `https://<domain>/sub` adalah UI yang dibungkus langsung di dalam
> worker; tidak ada ketergantungan ke host eksternal mana pun.

## Fitur

- 🚀 Endpoint Worker: `wss://yuliana.my.id` (tanpa subfolder)
- 🧩 Protokol **VLESS** (default), **VMess**, dan **Trojan** — dipilih lewat parameter `vpn`
- 📍 Filter negara (colo) dengan `cc` (mis. `ID`, `SG`, `US`)
- 🔌 Port `443`/`80`
- 🖥️ Format `raw` (teks) atau `v2ray` (base64) — default `v2ray`
- 🧹 Auto-ganti DNS per-request (header `x-real-ip` aman)
- 🗃️ IP pool up-to-date dari `KV.json` dan `proxy.txt` di repo ini, di-refresh otomatis oleh workflow CI (setiap 30 menit)
- 📄 Halaman UI `https://yuliana.my.id/sub` (generator link) & `https://yuliana.my.id/api/v1` (API)
- 🛸 Wildcard `*.yuliana.my.id` juga meneruskan tunnel (semua subdomain langsung berfungsi)

## Instalasi

1. **Deploy as worker**

   ```sh
   npm i -g wrangler
   git clone https://github.com/bitscoid/BITS-Cloudflare-VPN
   cd BITS-Cloudflare-VPN
   wrangler deploy
   ```

2. **(Opsional) Production Domain** — ganti `yuliana.my.id` dengan domain kamu sendiri, lalu tambahkan route:

   ```toml
   [[routes]]
   pattern = "yuliana.my.id"          # custom domain -> sertifikat otomatis
   custom_domain = true

   [[routes]]
   pattern = "*.yuliana.my.id/*"      # wildcard
   zone_name = "yuliana.my.id"
   ```

   Semua protokol & API otomatis bekerja di subdomain mana pun, mis. `tes.yuliana.my.id`.

3. Gunakan tools lain seperti [Docker deploy](https://github.com/bitscoid/BITS-Cloudflare-VPN/blob/master/README-docker.md) jika tidak ingin install npm.

## Quick Deployment (Docker)

```bash
docker run --rm -e CLOUDFLARE_API_TOKEN=xxxx wrangler-action deploy
```

Memakai [worker-template](https://github.com/bitscoid/Cloudflare-Workers-VPN), tapi cukup satu file `worker.js`.

## Penggunaan

### Coba langsung

Halaman subscription: [yuliana.my.id](/sub)

Default endpoint:

```bash
# VLESS (default) — 10 akun, semua negara
curl "https://tes.yuliana.my.id/api/v1/sub?vpn=vless&limit=10"

# VMess
curl "https://tes.yuliana.my.id/api/v1/sub?vpn=vmess&limit=10"

# Trojan
curl "https://tes.yuliana.my.id/api/v1/sub?vpn=trojan&limit=10"

# Filter negara
curl "https://tes.yuliana.my.id/api/v1/sub?cc=SG&limit=10"

# Port 80
curl "https://tes.yuliana.my.id/api/v1/sub?port=80&limit=10"
```

### Parameter API `/api/v1/sub`

`GET https://<domain>/api/v1/sub`

| Query   | Nilai                                                                | Default          |
| ------- | -------------------------------------------------------------------- | ---------------- |
| `vpn`   | `vless`, `vmess`, `trojan` (bisa dipisah koma)                        | `vless`          |
| `cc`    | kode negara (mis. `ID,SG`) — kosong = semua                           | semua            |
| `port`  | `443`, `80`                                                           | `443`            |
| `limit` | jumlah akun                                                           | `10`             |
| `format`| `raw` atau `v2ray` (base64)                                           | `v2ray`          |
| `domain`| SNI/domain yang diisi ke config (default: hostname request)           | hostname         |

**Response:** teks biasa `text/plain`. Semua endpoint API mengembalikan CORS `*` jadi bisa dipakai dari browser.

### Cek IP / colo

```bash
curl https://yuliana.my.id/api/v1/myip
# {"ip":"1.2.3.4","colo":"JKT", ...}
```

### Homepage & Subscription Page

- `https://yuliana.my.id/` — homepage dengan status, parameter API, contoh link.
- `https://yuliana.my.id/sub` — generator link (pilih protokol, negara, port, jumlah) + tombol salin & unduh; pratinjau akun live.

Kedua halaman dirender langsung dari worker (tanpa reverse proxy / redirect eksternal).

### Client & App

Untuk penggunaan VPN di HP/PC, pasang app seperti:
- v2rayN / v2rayNG / Nekoray (link `v2ray`)
- Hiddify / Shadowrocket / Stash
- Clash: gunakan link `raw` sebagai remote provider (pastikan set `update-interval` rendah agar tidak boros kuota free; disarankan `interval: 300`).

## Aktivasi Wildcard

Cara kerjanya dua langkah — cukup meneruskan satu domain ke worker:

1. Tambah `[[routes]]` **custom domain** di `wrangler.toml` — Cloudflare akan membuat DNS & sertifikat otomatis. Contoh: `yuliana.my.id`.
2. Untuk wildcard, tambahkan **route zone** (bukan custom domain, karena custom domain tidak mendukung wildcard):

   ```toml
   [[routes]]
   pattern = "*.yuliana.my.id/*"
   zone_name = "yuliana.my.id"
   ```

   Lalu di DNS, tambahkan record wildcard `*` (A/AAAA/type apapun) yang di-proxy (proxied) menuju nama domain yang sudah di-worker, misalnya:

   ```
   *.yuliana.my.id  →  CNAME  yuliana.my.id   (Proxy: On)
   ```

   Dengan begitu semua subdomain langsung bekerja (tunnel), tanpa perlu menambah route satu per satu.

## Panduan / Penjelasan penting

- Worker memakai `WebSocket` + `cloudflare:sockets`; deployment standar `wrangler deploy` langsung jalan.
- **Free tier:** 100k request / hari. 1 sesi WebSocket = 1 request; kuota cepat habis bila apps (mis. Clash) health-check terus-menerus — set interval health check ≥ 300s.
- Proxy bank diperbarui oleh CI `scan.yaml` tiap 30 menit (memeriksa kesehatan proxy, menulis `proxy.txt`, dan update `KV.json`).
- Lisensi: MIT.

## Automasi

- `.github/workflows/scan.yaml` — every 30 menit: cek health proxy (poke port), generate `proxy.txt`, update `KV.json`, push "Update proxy list".
- `.github/workflows/deploy.yml` — manual `workflow_dispatch` (input `ref`): deploy worker ke Cloudflare (wrangler-action + setup-bun).

## Tips & Konfigurasi Lanjut (opsional)

- **Rate limit / abuse:** batasi `limit` di klien; jangan buka API publik bila banyak pengguna tidak dikenal.
- **Ubah port:** hanya `443` & `80` yang didukung karena koneksi melewati handshake TLS SNI ke colo Cloudflare.
- **Debug:** akses `https://<domain>/api/v1/myip` untuk pastikan colo/negara sudah benar.

---

*Dibuat dengan ❤️ oleh [Banten IT Solutions](https://bits.co.id)*