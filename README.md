# Lakshyam

Daily study for Kerala PSC: previous question papers, tests, progress, a timetable and notes.
A static web app (PWA) that installs on Android and works offline.

**Open it:** https://lakshyam-app.github.io/lakshyam/ → browser menu → *Add to Home screen* / *Install app*.

This is a **new, separate app**. It never reads or changes the data of PSC Exam Vault
or any other app. Your data comes in only from an export file you choose.

---

## For users

### Getting started

1. Open the app and tap **Import from PSC Exam Vault** (or Settings → Backup → Import).
   Choose the export file. Lakshyam checks it, shows what it will add, and verifies it after saving.
2. Pick your syllabus from the chip at the top.
3. On Today, tap **Set your exam date**. You can keep up to 20 exams (Today → tap a countdown) and choose
   which ones Today shows (the nearest few, or the ones you pick) and how: large cards, tiles or a compact list.
4. Make a timetable (Progress → 🗓 My timetable) — by hand or as an AI draft you review.

### The four tabs

| Tab | What you do there |
|---|---|
| **Today** | Exam countdown, what to study now, Quick 10, daily goal, streak, due reviews, the day's checklist and day review (opens the study diary), unfinished test |
| **Library** | Subjects → topics → questions, all topics, papers, banks, Study PDFs; ▶ Practice on any list |
| **Progress** | Score per 100, insights, where marks go, drill-down, detailed tables, test history, 🔎 Smart insights, 🗓 My timetable |
| **Notes** | All your notes, searchable, each linked back to its question or topic |

Search (🔍) and Settings (⚙) are in the top bar.

**Focus check** (Settings → Tests & questions, on by default): leaving the app for 5 seconds or more during a test
(not while paused) is counted and shown on the result. Smart insights → *When you focus best* shows your
accuracy by time of day, compared with your usual on the same topics, and says only when a difference is clear.

### Adding papers with an AI

Library → Papers → **+ Add paper** → **📋 Copy instructions for AI**. Paste them into any AI chat
together with the question-paper PDF; it returns a JSON file you bring back here.
The instructions list *your* subjects and topics, so questions land in the right place.
The same button exists for answer keys and explanations. Static copies:
[`docs/ai-instructions-for-json.md`](docs/ai-instructions-for-json.md),
[`docs/ai-instructions-for-answer-keys.md`](docs/ai-instructions-for-answer-keys.md),
and an example file: [`docs/sample-paper.json`](docs/sample-paper.json).

### AI features

Settings → AI → add a preset (Gemini, OpenAI, Claude, Groq, OpenRouter and others) with your own key.
Your keys stay on this phone only: they are never in backups, exports or the code.
Presets fall back to the next one if one fails, and can be paused.

### Keeping your data safe

- Settings → Backup & data → **Google Drive backup**: connect once; backups go to *Lakshyam backups/<phone name>* in your own Drive
  (only files Lakshyam makes are visible to it). The newest 10 copies per phone are kept; restore from the same screen.

