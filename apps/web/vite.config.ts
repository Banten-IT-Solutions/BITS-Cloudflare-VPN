import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: "dist",
    // prune CSS to a single file and output hashed assets for long caching
    cssCodeSplit: true,
  },
  server: {
    proxy: {
      "/api": "https://vpn.bits.co.id",
    },
  },
});