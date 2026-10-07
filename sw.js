/* Lakshyam service worker.
   - Caches the app shell so studying works offline.
   - Only ever touches caches whose names start with "lakshyam-".
     (Other apps on the same site keep their caches.)
   - A new version waits until the user taps "Refresh" in the app. */

const VERSION = "0.5.0";
const PREFIX = "lakshyam-";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./icons/maskable-512.png",
  "./src/core/charts.js",
  "./src/core/clipboard.js",
  "./src/core/dialogs.js",
  "./src/core/dom.js",
  "./src/core/entitlements.js",
  "./src/core/files.js",
  "./src/core/flags.js",
  "./src/core/i18n.js",
  "./src/core/icons.js",
  "./src/core/longpress.js",
  "./src/core/math.js",
  "./src/core/router.js",
  "./src/core/sheet.js",
  "./src/core/storage-health.js",
  "./src/core/sw-client.js",
  "./src/core/toast.js",
  "./src/core/version.js",
  "./src/data/backup.js",
  "./src/data/db.js",
  "./src/data/ids.js",
  "./src/data/import-legacy.js",
  "./src/data/mutations.js",
  "./src/data/paper-json.js",
  "./src/data/schema.js",
  "./src/data/snapshots.js",
  "./src/data/store.js",
  "./src/data/taxonomy-seed.js",
  "./src/data/tests.js",
  "./src/domain/scoring.js",
  "./src/domain/stats.js",
  "./src/domain/study.js",
  "./src/domain/testing.js",
  "./src/domain/text.js",
  "./src/features/import/import-flow.js",
  "./src/features/library/banks.js",
  "./src/features/library/library.js",
  "./src/features/library/paper-files.js",
  "./src/features/library/topic-actions.js",
  "./src/features/library/topic-picker.js",
  "./src/features/notes/note-editor.js",
  "./src/features/notes/notes.js",
  "./src/features/progress/data.js",
  "./src/features/progress/drill.js",
  "./src/features/progress/progress.js",
  "./src/features/progress/tables.js",
  "./src/features/question/card.js",
  "./src/features/question/copy.js",
  "./src/features/question/exam-filter.js",
  "./src/features/question/list.js",
  "./src/features/question/pager.js",
  "./src/features/search/search.js",
  "./src/features/settings/settings.js",
  "./src/features/settings/syllabi.js",
  "./src/features/test/results.js",
  "./src/features/test/start-sheet.js",
  "./src/features/test/test-screen.js",
  "./src/features/today/today.js",
  "./src/main.js",
  "./src/strings/en.js",
  "./styles/app.css",
  "./vendor/katex/contrib/auto-render.min.js",
  "./vendor/katex/katex.min.css",
  "./vendor/katex/katex.min.js",
  "./vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2"
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
  // Anything not in the list (e.g. maths fonts) is cached the first time it loads.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
