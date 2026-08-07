// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },
  tailwindcss: {
    exposeConfig: false,
  },
  modules: ['@nuxtjs/tailwindcss', '@nuxt/icon', '@pinia/nuxt'],
  ssr: false,
  nitro: {
    preset: 'static',
    compressPublicAssets: true,
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia'],
          },
        },
      },
    },
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'https://vpn.bits.co.id',
      githubProxyUrl:
        process.env.NUXT_PUBLIC_GITHUB_PROXY_URL ||
        'https://raw.githubusercontent.com/bitscoid/Cloudflare-VPN/refs/heads/main/Proxy/proxyList.txt',
      flagCdn:
        process.env.NUXT_PUBLIC_FLAG_CDN || 'https://hatscripts.github.io/circle-flags/flags',
    },
  },
  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'preload',
          href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;700&display=swap',
          as: 'style',
          onload: "this.onload=null;this.rel='stylesheet'",
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;700&display=swap',
          media: 'print',
          onload: "this.media='all'",
        },
      ],
    },
  },
  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
  },
})
