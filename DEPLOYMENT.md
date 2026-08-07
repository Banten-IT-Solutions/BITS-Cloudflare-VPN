# Deployment Guide

## Prerequisites

- [Bun](https://bun.sh) installed
- Cloudflare account with Workers, D1, KV, and R2 enabled
- Cloudflare API Token with permissions:
  - Workers Scripts (Edit)
  - D1 (Edit)
  - KV Storage (Edit)
  - R2 Storage (Edit)

## Initial Setup

### 1. Create R2 Bucket

```bash
bunx wrangler r2 bucket create bits-vpn-proxy-lists
```

### 2. Create D1 Database

```bash
bunx wrangler d1 create vpn
```

Output akan memberikan `database_id`. Copy ID tersebut.

### 3. Create KV Namespace

```bash
bunx wrangler kv:namespace create "bits-vpn-kv"
```

Output akan memberikan namespace `id`. Copy ID tersebut.

### 4. Update Configuration

Edit `apps/worker/wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "vpn",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // ← ganti dengan D1 database_id
      "migrations_dir": "d1/migrations"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" // ← ganti dengan KV namespace id
    }
  ]
}
```

### 5. Configure Scanner Worker Source URLs

Edit `apps/scanner-worker/wrangler.jsonc` dan set `SOURCE_URLS`:

```jsonc
{
  "vars": {
    "SOURCE_URLS": "https://api.example.com/id-proxies.json,https://api.example.com/sg-proxies.json"
  }
}
```

**PENTING:** 
- Hanya gunakan HTTPS URLs
- URLs harus mengembalikan JSON format: `[{"ip":"1.1.1.1","port":443,"region":"ID"}]` atau `{"proxies":[...]}`
- Atau plain text format: `IP:PORT REGION` (satu per baris)
- Region harus `ID` atau `SG`

### 6. Build Project

```bash
# Install dependencies
bun install

# Build shared package
bun run --filter @bits-vpn/shared build

# Build semua
bun run build
```

### 7. Apply D1 Migrations

```bash
# Local (untuk testing)
bun run migrate:local

# Remote (production)
bun run migrate:remote
```

## Deployment

### Deploy Proxy Worker

```bash
bun run --cwd apps/worker deploy
```

### Deploy Scanner Worker

```bash
bun run --cwd apps/scanner-worker deploy
```

## Testing

### Test Scanner Locally

```bash
# Copy .dev.vars.example ke .dev.vars
cp apps/scanner-worker/.dev.vars.example apps/scanner-worker/.dev.vars

# Edit .dev.vars dengan SOURCE_URLS yang valid
nano apps/scanner-worker/.dev.vars

# Start scanner worker
bun run --cwd apps/scanner-worker dev

# Trigger cron secara manual (di terminal lain)
curl 'http://localhost:8787/cdn-cgi/handler/scheduled?format=json'
```

### Test Proxy Worker Locally

```bash
bun run dev:worker
```

### Monitor Logs

```bash
# Monitor scanner worker logs
bunx wrangler tail bits-vpn-scanner

# Monitor proxy worker logs
bunx wrangler tail bits-vpn
```

## Monitoring

### Check Scanner Execution

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → bits-vpn-scanner
2. Klik "Logs" atau "Metrics"
3. Cek "Cron Events" untuk melihat execution history

### Scanner Metrics

Scanner logs dalam format JSON dengan fields:
- `sources`: jumlah source URLs
- `candidates`: jumlah proxy candidates yang di-parse
- `valid`: jumlah proxy yang lulus validation
- `success_rate`: persentase success (valid/candidates)
- `duration_ms`: waktu eksekusi total dalam milliseconds

### Alert Conditions

Set up alerts untuk:
- Scanner errors
- `valid: 0` (tidak ada proxy yang valid)
- `generated_at` lebih dari 48 jam (stale data)
- Success rate < 10%

### Check Proxy Lists in R2

```bash
# List R2 objects
bunx wrangler r2 object list bits-vpn-proxy-lists --prefix proxy-lists/

# Download latest list
bunx wrangler r2 object get bits-vpn-proxy-lists/proxy-lists/latest.json --file latest.json
cat latest.json | jq .
```

## API Endpoints

### Get Proxy List

```bash
# Get all proxies from scanner
curl https://vpn.bits.co.id/api/v1/proxies?region=ID

# Singapore proxies
curl https://vpn.bits.co.id/api/v1/proxies?region=SG
```

Response:
```json
{
  "generated_at": "2026-08-08T00:00:00.000Z",
  "proxies": [
    {
      "ip": "203.0.113.10",
      "port": 443,
      "region": "ID",
      "last_checked": "2026-08-08T00:00:00.000Z",
      "response_time_ms": 42,
      "source": "https://source.example/proxies.json"
    }
  ]
}
```

### WebSocket Tunnel

```bash
# Direct proxy target
wscat -c wss://vpn.bits.co.id/203.0.113.10:443

# Random ID proxy
wscat -c wss://vpn.bits.co.id/ID

# Random SG proxy
wscat -c wss://vpn.bits.co.id/SG

# Random from ID or SG
wscat -c wss://vpn.bits.co.id/ID,SG
```

## CI/CD Setup

### GitHub Secrets

Set the following secrets di repository settings:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### GitHub Actions Workflow

Workflow di `.github/workflows/ci.yml` akan otomatis:
1. Install dependencies
2. Typecheck semua packages
3. Build frontend + workers
4. Deploy ke Cloudflare

Trigger: push ke branch `main`

## Troubleshooting

### Scanner tidak menghasilkan proxy

**Cek logs:**
```bash
bunx wrangler tail bits-vpn-scanner --format pretty
```

**Possible causes:**
- `SOURCE_URLS` empty atau invalid
- Source endpoints tidak reachable
- Source format tidak sesuai
- Semua proxy gagal validation (slow response atau unreachable)

### Proxy Worker returns 503

**Cause:** `latest.json` belum ada di R2 (scanner belum pernah berhasil)

**Solution:**
- Trigger scanner manually atau tunggu cron schedule
- Check scanner logs untuk errors

### Cron tidak jalan

**Notes:**
- Cron config changes dapat memakan waktu hingga 15 menit untuk propagate
- Cek "Cron Events" di Cloudflare Dashboard

### Empty proxy list

**Check:**
```bash
curl https://vpn.bits.co.id/api/v1/proxies?region=ID
```

Jika returns `503`, scanner belum menghasilkan valid proxies.

## Production Considerations

### Source URLs

- Gunakan HTTPS endpoints yang reliable
- Implement rate limiting di source endpoints
- Consider caching di source endpoints
- Monitor source endpoint availability

### Scanner Configuration

Adjust berdasarkan kebutuhan:

```jsonc
{
  "vars": {
    "MAX_CANDIDATES": "1000",      // Increase untuk lebih banyak candidates
    "MAX_CONCURRENCY": "20",       // Increase untuk scan lebih cepat
    "PROBE_TIMEOUT_MS": "3000",    // Increase untuk network yang lambat
    "MAX_DELAY_MS": "3000"         // Increase untuk accept slower proxies
  }
}
```

### Cron Schedule

Default: `0 0 * * *` (setiap hari jam 00:00 UTC)

Untuk mengubah schedule, edit `apps/scanner-worker/wrangler.jsonc`:

```jsonc
{
  "triggers": {
    "crons": ["0 */12 * * *"]  // Setiap 12 jam
  }
}
```

Supported format: [Cron syntax](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

### Costs

- **Scanner Worker**: ~0.1s execution time per scan, once daily = gratis (dalam Free tier)
- **Proxy Worker**: Pay per request (Free tier: 100k requests/day)
- **R2**: Storage + operations (Free tier: 10 GB storage, 1M class B operations/month)
- **D1**: Rows read/written (Free tier: 5M reads, 100k writes/day)
- **KV**: Reads + writes (Free tier: 100k reads, 1k writes/day)

## Security

### Secrets Management

Never commit:
- `.dev.vars` (local development secrets)
- `.env` files
- API tokens

### Source URLs

- If source requires authentication, do NOT put credentials in `SOURCE_URLS`
- Use Cloudflare Workers Secrets for credentials
- Implement authenticated fetch in scanner code

### R2 Bucket Access

- R2 bucket is private by default
- Only accessible via Worker bindings
- No public URL access

## Support

Untuk issues atau questions:
1. Check logs: `bunx wrangler tail <worker-name>`
2. Check R2 contents: `bunx wrangler r2 object list bits-vpn-proxy-lists`
3. Review Cloudflare Dashboard metrics
4. Check source endpoint availability

---

Last updated: 2026-08-08
