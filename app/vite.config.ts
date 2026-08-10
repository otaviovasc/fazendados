import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "FazenDados",
        short_name: "FazenDados",
        description: "Registro e consulta da operação da fazenda leiteira",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        theme_color: "#3E6B42",
        background_color: "#FAF7F1",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Dados operacionais nunca stale: API sempre vai à rede.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
          {
            // Tiles de satélite Esri (World Imagery).
            urlPattern: /^https:\/\/.*\.arcgisonline\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "esri-tiles",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Áudio do jogo.
            urlPattern: ({ url }) => url.pathname.startsWith("/audio/game/"),
            handler: "CacheFirst",
            options: {
              cacheName: "game-audio",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    port: 5180,
    proxy: { "/api": "http://localhost:3001" },
  },
});
