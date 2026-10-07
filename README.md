# Lakshyam

Daily study for Kerala PSC: previous question papers, tests, progress and notes.
A static web app (PWA) that installs on Android and works offline.

This is a **new, separate app**. It never reads or changes the data of
PSC Exam Vault or any other app. Your data comes in only from an export
file you choose.

## Status

| Phase | What | State |
|---|---|---|
| 0 | Identity, offline shell, 4 tabs, Settings basics | Done |
| 1 | Data layer, import from PSC Exam Vault (checked + verified), backup/restore, undo, read-only Library | Done |
| 2 | Library editing, notes, search, banks, add paper / answer key / explanations | Done |
| 3 | Tests (all sources, timer, both layouts, guesses, resume), results, test history, syllabus marking | Done |
| 4 | Progress: per-100 score, insights, where marks go, subject → topic drill-down, detailed tables, PYQ/AI, counting basis, start fresh | Done |
| 5 | Today and habits | Next |
| 6–9 | AI, PDFs, Malayalam names, polish | Planned |

The full plan is in [`docs/redesign-brief.md`](docs/redesign-brief.md).

## Address

`https://lakshyam-app.github.io/lakshyam/`

## Folders

```
index.html, manifest.webmanifest, sw.js   app page, install info, offline cache
icons/                                     app icons
styles/app.css                             all styling (light/dark follows the phone)
src/main.js                                start-up: shell, tabs, screens
src/core/                                  shared helpers (router, sheet, text, toast, storage, flags)
src/data/                                  database, import from PSC Exam Vault, backup, safety copies
src/domain/                                pure logic (scoring, text formatting) — no screen code
vendor/katex/                              maths rendering, stored here so it works offline
tests/                                     automatic checks (run with: node --test tests/*.test.mjs)
src/strings/en.js                          all interface text (translations go here later)
src/features/<name>/                       one folder per screen
content/taxonomy-ml.json                   Malayalam subject/topic names (used in Phase 8)
docs/                                      plan and documentation
```

## Storage names (kept separate from all other apps)

- Database: `lakshyam-db` (IndexedDB)
- Small settings: keys starting with `lk_`
- Offline cache: names starting with `lakshyam-` (the service worker never touches any other cache)

## Updating the app

Every change bumps `VERSION` in `sw.js` and `APP_VERSION` in
`src/core/version.js`. When a new version reaches your phone, the app shows
"A new version is ready — Refresh". Nothing switches without you tapping it.
