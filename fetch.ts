const CLEAN_IP_URL = "https://raw.githubusercontent.com/vfarid/cf-clean-ips/main/list.txt";
const IRCF_JSON_URL = "https://raw.githubusercontent.com/ircfspace/cf2dns/master/list/ipv4.json";
const RAW_PROXY_LIST_FILE = "./raw.txt";

interface ProxyEntry {
  ip: string;
  port: number;
  country: string;
  org: string;
}

// Membaca file raw.txt yang sudah ada secara lokal
async function readExistingRaw(): Promise<ProxyEntry[]> {
  try {
    const file = Bun.file(RAW_PROXY_LIST_FILE);
    if (!(await file.exists())) return [];
    
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    const list: ProxyEntry[] = [];
    
    for (const line of lines) {
      const [ip, portStr, country, org] = line.split(",");
      const port = parseInt(portStr, 10);
      if (ip && !isNaN(port)) {
        list.push({ ip: ip.trim(), port, country: (country || "SG").trim(), org: (org || "Proxy").trim() });
      }
    }
    return list;
  } catch (error) {
    console.warn("⚠️ Failed to read existing raw.txt:", error);
    return [];
  }
}

// Fetch dari vfarid/cf-clean-ips (Text parser)
async function fetchVfaridIPs(): Promise<ProxyEntry[]> {
  try {
    console.log("🌐 Fetching clean Cloudflare IPs from vfarid...");
    const response = await fetch(CLEAN_IP_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const text = await response.text();
    const lines = text.split("\n");
    const list: ProxyEntry[] = [];
    let isIPv4Section = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("IPv4:")) { isIPv4Section = true; continue; }
      if (trimmed.startsWith("IPv6:")) { isIPv4Section = false; continue; }

      if (isIPv4Section && trimmed.startsWith("-")) {
        const parts = trimmed.substring(1).trim().split(/\s+/);
        if (parts.length >= 3) {
          const ip = parts[0];
          const provider = parts[1];
          let cc = "SG";
          if (["MCI", "MTN", "RTL", "SHM"].includes(provider)) cc = "IR";
          
          if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            list.push({
              ip,
              port: 443,
              country: cc,
              org: `CF Clean IP (${provider})`
            });
          }
        }
      }
    }
    return list;
  } catch (error) {
    console.error("❌ Failed to fetch from vfarid:", error);
    return [];
  }
}

// Fetch dari ircfspace/cf2dns (JSON parser)
async function fetchIrcfIPs(): Promise<ProxyEntry[]> {
  try {
    console.log("🌐 Fetching clean Cloudflare IPs from ircfspace...");
    const response = await fetch(IRCF_JSON_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json() as any[];
    const list: ProxyEntry[] = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        const ip = item.ip;
        const line = item.line || "CF";
        
        if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
          list.push({
            ip,
            port: 443,
            country: "US", // Default untuk global pool
            org: `CF Clean IP (IRCF-${line})`
          });
        }
      }
    }
    return list;
  } catch (error) {
    console.error("❌ Failed to fetch from ircfspace:", error);
    return [];
  }
}

(async () => {
  // Read local + fetch remote (dengan toleransi kegagalan masing-masing)
  const existing = await readExistingRaw();
  const listVfarid = await fetchVfaridIPs();
  const listIrcf = await fetchIrcfIPs();
  
  console.log(`📊 Current raw.txt: ${existing.length} IPs`);
  console.log(`📊 Fetched from vfarid: ${listVfarid.length} IPs`);
  console.log(`📊 Fetched from ircfspace: ${listIrcf.length} IPs`);

  // Merge secara unik berdasarkan IP
  const mergedMap = new Map<string, ProxyEntry>();
  
  // 1. Masukkan list existing terlebih dahulu (agar informasi asli terjaga)
  for (const item of existing) {
    mergedMap.set(item.ip, item);
  }
  
  // 2. Gabungkan data baru (jika IP belum ada)
  for (const item of listVfarid) {
    if (!mergedMap.has(item.ip)) {
      mergedMap.set(item.ip, item);
    }
  }
  for (const item of listIrcf) {
    if (!mergedMap.has(item.ip)) {
      mergedMap.set(item.ip, item);
    }
  }

  const mergedList = Array.from(mergedMap.values());
  
  // Urutkan berdasarkan kode negara agar tertata
  mergedList.sort((a, b) => a.country.localeCompare(b.country));

  // Tulis ke raw.txt
  const rawLines = mergedList.map(item => `${item.ip},${item.port},${item.country},${item.org}`);
  await Bun.write(RAW_PROXY_LIST_FILE, rawLines.join("\n"));
  
  console.log(`💾 Successfully merged. Total proxies in raw.txt: ${mergedList.length} IPs (Added ${mergedList.length - existing.length} new IPs)`);
  process.exit(0);
})();