- Settings → Backup → **Export** saves everything to one file (a reminder appears if you haven't in a while).
- Big changes (imports, restores, start fresh, merges, difficulty re-runs) keep a **safety copy** first:
  Settings → Undo.
- Study PDFs and AI keys stay on the phone; they are not in backups.
- Clearing the browser's site data for this address deletes Lakshyam's data. Export first.

### Settings

Settings (⚙) has a search box and eight groups: Study goals & Today · Theme & language · Tests & questions ·
Progress & stats · Syllabuses & marking · AI · Backup & data · About & updates. Search finds a setting in English
or Malayalam and opens it highlighted.

Theme: Phone setting (follows the phone's light / dark mode), Light, Dark or Paper (a warm page with dark text,
like a printed question paper). App language: English / മലയാളം;
subject/topic names in English, Malayalam or both.

---

## For developers

No build step: plain ES modules served as static files.

```
python3 -m http.server 8765        # then open http://localhost:8765/
node --test tests/*.test.mjs       # unit tests (Node 20+)
node tools/gen-docs.mjs            # regenerate docs/ai-instructions-*.md from the code
```

GitHub Actions ([`.github/workflows/test.yml`](.github/workflows/test.yml)) runs the unit tests on every push
and checks that the generated docs are up to date. Tests use only made-up data;
never commit a real backup (the repo is public).

### Folders

```
index.html, manifest.webmanifest, sw.js   page, install info, offline cache (SHELL_FILES)
icons/                                     app icons
styles/app.css                             all styling (light/dark follows the phone)
content/taxonomy-ml.json                   Malayalam subject/topic names from the KPSC syllabus
vendor/katex/                              maths rendering (offline)
vendor/pdfjs/                              Mozilla pdf.js 3.11.174 (Apache-2.0), loaded only for Study PDFs
src/main.js                                start-up: shell, tabs, screens
src/core/                                  router, sheets, dialogs, i18n, names, toasts, text, version
src/data/                                  IndexedDB, repository (store.js), import, backup, safety copies, mutations
src/domain/                                pure logic, no screen code: scoring, stats, testing, habits,
                                           timetable, diary, insights, AI instructions
src/ai/                                    AI client (presets, fallback, pausing) and prompts
src/pdf/                                   Study PDFs: text tools, storage, reader, AI jobs
src/cloud/                                 Google Drive backup client; relay-script.js (your own Apps Script), relay.js, sw-backup.js (background)
src/features/<name>/                       one folder per area: today, library, question, test, progress,
                                           insights, timetable, diary, notes, search, ai, pdfs, import, settings
src/strings/                               interface text: en.js, ml.js (ml-1 … ml-6); missing ml text falls back to English
tests/                                     unit tests (node --test)
tools/gen-docs.mjs                         writes the AI instruction docs
tools/gen-guide.mjs                        builds guide/*.pdf from src/features/guide/content.js (needs Playwright)
guide/                                     the “How to use” PDFs (English, Malayalam), served offline
docs/                                      redesign brief, feature check, AI instructions, sample paper
```

### Storage names (separate from all other apps)

- Database: `lakshyam-db` (IndexedDB), layout version **2**. Migrations only add stores
  (v2 added `timetables`, `ttLog`, `diary`).
- Settings live in the `settings` store of the database. The only `localStorage` key is `lakshyam-theme`,
  a copy of the theme choice so the first paint has the right colours (`src/core/theme-boot.js`).
- Offline cache: names starting with `lakshyam-`; the service worker never touches other caches.
  The PDF reader cache (`lakshyam-pdfjs-…`) is kept across updates.
- Private stores, never in backups: `aiPresets`, `pdfs`, `snapshots`, `importLog`. The `drive` setting (this phone's Drive link) is also never exported.
- Google sign-in: Google Identity Services token client, scope `drive.file`; the access token stays in memory only. Client ID in `src/cloud/drive.js` (public by design; no secret).

### Releasing

Bump `VERSION` in `sw.js` and `APP_VERSION` in `src/core/version.js`, and list any new file in
`SHELL_FILES`. Push to `main`; GitHub Pages serves it. The app shows "A new version is ready —
Refresh" and switches only when you tap it.

### Ready for later

Data access goes through `src/data/store.js`, records carry IDs and timestamps, interface text is
in `src/strings/`, and AI calls go through one client, so accounts, sync or a paid tier can be
added without rewriting screens. See [`docs/redesign-brief.md` §13](docs/redesign-brief.md).

---

## Status

All planned phases (0–9) are done; see the [redesign brief](docs/redesign-brief.md) for the plan
and [`docs/feature-check.md`](docs/feature-check.md) for where every old-app feature lives now.

| Phase | What |
|---|---|
| 0–2 | Shell, data layer, verified import, backup/undo, Library and editing |
| 3–5 | Tests and results, Progress, Today |
| 6–7 | AI tools and flashcards, Study PDFs |
| 8 | Malayalam names |
| 8+ | Timetable, countdown, study diary, Smart insights, app in Malayalam and more |
| 9 | Accessibility, speed check, AI instructions in the app, sample paper, CI, feature check (1.0.0) |
| 1.1 | Theme choice, clearer question cards (especially dark), Settings in groups with search |
| 1.2 | Paper theme |
| 1.3 | Up to 20 exam countdowns, with a choice of which and how Today shows them |
| 1.6 | Automatic Drive backup without sign-in, through your own Google Apps Script (docs/apps-script); background backup on installed app |
| 1.5 | How to use Lakshyam: illustrated demo + PDF (English, മലയാളം) in Settings |
| 1.10 | 📝 Notes tab next to Cards: revision notes from study PDFs, one per PDF run; AI questions, cards and notes can be shown per study PDF or all together |
| 1.9 | AI questions (with or without a PDF) follow the topic's past-paper pattern from its AI strategy; PDF questions still come only from the PDF |
| 1.8 | 🤖 AI strategy on every topic: the pattern of its past questions (sub-areas, styles, repeats) and a preparation plan |
| 1.7 | Focus check (how often you leave the app during a test, Do Not Disturb and real-break tips) and your best time of day in Smart insights |
| 1.4 | Mistake review (spaced repetition), Today's session, Google Drive backup, syllabus map, text size, crossing out options, screen kept on |
