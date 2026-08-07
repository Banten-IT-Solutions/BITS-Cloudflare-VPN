interface ProxyHealth {
  error: boolean;
  message?: string;
  result: {
    proxy: string;
    port: number;
    proxyip: boolean;
    delay: number;
  };
}

interface MonitoredProxy {
  ip: string;
  port: number;
  delay: number | null;
  healthy: boolean;
}

export function appStore() {
  return {
    route: "monitor",
    loading: false,
    proxies: [] as MonitoredProxy[],

    async init() {
      this.readRoute();
      window.addEventListener("hashchange", () => this.readRoute());
      await this.runChecks();
    },

    readRoute() {
      this.route = location.hash.replace("#/", "") || "monitor";
    },

    async runChecks() {
      this.loading = true;
      // Wire to your D1-backed subscription list in production.
      const list: { ip: string; port: number }[] = [
        { ip: "1.1.1.1", port: 443 },
        { ip: "8.8.8.8", port: 443 },
      ];
      this.proxies = list.map((p) => ({ ...p, delay: null, healthy: true }));

      for (const p of this.proxies) {
        try {
          const r = (await fetch(`/api/v1/check?ip=${p.ip}:${p.port}`).then((r) =>
            r.json(),
          )) as ProxyHealth;
          p.healthy = !r.error && r.result.proxyip;
          p.delay = r.result.delay;
        } catch {
          p.healthy = false;
          p.delay = null;
        }
      }
      this.loading = false;
    },
  };
}