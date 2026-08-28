const CLEAN_IP_URL = 'https://raw.githubusercontent.com/vfarid/cf-clean-ips/main/list.txt';
const IRCF_JSON_URL = 'https://raw.githubusercontent.com/ircfspace/cf2dns/master/list/ipv4.json';
// Main raw proxy source: Nautica (FoolVPN) — rawProxyList.txt contains about 12.5k IPs
const NAUTICA_URL = 'https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/rawProxyList.txt';
const RAW_PROXY_LIST_FILE = './raw.txt';

interface ProxyEntry {
  ip: string;
  port: number;
  country: string;
  org: string;
}

// Read existing local raw.txt
async function readExistingRaw(): Promise<ProxyEntry[]> {
  try {
    const file = Bun.file(RAW_PROXY_LIST_FILE);
    if (!(await file.exists())) return [];

    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const list: ProxyEntry[] = [];

    for (const line of lines) {
      const [ip, portStr, country, org] = line.split(',');
      const port = parseInt(portStr, 10);
      if (ip && !isNaN(port)) {
        list.push({
          ip: ip.trim(),
          port,
          country: (country || 'SG').trim(),
          org: (org || 'Proxy').trim(),
        });
      }
    }
    return list;
  } catch (error) {
    console.warn('⚠️ Failed to read existing raw.txt:', error);
    return [];
  }
}

// Parse standard format text proxy list (IP,Port,Country,Org)
function parseStandardText(text: string): ProxyEntry[] {
  const lines = text.split('\n').filter(Boolean);
  const list: ProxyEntry[] = [];
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const ip = parts[0].trim();
      const port = parseInt(parts[1], 10);
      const country = (parts[2] || 'SG').trim();
      const org = (parts[3] || 'Proxy').trim();

      // Clean up organization string (replace "+" with space)
      const cleanOrg = org.replace(/\+/g, ' ');

      if (ip && !isNaN(port) && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
        list.push({ ip, port, country, org: cleanOrg });
      }
    }
  }
  return list;
}

// Fetch from vfarid/cf-clean-ips (clean Cloudflare IPs)
async function fetchVfaridIPs(): Promise<ProxyEntry[]> {
  try {
    console.log('🌐 Fetching clean Cloudflare IPs from vfarid...');
    const response = await fetch(CLEAN_IP_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const lines = text.split('\n');
    const list: ProxyEntry[] = [];
    let isIPv4Section = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('IPv4:')) {
        isIPv4Section = true;
        continue;
      }
      if (trimmed.startsWith('IPv6:')) {
        isIPv4Section = false;
        continue;
      }

      if (isIPv4Section && trimmed.startsWith('-')) {
        const parts = trimmed.substring(1).trim().split(/\s+/);
        if (parts.length >= 3) {
          const ip = parts[0];
          const provider = parts[1];
          let cc = 'SG';
          if (['MCI', 'MTN', 'RTL', 'SHM'].includes(provider)) cc = 'IR';

          if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            list.push({
              ip,
              port: 443,
              country: cc,
              org: `CF Clean IP (${provider})`,
            });
          }
        }
      }
    }
    return list;
  } catch (error) {
    console.error('❌ Failed to fetch from vfarid:', error);
    return [];
  }
}

// Fetch from ircfspace/cf2dns (clean Cloudflare JSON list)
async function fetchIrcfIPs(): Promise<ProxyEntry[]> {
  try {
    console.log('🌐 Fetching clean Cloudflare IPs from ircfspace...');
    const response = await fetch(IRCF_JSON_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as any[];
    const list: ProxyEntry[] = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        const ip = item.ip;
        const line = item.line || 'CF';

        if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
          list.push({
            ip,
            port: 443,
            country: 'US',
            org: `CF Clean IP (IRCF-${line})`,
          });
        }
      }
    }
    return list;
  } catch (error) {
    console.error('❌ Failed to fetch from ircfspace:', error);
    return [];
  }
}

// Fetch from upstream Nautica (FoolVPN-ID) — main raw proxy source
async function fetchNautica(): Promise<ProxyEntry[]> {
  try {
    console.log('🌐 Fetching raw proxy list from Nautica (FoolVPN)...');
    const response = await fetch(NAUTICA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseStandardText(await response.text());
  } catch (error) {
    console.error('❌ Failed to fetch from Nautica (FoolVPN):', error);
    return [];
  }
}

(async () => {
  // Read local + fetch remote with independent failure tolerance
  const existing = await readExistingRaw();
  const listNautica = await fetchNautica();
  const listVfarid = await fetchVfaridIPs();
  const listIrcf = await fetchIrcfIPs();

  console.log(`📊 Current raw.txt: ${existing.length} IPs`);
  console.log(`📊 Fetched from Nautica (FoolVPN): ${listNautica.length} IPs`);
  console.log(`📊 Fetched from vfarid: ${listVfarid.length} IPs`);
  console.log(`📊 Fetched from ircfspace: ${listIrcf.length} IPs`);

  // Merge secara unik berdasarkan IP
  const mergedMap = new Map<string, ProxyEntry>();

  // 1. Insert existing list first to preserve original country/org data
  for (const item of existing) {
    mergedMap.set(item.ip, item);
  }

  // 2. Merge new data only when IP is not already present
  const allNewLists = [...listNautica, ...listVfarid, ...listIrcf];
  let addedCount = 0;
  for (const item of allNewLists) {
    if (!mergedMap.has(item.ip)) {
      mergedMap.set(item.ip, item);
      addedCount++;
    }
  }

  const mergedList = Array.from(mergedMap.values());

  // Sort by country code for stable output
  mergedList.sort((a, b) => a.country.localeCompare(b.country));

  // Write to raw.txt
  const rawLines = mergedList.map(item => `${item.ip},${item.port},${item.country},${item.org}`);
  await Bun.write(RAW_PROXY_LIST_FILE, rawLines.join('\n'));

  console.log(
    `💾 Successfully merged. Total proxies in raw.txt: ${mergedList.length} IPs (Added ${addedCount} new unique IPs)`
  );
  process.exit(0);
})();
