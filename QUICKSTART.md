# Quick Start - Proxy Scanner Workflow

## 🎯 Apa yang Sudah Dibuat?

Workflow otomatis untuk scan dan clean proxy IP Cloudflare ID & SG setiap 24 jam:

```
┌─────────────────────────────────────────────────────────────┐
│  Cron (0 0 * * * UTC)                                       │
│  Setiap 24 jam                                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Scanner Worker (apps/scanner-worker)                       │
│  - Fetch dari SOURCE_URLS                                   │
│  - Parse JSON/plain text format                             │
│  - Filter ID & SG only                                      │
│  - Validate dengan HEAD request (bounded concurrency)       │
│  - Retry logic (3 attempts)                                 │
│  - Sort by response time                                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  R2 Storage (bits-vpn-proxy-lists)                          │
│  - proxy-lists/latest.json        (current)                 │
│  - proxy-lists/history/*.json     (immutable)               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Proxy Worker (apps/worker)                                 │
│  - GET /api/v1/proxies?region=ID|SG                         │
│  - WebSocket /ID, /SG, /ID,SG (random selection)            │
│  - Direct /IP:PORT (backward compatible)                    │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Langkah Deploy (5 Menit)

### 1. Setup Infrastructure

```bash
# Buat R2 bucket (sudah dibuat ✅)
bunx wrangler r2 bucket create bits-vpn-proxy-lists

# Buat D1 database (jika belum)
bunx wrangler d1 create vpn

# Buat KV namespace (jika belum)
bunx wrangler kv:namespace create "bits-vpn-kv"
```

### 2. Update Configuration

Edit `apps/worker/wrangler.jsonc`:
```jsonc
{
  "d1_databases": [{
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" // ← dari output d1 create
  }],
  "kv_namespaces": [{
    "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" // ← dari output kv:namespace create
  }]
}
```

### 3. Set Proxy Sources

Edit `apps/scanner-worker/wrangler.jsonc`:
```jsonc
{
  "vars": {
    "SOURCE_URLS": "https://api.example.com/proxies.json,https://backup.example.com/proxies.json"
  }
}
```

**Format yang didukung:**

JSON:
```json
[
  {"ip": "1.1.1.1", "port": 443, "region": "ID"},
  {"ip": "8.8.8.8", "port": 443, "region": "SG"}
]
```

Plain Text:
```
1.1.1.1:443 ID
8.8.8.8:443 SG
```

### 4. Build & Deploy

```bash
# Build semua
bun install
bun run build

# Apply D1 migrations
bun run migrate:remote

# Deploy workers
bun run --cwd apps/worker deploy
bun run --cwd apps/scanner-worker deploy
```

## ✅ Verifikasi

### Test Scanner (Manual Trigger)

```bash
# Monitor logs
bunx wrangler tail bits-vpn-scanner --format pretty

# Trigger manual (di terminal lain)
curl -X POST https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/workers/scripts/bits-vpn-scanner/schedules/trigger \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### Check R2 Storage

```bash
# List files
bunx wrangler r2 object list bits-vpn-proxy-lists --prefix proxy-lists/

# Download latest
bunx wrangler r2 object get bits-vpn-proxy-lists/proxy-lists/latest.json --file latest.json
cat latest.json | jq .
```

### Test API Endpoint

```bash
# Get ID proxies
curl https://vpn.bits.co.id/api/v1/proxies?region=ID | jq .

# Get SG proxies
curl https://vpn.bits.co.id/api/v1/proxies?region=SG | jq .
```

Expected response:
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
      "source": "https://api.example.com/proxies.json"
    }
  ]
}
```

### Test WebSocket Tunnel

```bash
# Random ID proxy
wscat -c wss://vpn.bits.co.id/ID

# Random SG proxy
wscat -c wss://vpn.bits.co.id/SG

