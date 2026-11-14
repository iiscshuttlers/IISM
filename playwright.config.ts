import { defineConfig, devices } from "@playwright/test";

// Smoke tests against the production build (served by `vite preview`). They need no real
// Supabase project: a placeholder URL keeps the app on the sign-in screen.
const PORT = 4178;
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Pixel 7"] },
  webServer: {
    command: `npm run build:e2e && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { BASE_PATH: "/", VITE_SUPABASE_URL: "https://placeholder.supabase.co", VITE_SUPABASE_ANON_KEY: "placeholder" },
  },
});
