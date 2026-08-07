export interface Env {
  /** Bound static assets (from wrangler [assets] section). */
  ASSETS: Fetcher;
  /** D1 database for proxy metadata. */
  DB: D1Database;
  /** KV cache for sub results / proxy lists. */
  KV: KVNamespace;
}