const CLEAN_IP_URL = "https://raw.githubusercontent.com/vfarid/cf-clean-ips/main/list.txt";
const RAW_PROXY_LIST_FILE = "./raw.txt";

interface CleanIP {
  ip: string;
  port: number;
  country: string;
  org: string;
}

async function fetchCleanIPs(): Promise<CleanIP[]> {
  try {
    console.log("🌐 Fetching clean Cloudflare IPs from upstream...");
    const response = await fetch(CLEAN_IP_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    const lines = text.split("\n");
    const ips: CleanIP[] = [];
    
    let isIPv4Section = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Deteksi section IPv4
      if (trimmed.startsWith("IPv4:")) {
        isIPv4Section = true;
        continue;
      }
      // Stop jika masuk section IPv6 (karena proxy socket Cloudflare Workers dominan IPv4)
      if (trimmed.startsWith("IPv6:")) {
        isIPv4Section = false;
        continue;
      }

      if (isIPv4Section && trimmed.startsWith("-")) {
        // Format baris: "- 172.66.213.38      AFN      ircf.space    1706924168"
        const parts = trimmed.substring(1).trim().split(/\s+/);
        if (parts.length >= 3) {
          const ip = parts[0];
          const provider = parts[1]; // e.g. AFN, MCI, MTN
          
          // Petakan provider ke estimasi Country Code (Default SG/US jika tidak terpetakan)
          let cc = "SG";
          if (["MCI", "MTN", "RTL", "SHM"].includes(provider)) {
            cc = "IR"; // Iran telecom providers sering ada di database ini
          } else if (provider === "AST") {
            cc = "US";
          } else if (provider === "HWB" || provider === "AFN") {
            cc = "DE";
          }

          // Cek regex basic IPv4
          if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            ips.push({
              ip,
              port: 443, // Default port secure TLS proxy
              country: cc,
              org: `CF Clean IP (${provider})`
            });
          }
        }
      }
    }

    console.log(`✅ Loaded ${ips.length} clean Cloudflare IPs.`);
    return ips;
  } catch (error) {
    console.error("❌ Failed to fetch clean IPs:", error);
    return [];
  }
}

(async () => {
  const cleanIPs = await fetchCleanIPs();
  if (cleanIPs.length === 0) {
    console.log("⚠️ No IPs fetched. Aborting write.");
    process.exit(1);
  }

  // Tulis ke raw.txt
  const rawLines = cleanIPs.map(item => `${item.ip},${item.port},${item.country},${item.org}`);
  
  // Gunakan API Bun untuk menulis file
  await Bun.write(RAW_PROXY_LIST_FILE || "./raw.txt", rawLines.join("\n"));
  console.log(`💾 Successfully wrote ${cleanIPs.length} proxies to raw.txt!`);
  process.exit(0);
})();
