/**
 * Generator for wrangler.jsonc from wrangler.template.jsonc.
 *
 * Placeholder ${VAR} sources:
 *   - local : .env file in project root (copy from .env.example)
 *   - CI    : process.env (populated by GitHub Secrets/Variables)
 *
 * Used by `bun run cf:config` — invoked automatically before dev/build/deploy.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const REQUIRED = ['WORKER_NAME', 'PRX_BANK_URL', 'KV_PRX_URL', 'APP_DOMAIN', 'WC_DOMAIN'];

// 1. Collect env: process.env + .env (local)
const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trimStart().startsWith('#')) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// 2. Validate required keys — fail fast with a clear message
const missing = REQUIRED.filter(k => !env[k]);
if (missing.length > 0) {
  console.error(
    `✗ Missing configuration variables: ${missing.join(', ')}\n` +
      '  Local: copy .env.example to .env and fill in the values.\n' +
      '  CI   : set GitHub Variables (or Secrets) in Settings → Secrets and variables.'
  );
  process.exit(1);
}

// 3. Substitute placeholders (JSON-escape values to keep output valid)
const template = readFileSync('wrangler.template.jsonc', 'utf8');
const output = template.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => {
  const value = env[key];
  if (!value) {
    console.error(`✗ Variable \${${key}} is empty in the environment`);
    process.exit(1);
  }
  return JSON.stringify(value).slice(1, -1);
});

writeFileSync('wrangler.jsonc', output);

// 4. Safety net: any leftover placeholder means a typo in a variable name
const leftover = output.match(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g);
if (leftover) {
  console.error(`✗ Unsubstituted placeholder(s): ${leftover.join(', ')}`);
  process.exit(1);
}

console.log('✓ wrangler.jsonc generated from wrangler.template.jsonc');
