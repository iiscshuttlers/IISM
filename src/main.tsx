import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "sonner";
import App from "./App";
import { SessionProvider } from "./lib/session";
import { UpdatePrompt, applyOutdoor, readOutdoor } from "./components/AppChrome";
import { CACHE_KEY } from "./lib/session";
import "./index.css";

applyOutdoor(readOutdoor());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true, gcTime: 7 * 24 * 60 * 60 * 1000 },
  },
});

// Keeps the last-seen camp data on the phone so the app opens courtside with no signal.
// Admin-only and sensitive data (emails, assessments, wellness) is never written to storage.
const NOT_PERSISTED = new Set(["rosterAdmin", "assessments", "wellness", "selection"]);
const persister = createSyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: CACHE_KEY,
  throttleTime: 2000,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        buster: "v1",
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === "success" && !NOT_PERSISTED.has(String(q.queryKey[0])),
        },
      }}
    >
      <SessionProvider>
        <App />
        <UpdatePrompt />
        <Toaster position="top-center" richColors />
      </SessionProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
