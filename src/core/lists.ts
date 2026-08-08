// Proxy list fetchers dari worker.js (baris 46-88)
import { KV_PRX_URL, PRX_BANK_URL } from "./constants";

export interface ProxyEntry {
  prxIP: string;
  prxPort: string;
  country: string;
  org: string;
}

let cachedPrxList: ProxyEntry[] = [];

export async function getKVPrxList(kvPrxUrl: string = KV_PRX_URL): Promise<Record<string, string[]>> {
  if (!kvPrxUrl) {
    throw new Error("No URL Provided!");
  }

  const kvPrx = await fetch(kvPrxUrl);
  if (kvPrx.status == 200) {
    return await kvPrx.json();
  } else {
    return {};
  }
}

export async function getPrxList(prxBankUrl: string = PRX_BANK_URL): Promise<ProxyEntry[]> {
  /**
   * Format:
   *
   * <IP>,<Port>,<Country ID>,<ORG>
   * Contoh:
   * 1.1.1.1,443,SG,Cloudflare Inc.
   */
  if (!prxBankUrl) {
    throw new Error("No URL Provided!");
  }

  const prxBank = await fetch(prxBankUrl);
  if (prxBank.status == 200) {
    const text = (await prxBank.text()) || "";

    const prxString = text.split("\n").filter(Boolean);
    cachedPrxList = prxString
      .map((entry) => {
        const [prxIP, prxPort, country, org] = entry.split(",");
        return {
          prxIP: prxIP || "Unknown",
          prxPort: prxPort || "Unknown",
          country: country || "Unknown",
          org: org || "Unknown Org",
        };
      })
      .filter(Boolean);
  }

  return cachedPrxList;
}