# Random from both
wscat -c wss://vpn.bits.co.id/ID,SG
```

## 📊 Monitoring

### Scanner Logs

Scanner log structure:
```json
{
  "message": "proxy scan complete",
  "sources": 2,
  "candidates": 500,
  "valid": 234,
  "success_rate": 0.468,
  "duration_ms": 12453
}
```

### Cloudflare Dashboard

1. **Workers & Pages** → `bits-vpn-scanner`
   - Metrics: Requests, Errors, CPU Time
   - Logs: Real-time logs
   - Cron Events: Last 100 executions

2. **R2** → `bits-vpn-proxy-lists`
   - Object count & size
   - Request metrics

### Alerts to Setup

🚨 Alert conditions:
- Scanner error rate > 5%
- `valid: 0` (no proxies found)
- `generated_at` > 48 hours (stale)
- Success rate < 10%

## 🔧 Configuration Tuning

### Aggressive Scanning (Faster, More Proxies)

```jsonc
{
  "vars": {
    "MAX_CANDIDATES": "1000",      // ↑ more candidates
    "MAX_CONCURRENCY": "25",       // ↑ faster validation
    "PROBE_TIMEOUT_MS": "5000",    // ↑ slower networks
    "MAX_DELAY_MS": "5000"         // ↑ accept slower proxies
  }
}
```

### Conservative Scanning (Safer, Faster Proxies Only)

```jsonc
{
  "vars": {
    "MAX_CANDIDATES": "200",       // ↓ fewer candidates
    "MAX_CONCURRENCY": "5",        // ↓ gentler on sources
    "PROBE_TIMEOUT_MS": "1000",    // ↓ fast networks only
    "MAX_DELAY_MS": "1000"         // ↓ fast proxies only
  }
}
```

### Cron Schedule

```jsonc
{
  "triggers": {
    "crons": [
      "0 0 * * *"      // Daily at 00:00 UTC (default)
      // "0 */12 * * *"   // Every 12 hours
      // "0 */6 * * *"    // Every 6 hours
      // "0 0,12 * * *"   // At 00:00 and 12:00 UTC
    ]
  }
}
```

## 🐛 Troubleshooting

### "SOURCE_URLS must contain one or more HTTPS endpoints"

❌ Problem: Empty or invalid SOURCE_URLS

✅ Solution:
```bash
# Edit wrangler.jsonc dan set SOURCE_URLS
# Atau deploy dengan secret:
bunx wrangler secret put SOURCE_URLS --config apps/scanner-worker/wrangler.jsonc
```

### API returns 503 "Scanner data not available"

❌ Problem: latest.json belum ada di R2

✅ Solution:
1. Wait for first cron run (up to 24 hours)
2. Or trigger manually via Cloudflare API
3. Check scanner logs for errors

### No valid proxies (valid: 0)

❌ Problem: All candidates failed validation

✅ Solution:
1. Check source URLs are reachable
2. Verify proxy format is correct
3. Increase PROBE_TIMEOUT_MS and MAX_DELAY_MS
4. Check if proxies are actually alive

### Cron not running

❌ Problem: Schedule not active

✅ Solution:
1. Wait up to 15 minutes after deploy
2. Check Cloudflare Dashboard → Cron Events
3. Verify wrangler.jsonc has correct cron syntax

## 📁 File Structure

```
apps/scanner-worker/
├── src/
│   └── index.ts              # Scanner logic
├── wrangler.jsonc            # Worker config + cron
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── .dev.vars.example         # Environment template
└── .gitignore                # Ignore .dev.vars

apps/worker/
├── src/
│   ├── api.ts                # GET /api/v1/proxies endpoint
│   ├── tunnel.ts             # WebSocket /ID, /SG logic
│   └── ...
└── wrangler.jsonc            # Added R2 binding

packages/shared/
└── src/index.ts              # ScannedProxy & ProxyList schemas
```

## 🎓 Next Steps

1. **Setup GitHub Secrets** untuk auto-deploy:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

2. **Setup Monitoring Alerts** di Cloudflare:
   - Scanner failures
   - Stale data warnings

3. **Add Multiple Sources** untuk redundancy:
   ```jsonc
   "SOURCE_URLS": "https://primary.com/api,https://backup.com/api,https://tertiary.com/api"
   ```

4. **Monitor Costs**:
   - Scanner: ~0.1s per run = FREE (under 100k requests/day)
   - R2: ~1-2 KB per list = FREE (under 10 GB)
   - Proxy Worker: Pay per request

5. **Read Full Docs**:
   - `DEPLOYMENT.md` - Complete deployment guide
   - `README.md` - Project overview

## 📞 Support

Logs command:
```bash
bunx wrangler tail bits-vpn-scanner --format pretty
bunx wrangler tail bits-vpn --format pretty
```

Check R2:
```bash
bunx wrangler r2 object list bits-vpn-proxy-lists
```

---

**Status:** ✅ Ready to deploy

**Estimated setup time:** 5-10 minutes

**Next:** Edit `SOURCE_URLS` → Deploy → Monitor logs
