/* Lakshyam service worker.
   - Caches the app shell so studying works offline.
   - Only ever touches caches whose names start with "lakshyam-".
     (Other apps on the same site keep their caches.)
   - A new version waits until the user taps "Refresh" in the app. */

const VERSION = "1.8.0";
// Background backup through your own Google script (see src/cloud/sw-backup.js).
importScripts("./src/cloud/sw-backup.js");
const PREFIX = "lakshyam-";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
// The PDF reader is large (about 1.4 MB), so it is not downloaded with the app.
// It is saved the first time Study PDFs is used, in its own cache that survives
// app updates (rename this cache if pdf.js is ever upgraded).
const PDFJS_CACHE = `${PREFIX}pdfjs-3.11.174`;
const KEEP = [SHELL_CACHE, PDFJS_CACHE];

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./icons/maskable-512.png",
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
  "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2",
  "./content/taxonomy-ml.json",
  "./styles/guide.css",
  "./guide/lakshyam-guide-en.pdf",
  "./guide/lakshyam-guide-ml.pdf",
  "./src/ai/client.js",
  "./src/ai/pdf-prompts.js",
  "./src/ai/presets.js",
  "./src/ai/prompts.js",
  "./src/cloud/drive.js",
  "./src/cloud/relay-script.js",
  "./src/cloud/relay.js",
  "./src/cloud/sw-backup.js",
  "./src/core/back.js",
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
  "./src/core/names.js",
  "./src/core/router.js",
  "./src/core/sheet.js",
  "./src/core/storage-health.js",
  "./src/core/sw-client.js",
  "./src/core/theme-boot.js",
  "./src/core/theme.js",
  "./src/core/toast.js",
  "./src/core/version.js",
  "./src/core/wake.js",
  "./src/data/backup.js",
  "./src/data/db.js",
  "./src/data/diary.js",
  "./src/data/exams.js",
  "./src/data/ids.js",
  "./src/data/import-legacy.js",
  "./src/data/ml-names.js",
  "./src/data/mutations.js",
  "./src/data/paper-json.js",
  "./src/data/review.js",
  "./src/data/schema.js",
  "./src/data/snapshots.js",
  "./src/data/store.js",
  "./src/data/taxonomy-seed.js",
  "./src/data/tests.js",
  "./src/data/timetable.js",
  "./src/domain/ai-instructions.js",
  "./src/domain/cards.js",
  "./src/domain/diary.js",
  "./src/domain/exams.js",
  "./src/domain/focus.js",
  "./src/domain/habits.js",
  "./src/domain/insights.js",
  "./src/domain/review.js",
  "./src/domain/scoring.js",
  "./src/domain/stats.js",
  "./src/domain/study.js",
  "./src/domain/testing.js",
  "./src/domain/text.js",
  "./src/domain/timetable.js",
  "./src/domain/topic-pattern.js",
  "./src/features/ai/ai-actions.js",
  "./src/features/ai/ai-settings.js",
  "./src/features/ai/ai-ui.js",
  "./src/features/ai/content.js",
  "./src/features/diary/diary.js",
  "./src/features/guide/content.js",
  "./src/features/guide/guide.js",
  "./src/features/import/import-flow.js",
  "./src/features/insights/focus-view.js",
  "./src/features/insights/insights.js",
  "./src/features/library/banks.js",
  "./src/features/library/library.js",
  "./src/features/library/paper-files.js",
  "./src/features/library/topic-actions.js",
  "./src/features/library/topic-picker.js",
  "./src/features/notes/note-editor.js",
  "./src/features/notes/notes.js",
  "./src/features/pdfs/pdfs.js",
  "./src/features/progress/data.js",
  "./src/features/progress/drill.js",
  "./src/features/progress/map.js",
  "./src/features/progress/progress.js",
  "./src/features/progress/tables.js",
  "./src/features/question/card.js",
  "./src/features/question/copy.js",
  "./src/features/question/exam-filter.js",
  "./src/features/question/list.js",
  "./src/features/question/pager.js",
  "./src/features/search/search.js",
  "./src/features/settings/difficulty-times.js",
  "./src/features/settings/drive.js",
  "./src/features/settings/names.js",
  "./src/features/settings/settings-index.js",
  "./src/features/settings/settings.js",
  "./src/features/settings/syllabi.js",
  "./src/features/test/results.js",
  "./src/features/test/start-sheet.js",
  "./src/features/test/test-screen.js",
  "./src/features/timetable/common.js",
  "./src/features/timetable/now-card.js",
  "./src/features/timetable/timetable.js",
  "./src/features/timetable/tt-edit.js",
  "./src/features/timetable/tt-new.js",
  "./src/features/today/countdown.js",
  "./src/features/today/session.js",
  "./src/features/today/today.js",
  "./src/main.js",
  "./src/pdf/pdf-jobs.js",
  "./src/pdf/pdf-reader.js",
  "./src/pdf/pdf-store.js",
  "./src/pdf/pdf-tools.js",
  "./src/strings/en.js",
  "./src/strings/ml-1.js",
  "./src/strings/ml-2.js",
  "./src/strings/ml-3.js",
  "./src/strings/ml-4.js",
  "./src/strings/ml-5.js",
  "./src/strings/ml-6.js",
  "./src/strings/ml-7.js",
  "./src/strings/ml-8.js",
  "./src/strings/ml-9.js",
  "./src/strings/ml.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(PREFIX) && !KEEP.includes(key))
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "lakshyam-backup") event.waitUntil(self.lakshyamBackup.run(VERSION).catch(() => "error"));
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
      const cache = await caches.open(url.pathname.includes("/vendor/pdfjs/") ? PDFJS_CACHE : SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
