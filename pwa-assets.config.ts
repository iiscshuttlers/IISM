import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Run `npx pwa-assets-generator` after changing public/icon.svg; the PNGs are committed.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: "#0f766e" } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: "#0f766e" } },
  },
  images: ["public/icon.svg"],
});
