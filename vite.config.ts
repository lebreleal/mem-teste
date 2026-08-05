import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png", "pwa-192x192.png"],
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
        /**
         * Heavy, route-specific bundles (editor, PDF, charts, sql-wasm) and
         * raster images are pulled out of the install-time precache — they used
         * to make the service worker download ~3.8 MB on first visit. They are
         * still cached, but lazily, the first time a route actually needs them.
         */
        globIgnores: [
          "**/vendor-tiptap-*.js",
          "**/vendor-pdf-*.js",
          "**/ComposedChart-*.js",
          "**/sql-wasm*-*.js",
          "**/*.{png,jpg,jpeg,webp}",
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.destination === "script",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "js-lazy", expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ request }: { request: Request }) => request.destination === "image",
            handler: "CacheFirst",
            options: { cacheName: "images", expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
      manifest: {
        name: "MemoCards",
        short_name: "MemoCards",
        description: "Estude com flashcards inteligentes usando repetição espaçada",
        theme_color: "#faf9f7",
        background_color: "#faf9f7",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/dashboard",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        /**
         * Function form (not object form): the object form let shared modules
         * such as react/jsx-runtime fall into vendor-tiptap, which turned that
         * 384KB chunk into a dependency of the entry and made Vite inject a
         * <link rel="modulepreload"> for it on every route.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          const path = id.split('node_modules/').pop() ?? '';
          if (/^(\.pnpm\/)?(react|react-dom|react-router|react-router-dom|scheduler)(@|\/|$)/.test(path)) {
            return 'vendor-react';
          }
          if (path.includes('@tiptap') || path.includes('prosemirror')) {
            return 'vendor-tiptap';
          }
          if (path.includes('pdfjs-dist')) return 'vendor-pdf';
          if (path.includes('@supabase')) return 'vendor-supabase';
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
}));
