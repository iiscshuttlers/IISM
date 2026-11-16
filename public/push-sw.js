/* Phone alerts (Web Push). vite-plugin-pwa's generated service worker loads this with
   importScripts (see vite.config.ts). Alerts come from the send-push Edge Function as
   {title, body, url, tag}; url is an app path such as "/matches?match=<id>" or "/". */

function appUrl(path) {
  // The app may live under a sub-path (GitHub Pages); the service worker's scope is its root.
  return new URL(String(path || "").replace(/^\/+/, ""), self.registration.scope).href;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: data.body || "",
    icon: appUrl("pwa-192x192.png"),
    data: { url: appUrl(data.url || "/") },
  };
  if (data.tag) {
    // A newer alert about the same match or notice replaces the older one, and still buzzes.
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title || "IISc Training Camp", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((w) => w.url.startsWith(self.registration.scope));
    if (open) {
      // Route inside the running app (no reload, so nothing typed is lost), then bring it forward.
      open.postMessage({ type: "push-open", url: target });
      await open.focus().catch(() => undefined);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

// The browser replaced the subscription (keys rotated or expired): subscribe again with the same
// key so alerts keep arriving. The app saves the new one to the camp database next time it opens.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options || !options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .catch(() => undefined),
  );
});
