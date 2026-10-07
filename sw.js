/* Lakshyam service worker.
   - Caches the app shell so studying works offline.
   - Only ever touches caches whose names start with "lakshyam-".
     (Other apps on the same site keep their caches.)
   - A new version waits until the user taps "Refresh" in the app. */

const VERSION = "0.1.0";
const PREFIX = "lakshyam-";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/app.css",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./src/main.js",
  "./src/core/version.js",
  "./src/core/dom.js",
  "./src/core/i18n.js",
  "./src/core/router.js",
  "./src/core/toast.js",
  "./src/core/entitlements.js",
  "./src/core/flags.js",
  "./src/core/storage-health.js",
  "./src/core/sw-client.js",
  "./src/core/icons.js",
  "./src/strings/en.js",
  "./src/features/today/today.js",
  "./src/features/library/library.js",
  "./src/features/progress/progress.js",
  "./src/features/notes/notes.js",
  "./src/features/settings/settings.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(PREFIX) && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never cache other origins (AI providers, etc.).
  if (url.origin !== self.location.origin) return;

  // Page loads: serve the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // App files: cache first, so the app opens instantly and offline.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request))
  );
});
