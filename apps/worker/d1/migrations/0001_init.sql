-- Proxies metadata table for BITS VPN
CREATE TABLE IF NOT EXISTS proxies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT NOT NULL,
  port        INTEGER NOT NULL,
  country     TEXT NOT NULL DEFAULT 'XX',
  protocol    TEXT NOT NULL DEFAULT 'vless', -- vless|trojan|shadowsocks|vmess
  domain      TEXT NOT NULL DEFAULT '',
  org         TEXT NOT NULL DEFAULT 'Unknown',
  tls         INTEGER NOT NULL DEFAULT 1,
  healthy     INTEGER,
  delay_ms    INTEGER,
  last_checked_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ip, port)
);

CREATE INDEX IF NOT EXISTS idx_proxies_country ON proxies(country);
CREATE INDEX IF NOT EXISTS idx_proxies_protocol ON proxies(protocol);
CREATE INDEX IF NOT EXISTS idx_proxies_port ON proxies(port);
CREATE INDEX IF NOT EXISTS idx_proxies_domain ON proxies(domain);