import { z } from "zod";

// ─── Proxy ────────────────────────────────────────────────────────────────

export const ProxySchema = z.object({
  id: z.number().int().optional(),
  ip: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  country: z.string().length(2).default("XX"),
  org: z.string().default("Unknown"),
  protocol: z.enum(["vless", "trojan", "shadowsocks", "vmess"]).default("vless"),
  domain: z.string().default(""),
  tls: z.boolean().default(true),
  lastCheckedAt: z.string().datetime().optional(),
  delayMs: z.number().int().min(0).optional(),
  healthy: z.boolean().optional(),
});

export type Proxy = z.infer<typeof ProxySchema>;

// ─── Subscription query params ────────────────────────────────────────────

export const SubQuerySchema = z.object({
  cc: z.string().optional(), // comma separated: "ID,SG"
  vpn: z.string().optional(), // comma separated protocols
  port: z.coerce.number().int().min(1).max(65535).optional(),
  domain: z.string().optional(),
  format: z
    .enum(["raw", "clash", "mihomo", "provider", "v2ray"])
    .default("raw"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type SubQuery = z.infer<typeof SubQuerySchema>;

// ─── API responses ────────────────────────────────────────────────────────

const HealthResultSchema = z.object({
  proxy: z.string(),
  port: z.number().int(),
  proxyip: z.boolean(),
  delay: z.number().int(),
});

export const HealthCheckSchema = z.object({
  error: z.boolean(),
  message: z.string().optional(),
  result: HealthResultSchema,
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
