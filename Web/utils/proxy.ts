import { getFlagEmoji } from './string'
const vlessTemplate =
  'vless://fc60147e-76b8-4bc5-b691-90b2da79e3d2@support.zoom.us:443?encryption=none&type=ws&host=vpn.bits.co.id&security=tls&sni=vpn.bits.co.id&path=%2F172.232.239.151-587#1%20%F0%9F%87%AE%F0%9F%87%A9%20Akamai%20Connected%20Cloud%20WS%20TLS%20[vpn]'

type proxyType = {
  ip: string
  isp: string
  port: string
  country: string
}
type protocolsType = 'vless'
export type ProxySettings = {
  server: string
  host: string
  protocol: protocolsType
  format: 'mihomo' | 'clash' | 'provider' | 'raw'
  tls: boolean
  wildcard: boolean
}

export function getProtocols() {
  return ['vless']
}

export function getFormats() {
  return ['mihomo', 'clash', 'provider', 'raw']
}

function decodeURIComponentSafe(value = '') {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function yamlQuote(value = '') {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function parseRawProxy(rawUrl: string, index: number) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  const protocol = parsed.protocol.replace(':', '')
  const name = decodeURIComponentSafe(parsed.hash?.slice(1) || `${protocol.toUpperCase()}-${index + 1}`)
  const base = {
    name,
    server: parsed.hostname,
    port: Number.parseInt(parsed.port || '443'),
    network: parsed.searchParams.get('type') || 'tcp',
    path: parsed.searchParams.get('path') || '/',
    host: parsed.searchParams.get('host') || '',
    sni: parsed.searchParams.get('sni') || '',
    tls: parsed.searchParams.get('security') === 'tls',
  }

  if (protocol === 'vless') {
    return {
      ...base,
      type: 'vless',
      uuid: decodeURIComponentSafe(parsed.username),
      cipher: parsed.searchParams.get('encryption') || 'none',
    }
  }

  return null
}

function parseRawProxyList(rawUrls = '') {
  const entries = rawUrls
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  const proxies = entries
    .map((entry, index) => parseRawProxy(entry, index))
    .filter(entry => entry && entry.server && entry.port)

  if (!proxies.length) {
    throw new Error('configs not found')
  }

  return proxies
}

export function buildClashConfig(rawUrls = '') {
  const proxies = parseRawProxyList(rawUrls)
  const lines = ['mixed-port: 7890', 'allow-lan: false', 'mode: rule', 'log-level: info', '', 'proxies:']

  for (const proxy of proxies) {
    lines.push(`  - name: ${yamlQuote(proxy.name)}`)
    lines.push(`    type: ${proxy.type}`)
    lines.push(`    server: ${proxy.server}`)
    lines.push(`    port: ${proxy.port}`)
    lines.push(`    uuid: ${yamlQuote(proxy.uuid)}`)
    lines.push(`    cipher: ${yamlQuote(proxy.cipher)}`)
    lines.push('    udp: true')

    if (proxy.network === 'ws') {
      lines.push('    network: ws')
      if (proxy.tls) {
        lines.push('    tls: true')
      }
      if (proxy.sni) {
        lines.push(`    servername: ${yamlQuote(proxy.sni)}`)
      }
      lines.push('    ws-opts:')
      lines.push(`      path: ${yamlQuote(proxy.path || '/')}`)
      if (proxy.host) {
        lines.push('      headers:')
        lines.push(`        Host: ${yamlQuote(proxy.host)}`)
      }
    }
  }

  lines.push('', 'proxy-groups:', `  - name: ${yamlQuote('Auto')}`, '    type: select', '    proxies:')
  for (const proxy of proxies) {
    lines.push(`      - ${yamlQuote(proxy.name)}`)
  }

  lines.push('', 'rules:', '  - MATCH,Auto')
  return lines.join('\n')
}

export function buildClashProviderConfig(rawUrls = '') {
  const proxies = parseRawProxyList(rawUrls)
  const lines = ['proxies:']

  for (const proxy of proxies) {
    lines.push(`  - name: ${yamlQuote(proxy.name)}`)
    lines.push(`    server: ${yamlQuote(proxy.server)}`)
    lines.push(`    port: ${proxy.port}`)
    lines.push(`    type: ${proxy.type}`)
    lines.push(`    uuid: ${yamlQuote(proxy.uuid)}`)
    lines.push('    cipher: auto')

    if (proxy.tls) {
      lines.push('    tls: true')
      lines.push('    skip-cert-verify: true')
    }

    if (proxy.sni) {
      lines.push(`    servername: ${yamlQuote(proxy.sni)}`)
    }

    if (proxy.network === 'ws') {
      lines.push('    network: ws')
      lines.push('    ws-opts:')
      lines.push(`      path: ${yamlQuote(proxy.path || '/')}`)
      if (proxy.host) {
        lines.push('      headers:')
        lines.push(`        Host: ${yamlQuote(proxy.host)}`)
      }
    }

    lines.push('    udp: true')
  }

  return lines.join('\n')
}

export async function parseProxies(proxies: proxyType[], settings: ProxySettings) {
  const proxyParser = new ParseProxies(proxies, settings)

  switch (settings.format) {
    case 'raw':
      return proxyParser.toRaw()
    case 'clash':
    case 'mihomo':
      return proxyParser.toClash()
    case 'provider':
      return proxyParser.toProvider()
  }
}

class ParseProxies {
  proxies: proxyType[] = []
  settings: ProxySettings

  constructor(proxies: proxyType[], settings: ProxySettings) {
    this.proxies = proxies
    this.settings = settings
  }

  toRaw() {
    const results: string[] = []
    const configTemplate = URL.parse(vlessTemplate)

    if (configTemplate) {
      for (const proxy of this.proxies) {
        const config = new URL(configTemplate.toString())
        const configSearchParams = config.searchParams
        const effectiveHost = this.settings.wildcard
          ? `${this.settings.server}.${this.settings.host}`
          : this.settings.host

        config.protocol = 'vless:'
        config.hostname = this.settings.server
        config.port = this.settings.tls ? '443' : '80'
        configSearchParams.set('path', `/${proxy.ip}-${proxy.port}`)
        configSearchParams.set('security', this.settings.tls ? 'tls' : 'none')
        configSearchParams.set('host', effectiveHost)
        configSearchParams.set('sni', this.settings.tls ? effectiveHost : '')

        config.hash = `${getFlagEmoji(proxy.country)} ${proxy.isp} - ${proxy.ip}`

        config.search = configSearchParams.toString()
        results.push(config.toString())
      }
    }

    return results.join('\n')
  }

  toClash() {
    const proxies = this.toRaw()
    return buildClashConfig(proxies.split('\n').join(','))
  }

  toProvider() {
    const proxies = this.toRaw()
    return buildClashProviderConfig(proxies.split('\n').join(','))
  }
}
