import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

// GitHub Pages has no SPA rewrites: serving index.html as 404.html makes deep links
// (e.g. /IISM/matches) load the app instead of GitHub's 404 page.
const spaFallback = (): Plugin => ({
  name: "spa-404-fallback",
  apply: "build",
  closeBundle() {
    copyFileSync("dist/index.html", "dist/404.html");
  },
});

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH || "/",
  server: { port: 5199 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until the user taps "Refresh" (no reload mid-match entry).
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico", "icon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        id: "./",
        name: "IISc Training Camp",
        short_name: "Training Camp",
        description: "Practice matches, training log and squad selection for the IISc badminton selection camp.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f766e",
        theme_color: "#0f766e",
        categories: ["sports"],
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Record a match", short_name: "Record", url: "./matches?new=1" },
          { name: "Standings", url: "./standings" },
          { name: "Training", url: "./training" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // App routes open offline from the cached shell; the static privacy page is its own file.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/privacy\.html$/],
        cleanupOutdatedCaches: true,
        // Supabase API calls are never cached by the service worker.
        // Phone alerts: push and notification-tap handlers (public/push-sw.js).
        importScripts: ["push-sw.js"],
      },
      devOptions: { enabled: false },
    }),
    spaFallback(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: an app update doesn't make phones re-download the libraries.
        manualChunks: {
          react: ["react", "react-dom", "wouter"],
          supabase: ["@supabase/supabase-js"],
          query: ["@tanstack/react-query", "@tanstack/react-query-persist-client", "@tanstack/query-sync-storage-persister"],
        },
      },
    },
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
