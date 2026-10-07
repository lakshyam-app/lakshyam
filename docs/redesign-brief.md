# PSC Exam Vault → New App: Redesign Brief (Phase 1)

*Status: v1.1. Your decisions are recorded below. Waiting for the GitHub setup and the Malayalam syllabus PDF before Phase 0.*

**What I reviewed:** `index.html`, `app.js`, `ai.js`, `aipdf.js`, `style.css`, `sw.js`, `manifest.json`, `taxonomy.js`, `README.md`, both `ai-instructions-*.md` files and the sample paper JSON.

**One honest gap:** `app.js` is 289 KB. The reader showed me the first 262 KB in full. I covered the last 27 KB (add-paper, JSON auto-fix, answer key, explanations import, backup import/export, start-up) through targeted searches. I have seen every function there, but not every line of the JSON auto-fix helper. I will re-read the whole file line by line before writing any Phase 2 code. `icon.svg` is artwork only, so I did not review it.

---

## TL;DR

- **Shape:** 4 bottom tabs (**Today · Library · Progress · Notes**), a syllabus chip and 🔍 ⚙ in the top bar. This replaces 7 tabs, 4 top-bar buttons and a second bar.
- **Nothing you listed disappears.** About 15 things move behind ⋯ menus, bottom sheets or Settings. About 8 overlapping things merge. The only removals are duplicate entry points.
- **Biggest merges:**
  - Mock, weak areas, wrong answers, flagged and random-from-bank become one **"Start a test"** sheet.
  - Attempts becomes part of **Progress**.
  - The 3 answer toggles (hide / explanations / lock) become **Study vs Self-test view + an Edit mode**.
- **Stats** leads with 3–5 plain-language insights and a "where your marks go" bar. Detailed tables stay one tap away.
- **Data safety:** your data moves to IndexedDB with its own name, gets a verified one-way import, auto-snapshots before risky actions, and has a backup reminder.
- **I found real bugs in the old app.** One of them already affects your other PSC apps. See §2.3. I won't touch the old app unless you say so.

---

## Decisions (v1.1, 7 Oct 2026)

| Q | Decision |
|---|---|
| 1 Name | **Lakshyam (ലക്ഷ്യം)** — tagline "for Kerala PSC preparation" |
| 2 Hosting | **Option A:** free GitHub organisation → `<org>.github.io/lakshyam/` |
| 3 Old export gap | **(a)** a small, additive change to the old app's `exportBackup()` so backups also include taxonomy, settings and AI style guides. Delivered as a separate step with exact before/after lines. Nothing else in the old app changes. |
| 4 Old SW bug | **Fix it:** the old `sw.js` will delete only caches whose names start with `psc-exam-vault-`. One line; no features or data affected. |
| 5 Answer controls | **Approved:** Study / Self-test view + Edit answers mode |
| 6 Test creation | **Approved:** one "Start a test" sheet |
| 7 Auto banks | **Yes:** ⭐ Flagged and ❌ Still wrong appear as automatic banks |
| 8 Wording | Keep **"Question bank" / "Banks"**, the term PSC aspirants already know. (Where this brief says "Sets", read "Banks".) |
| 9 Daily goal | **Questions per day**, default 30, adjustable |
| 10 Exam pattern | **Optional and off by default:** Settings → Syllabus → "Exam pattern (optional)". When empty, mocks use the 0.9 min/question timer and your question-bank proportions, exactly as now. |
| 11 Malayalam names | You'll share a Malayalam syllabus PDF from another PSC exam. I'll use only entries whose meaning truly matches a topic. English-only or non-matching parts are ignored, and any topic without a confident match stays English, marked "needs review". |
| 12 Visual style | **Follow the phone's light/dark theme**; system fonts (fast and offline) |
| 13 Workflow | You'll connect GitHub so I can commit directly to the repo |
| 14 Import choices | Drop polluted scroll-mode timing (listed in the import report). Past bank tests **keep their recorded scores**, but each is assigned to the syllabus most of its questions belong to, so they stop appearing in every syllabus. |
| 15 Flashcards | **Light spaced repetition, same two buttons.** "Know it" brings the card back after 1 → 3 → 7 → 14 → 30 days; "Again" keeps it in today's round. |

**Future, kept in mind but not built:**
- **Multi-language app controls:**
  - Every UI string goes through `t('key')` with one file per language (`strings/en.js`, later `ml.js` and others).
  - Plurals, dates and numbers use the browser's `Intl` formatting.
  - Layouts allow longer Malayalam labels (no fixed-width buttons); `lang` is set on the page; there is no text inside icons.
  - The language picker slot lives in Settings → Display, hidden until a second language exists.
- **Email signup:**
  - Accounts plug into a single `auth` adapter (email + password or magic link, alongside phone/Google later).
  - The local profile (`ownerId: "local"`) migrates to the account on first sign-in, so nothing is lost.
  - No email or personal data is collected or stored now.

---

## 1. Code vs supporting files

The code is the source of truth. Here is where the supporting files disagree with it.

| # | File | Mismatch | Effect today | Plan for the new app |
|---|---|---|---|---|
| 1 | `ai-instructions-for-json.md` | Topic names differ from `taxonomy.js` (commas dropped). For example, "Atmosphere Pressure Belts & Winds" vs "Atmosphere, Pressure Belts & Winds". Same issue for "Light Lens & Mirrors", "Work Energy & Power", "Acids Bases & pH", "Northern Mountains Plains & Plateau", "Indian Climate Vegetation & Agriculture", "Indian Minerals Industries & Energy", "Kerala Minerals Industries & Transport" and "Atoms Molecules & States of Matter". | **Creates near-duplicate topics.** The app accepts any topic string found on a question, so AI-generated papers silently split one topic into two. | Generate the topic list in the instructions from the app's taxonomy, one topic per line. The importer also auto-matches near-identical names and shows them in the import report. |
| 2 | `ai-instructions-for-json.md` | The subject "Arts, Literature, Culture, Sports" appears inside a comma-separated list. | An AI can read it as 4 subjects. | One subject per line, each in quotes. |
| 3 | `ai-instructions-for-json.md` | Doesn't mention optional fields the code accepts: `difficulty` (E/M/D) and `note`. | Minor. | Document them. |
| 4 | *(missing)* | No instructions exist for the **bulk explanations JSON** that the code accepts: `{"explanations":[{"question_number":1,"explanation":"…"}]}`. | You have to remember the format. | New `ai-instructions-for-explanations.md`. |
| 5 | `ai-instructions-for-answer-keys.md` | Title says "PSC **Prep** Vault". The code also accepts `"DEL"`. Only A–D can be applied, so a 5-option question can't get "E" from a key. | Confusing; small gap. | Correct the name and list accepted values. The new app supports A–F. |
| 6 | `README.md` | Says to avoid LaTeX and use plain symbols. The JSON instructions (and the code, through KaTeX) **do** support `$\frac{…}{…}$`. | Contradictory advice. | One consistent rule: plain symbols for simple maths, `$…$` LaTeX with doubled backslashes for stacked maths. |
| 7 | `README.md` | Outdated in places: it still describes per-question notes (now one note per listing), lists 5 stats sub-tabs (there are 6, including "Right/Wrong by level"), and uses old button labels. | Misleading. | Rewrite the README for the new app. |
| 8 | `sample-paper-102-2024-M.json` | Uses topics "Modern Indian History" and "Indian Geography", which are not in the taxonomy. | Importing the sample creates stray topics. | New sample using real taxonomy topics, plus one example each of Malayalam text, stacked maths, a PSC-deleted question and an explanation. |
| 9 | `taxonomy.js` | Only the starting list. Your real taxonomy (custom subjects/topics, renames) lives in a separate store (`psev_taxonomy_state_v1`) that **is not in the backup export**. `topicsForSubject()` in this file is unused. | Custom topics with no questions yet are lost on any restore. | Taxonomy becomes real data with IDs and is included in backups. See open question Q3. |

**Your paper-JSON format stays exactly the same.** Every JSON file you or your AI tools have already made will import into the new app without changes. New fields are optional.

---

## 2. Diagnosis: why the app feels overwhelming

### 2.1 Too many controls at once (counted from the code)

- **Shell:** 4 top-bar buttons (🔍, Scroll/Swipe, Data, + Add), a second bar (syllabus and 🤖 AI), and **7 tabs** that scroll sideways. That is about 13 controls before any content.
- **Topic page:** about **17 tappable controls before the first question**:
  - PYQ/AI/Cards switch, studied −1/+1, "tests attempted"
  - Rename, Copy list, exam filter, Label, Generate AI, My note, Study PDFs
  - Start practice, Hide answers, Show explanations, Lock, Sort
- **Paper page:** about 14 controls (rename, post name, answer key, explanations, move syllabus, filter, delete, note, PDFs, practice, 3 toggles, sort).
- **Every question card:**
  - 6 action buttons (⭐ 📋 📝 🤖 🚫 🗑)
  - a 3-button difficulty row
  - 2 editable pills, a label pill, paper and post pills
  - 4 answer-letter buttons
  - a hint line
- **Topics tab:** 5 sort tabs, then a second row of segments ("Studied" adds 2 more rows), then colour chips, then a tip line, then 2 AI/Cards buttons, then search.
- **Stats:** PYQ/AI toggle, 6 sub-tabs, a 3-way "counting basis" control with a 70-word paragraph on **every** sub-tab, a difficulty switch and "Start fresh" at the bottom of every sub-tab, and dense tables.

### 2.2 The same thing reachable in many ways, while key actions are hidden

- **AI questions:** 4 entry points (Bank tab view, buttons on Subjects/Topics, the content switch, Stats → Open AI questions). **Flashcards:** 3.
- **Building a test** is scattered. Mock exam, wrong-answer review and weak-area bank are in **Stats → Overview**. Random exam is inside a bank. Flagged practice is under Stats.
- **"What should I study today?"** has no home. Due-for-review sits in Stats; streak sits in Stats.
- **Terminology drifts:** paper / exam / test / attempt / practice; bank / list / template; "My note" / Notes.

### 2.3 Real bugs and data risks I found

These are worth knowing about whether or not we redesign.

| # | Issue | Why it matters |
|---|---|---|
| B1 | **The old service worker deletes every cache on the origin except its own.** GitHub Pages puts all your repos on one origin (`<you>.github.io`). | Each update of Exam Vault wipes the offline cache of PSC Tracker, Question Vault and Prep Vault, and would wipe the new app's too. It doesn't delete data, only offline files. |
| B2 | **All your apps share one ~5 MB localStorage quota** (same origin). `saveData()` has no error handling. | When storage fills up, saves fail silently. The screen looks fine, but changes are lost on reload. |
| B3 | **Re-importing a paper with the same ID replaces all its questions.** | Flags, difficulty, in-app answer fixes and explanations you added are wiped. |
| B4 | **Renaming a subject/topic doesn't move its studied counts, labels, topic-list entries, notes, past test records or AI style guide.** | They become orphaned under the old name, and stats show the old name. |
| B5 | **Streak uses UTC dates.** In India, anything you do between 00:00 and 05:29 counts for the previous day. | Late-night study can break your streak. |
| B6 | **Scroll-mode tests credit the whole test duration to question 1.** Auto-difficulty then marks it "Difficult". | Time stats and the difficulty of first questions are polluted. |
| B7 | **Bank tests are always scored with the *Default* syllabus's marking scheme** and appear in every syllabus's stats. | Wrong net scores; stats mixed across syllabuses. |
| B8 | **"Deleted by PSC" is stored as answer index 5.** Typed questions allow 6 options, so a correct answer of **F** is read as "deleted". | Rare, but silently wrong. |
| B9 | Topic labels are shared across syllabuses, but studied counts are per syllabus. | Inconsistent behaviour. |
| B10 | An in-progress test is lost if the app is closed or Android kills it. | Bad for short sessions on a phone (calls, app switching). |
| B11 | Backup export leaves out the taxonomy, settings and AI style guides (and PDFs, by design). | Restore is incomplete. |

The new app fixes all of these by design. B1 also matters for the old app; see Q4.

---

## 3. Design principles

1. **One obvious next step per screen.** Exactly one primary button. Everything else is quieter.
2. **Show less, reveal on demand.** At most about 3 visible actions per screen. The rest go in ⋯, bottom sheets, long-press, or Settings. Advanced items are never deleted, only placed further away.
3. **Plain words before numbers.** Every number on screen has a one-line meaning ("−⅓ per wrong answer"), and every insight ends in an action ("Practise 10").
4. **Your data is sacred.** No silent overwrites, an undo or snapshot before every destructive action, verified imports, and visible backup status.
5. **Thumb-first.** Bottom tabs, bottom sheets, primary actions in the lower half, 48 px touch targets, fixed Prev/Next during tests.
6. **Calm by default, powerful when asked.** Sensible defaults, remembered choices (timer, layout, sort), and advanced options one level down.
7. **Built for Kerala PSC.** Negative marking everywhere, PYQ-first, Malayalam-friendly, aware of prelims/mains patterns, and questions that work in short daily sessions.

---

## 4. New app identity and isolation plan

### 4.1 Name options

Avoid "PSC" in a future *commercial* brand. Kerala PSC is a government body, and a brand name could imply official ties. A tagline can still say "for Kerala PSC".

| Name | Meaning / feel | Notes |
|---|---|---|
| **Lakshyam** (ലക്ഷ്യം) | "Goal" | **My pick.** Local, short, brandable, works in both scripts. |
| Padanam (പഠനം) | "Study" | Warm and simple; very common word. |
| PSC Focus | Plain and descriptive | Clearest for personal use; weaker for commercial use. |
| RankPath | Aspirational | Commercial-sounding; check trademarks first. |
| Daily Vault | Continuity with the old app | Keeps the "Vault" family name. |

Below, I use **Lakshyam** as a working name. It changes everywhere in one place (`strings/en.js` and the manifest).

### 4.2 Identifiers (all new, none shared with the old app)

| Item | Old app | New app |
|---|---|---|
| Repo | `psc-exam-vault` | `lakshyam` |
| Manifest `id` | `psc-exam-vault-app` | `lakshyam-app` |
| `start_url` / `scope` | `./` (its folder) | `./` (its own folder only) |
| Icon | `icon.svg` | New icon, plus PNG 192/512 and a maskable icon (better Android install) |
| Main data | localStorage `psev_data_v1` | IndexedDB database `lakshyam-db` |
| Small flags | `psev_*` keys | `lk_*` keys (boot flags only) |
| PDFs | IndexedDB `psev_pdfs` | Inside `lakshyam-db` (store `pdfs`) |
| Service worker caches | `psc-exam-vault-v10` | `lakshyam-shell-v1`, `lakshyam-runtime-v1`. Cleanup deletes **only** caches starting with `lakshyam-` |

### 4.3 Hosting and same-origin safety

Your current apps all live on one origin, so they share storage and caches.

| Option | Isolation | Effort from Android |
|---|---|---|
| **A. New free GitHub organisation** (e.g. `sachin-psc`) → `sachin-psc.github.io/lakshyam/` | **Full.** Different origin, so separate storage, quota and caches. | Same workflow you use now. Creating an org takes about 2 minutes in the browser. **Recommended.** |
| B. Cloudflare Pages linked to the repo | Full | Also works from a phone browser; deploys on every commit. |
| C. Same `<you>.github.io/lakshyam/` | **Partial.** Same origin as your other apps. | Easiest, but relies on the unique names above, and is still exposed to the old app's cache-deleting bug (B1). |

With option C, the new app still never reads or writes `psev_*` keys. However, Chrome's "Clear site data" for `github.io` would wipe all your apps at once. Option A removes that risk.

### 4.4 How the old app stays safe

- No changes to its code (unless you approve Q3 or Q4).
- The new app never opens `psev_*` keys or the `psev_pdfs` database. Data comes **only** from the export file you pick.
- Both apps install side by side: different manifest ID, name, icon and scope.

---

## 5. New information architecture

```
┌──────────────────────────────────────────┐
│ [LDC 2026 ▾]                    🔍   ⚙   │  ← syllabus chip, search, settings
├──────────────────────────────────────────┤
│                content                   │
├──────────────────────────────────────────┤
│  Today   │  Library  │  Progress │ Notes │  ← bottom tabs (thumb zone)
└──────────────────────────────────────────┘
```

| Tab / place | What lives there |
|---|---|
| **Today** | Next best step, daily goal, streak, due reviews, resume an unfinished test, **Start a test**, backup reminder |
| **Library** | Views: **Subjects · Topics · Papers · Sets**. Subject → Topic → Questions. PYQ / AI / Cards switch inside subject and topic pages. **+ Add paper** under Papers. Topic lists and labels are chips in Topics. Study PDFs sit in the topic ⋯ menu. |
| **Progress** | Summary, insights, where marks go, subject → topic → question drill-down, test history (old Attempts), detailed tables, PYQ/AI toggle, ⚙ stats settings (counting basis, start fresh) |
| **Notes** | All listing notes with search and links back, older per-question notes, AI notes & tricks |
| **🔍 Search** | Questions, papers, subjects and topics (English **or** Malayalam), with syllabus scope |
| **⚙ Settings** | Syllabuses and marking/exam pattern · Backup & restore · Import from old app · AI presets · Display (Malayalam names, text size, theme) · Difficulty marking on/off · Test defaults (timer, layout) · About |

---

## 6. Feature audit

**Legend:** **Keep** = stays visible · **Merge** = combined with a related feature · **Advanced** = moved to ⋯ / sheet / Settings · **Remove** = only duplicate entry points.

### Syllabus and content

| Feature | Decision | Reason / new place |
|---|---|---|
| Multiple syllabuses + switcher | Keep | Top-bar chip, one tap |
| Marking scheme per syllabus (exact fraction) | Keep | Settings → Syllabus; shown in plain words on results |
| Add / edit / delete syllabus | Advanced | Settings → Syllabuses |
| Exam pattern per syllabus (no. of questions, minutes, subject weights) | **New, optional** | Drives the mock-test defaults (see Q10) |
| Import paper JSON (file/paste, validation, auto-fix, duplicate warning) | Keep | Library → Papers → + |
| Re-import a paper with the same ID | Keep, **fixed** | Merges content; your flags, notes and fixes are preserved (B3) |
| Answer key JSON | Advanced | Paper ⋯ |
| Bulk explanations JSON | Advanced | Paper ⋯ |
| Rename paper / edit post name / move to syllabus / delete paper | Advanced | Paper ⋯ (delete has undo) |
| Filter a paper by subject/topic | Keep | One filter chip |
| Edit question, reassign subject/topic, mark deleted-by-PSC, delete, copy | Merge | Question card ⋯ |
| Tap a letter to set the correct answer + **Answers lock** | Merge | Answers are read-only by default; ⋯ → **Edit answers** mode. No lock toggle needed. |
| Hide answers / Show explanations | Merge | View: **Study** (answers shown) or **Self-test** (hidden). "Show explanation" per card. |
| Scroll/Swipe button in top bar | Advanced | Remembered choice in the test sheet and the listing's view menu |
| Sort by difficulty / time | Keep | Sort menu |
| ⭐ Flag | Keep | Stays visible on the card |
| Flagged list | Merge | Automatic **⭐ Flagged** set under Library → Sets |
| Copy list | Advanced | Listing ⋯ |
| Exam include filter + saved templates | Keep / Advanced | Filter chip stays; templates move inside the filter sheet |
| "avg diff 5.4/9" on every list row | Advanced | Shown in stats and sorting only |

### Taxonomy and study tracking

| Feature | Decision | Reason / new place |
|---|---|---|
| Subjects → Topics navigation | Keep | Library |
| Global topic list with 5 sorts + sub-filters + label chips + lists | Merge | One Topics view: search + one **Sort & filter** sheet + one chip row (lists/labels) |
| Rename subject/topic everywhere (merges on clash) | Keep, **fixed** | Stable IDs, so nothing gets orphaned (B4) |
| Add custom subject/topic | Keep | Inside the reassign sheet |
| Mark as studied +1 / −1 | Keep | **+1** is a primary button on the topic page; −1 via undo toast or ⋯ |
| Spaced review ("due for review") | Merge | Moves to **Today** |
| Test count per topic + link to those tests | Keep | Topic subtitle → test history filtered to that topic |
| Named topic lists (chip bar) | Keep | Topics view chip row |
| Colour labels | Keep | Sort & filter sheet and long-press |
| Long-press actions | Keep | Same actions also in ⋯, so they're discoverable |

### Tests

| Feature | Decision | Reason / new place |
|---|---|---|
| Practice test from paper / subject / topic / search / AI / set | Keep | One **▶ Practice** button per listing |
| Timer (0.9 min × questions, ±, pause, auto-submit) | Keep | In the test sheet; remembers your last choice |
| Scroll / swipe modes, jump bar, fixed Prev/Next | Keep | Scroll-mode timing fixed (B6) |
| Guess marking | Keep | 🤔 on each question in a test |
| Mock exam (auto-distribute) | Merge | **Start a test** → Mock |
| Weak-area bank | Merge | **Start a test** → Weak areas (+ optional "Save as set") |
| Wrong-answer review | Merge | **Start a test** → Still wrong |
| Random exam from a bank | Merge | **Start a test** → From a set |
| Retake | Keep | Results screen |
| Resume an unfinished test | **New** | Saved automatically; "Continue" card on Today (B10) |

### Results and history

| Feature | Decision | Reason / new place |
|---|---|---|
| Results with clickable correct / wrong / unanswered filters | Keep | Results screen |
| Guessed right / wrong filters | Keep | Filter menu |
| Per-question time on card | Keep | Card meta line |
| Attempts tab (group, sort, search) | Merge | Progress → **Test history** (same grouping, sort and search) |
| Delete a single test | Keep | Test history ⋯ |

### Question bank, difficulty, stats

| Feature | Decision | Reason / new place |
|---|---|---|
| Banks: create, rename, delete, add from pool (filters + long-press preview), import JSON, type a question, remove | Keep | Library → **Sets** (name change, see Q8) |
| Difficulty E/M/D, auto from time, manual override | Keep | Small tappable chip on the card |
| Difficulty on/off switch | Advanced | Settings |
| Overview cards, recent scores | Merge | Progress summary and sparkline |
| Subject → topic drill-down with sorts; all-topics list | Keep | Progress layers |
| Time / Difficulty / Right-Wrong by level / Guesswork tabs | Advanced | Progress → **Detailed tables** (one tap) |
| Counting basis (first / latest / all) | Advanced | Progress ⚙, with a plain explanation |
| Small-sample adjustment + ⚠ low-data mark | Keep | Subtle "few answers" tag |
| PYQ vs AI stats toggle | Keep | Progress header |
| Start fresh stats (keep or delete history) | Advanced | Progress ⚙ |
| Streak / today counter | Merge | **Today** |
| Stats "Quick practice" and "AI tools" blocks | Merge | Today, Start a test, and insight actions |

### Notes, search, text

| Feature | Decision | Reason / new place |
|---|---|---|
| One "My note" per listing | Keep | Collapsed preview on each listing |
| Notes tab (search, link back) | Keep | Bottom tab |
| Older per-question notes | Merge | Imported as notes linked to their question; still listed in Notes |
| Global search with syllabus scope, long-press preview, "view all as list" | Keep | 🔍 sheet; also finds subjects/topics, including Malayalam names |
| Line breaks, **bold**/*italic*, stacked maths, Malayalam | Keep | Same syntax. KaTeX is stored locally so it works offline. |

### AI

| Feature | Decision | Reason / new place |
|---|---|---|
| Presets (8 templates), priority order, auto-fallback, test button, answer language | Keep / Advanced | Settings → AI |
| Explain / explain my mistake, mnemonic, revision note, save to explanation or note | Keep | Card ⋯ and results "Explain my mistake" |
| Similar questions / generate for topic | Keep | Card ⋯ / topic ⋯ |
| Weak-area study plan | Keep | Progress insight action |
| Tricks for wrong answers | Keep | "Still wrong" set ⋯ |
| Guess coach | Keep | Guessing insight / detailed table |
| AI questions kept separate from PYQs | Keep | PYQ / AI / Cards switch (only shown when AI content exists) |
| Flashcards (study/list, known/again, shuffle) | Keep | Cards view |
| Study PDFs: text extraction, read scanned pages, page editor, style guide, questions with verified quotes + double check, flashcards, revision note | Keep / Advanced | Topic ⋯ → Study PDFs |
| Bank-tab AI/Flashcard hubs + 🤖/🃏 buttons on Subjects/Topics | **Remove** | Duplicate entry points. The same content is reachable through the switch and Library. |

### Data

| Feature | Decision | Reason / new place |
|---|---|---|
| Backup export / restore (merge or replace) | Keep | Settings → Backup; adds dry-run, snapshot and verification |
| Importing Question Vault / Prep Vault exports | Keep | The same importer accepts them |

---

## 7. Key user flows

**First-time import from the old app**
1. In the old app: Data → **Export full backup** (unchanged).
2. Open the new app → welcome screen → **Bring my data from PSC Exam Vault** → pick the file.
3. A dry-run report shows counts, warnings and anything skipped, with reasons.
4. Tap **Import**. Everything is written in one go (all or nothing).
5. Automatic verification: counts and score totals are recomputed and compared ✓.
6. The app offers to make the first backup of the new app.

**Daily study session (target: 1 tap to start)**
1. Open the app → **Today** shows the next best step, e.g. "Fundamental Rights — 48%, asked often".
2. Tap **▶ Quick 10**. The test starts immediately, using your remembered timer and layout.
3. Results show net score and the change since last time → **Review mistakes** or **Done** (goal ring fills).

**Taking a full test**
1. From a listing, tap ▶ Practice, or from Today, tap **Start a test** → pick Mock / Topic / Weak / Still wrong / Flagged / Set.
2. Set number of questions and timer → **Start**.
3. Answer, mark 🤔 guesses, pause if needed. Leaving the app keeps the test.
4. **Submit** (or auto-submit when time runs out) → results.

**Reviewing mistakes**
1. Results → tap the **✗ Wrong** count. Only wrong answers are listed.
2. On each card: see the correct answer, open the explanation, use ⋯ → AI "Explain my mistake", and ⭐ flag hard ones.
3. Later: Today or Sets → **Still wrong** → Practise.

**Importing a paper**
1. Library → Papers → **+** → choose file or paste.
2. Validation, auto-fix offer, duplicate warning, and a topic-match report ("2 topics matched to existing names").
3. **Add.** Optionally follow with Paper ⋯ → Answer key / Explanations.

**Using AI**
1. One-time setup: ⚙ → AI → add a Gemini or OpenRouter preset → Test.
2. Use it in context: card ⋯ → AI help · results → Explain my mistake · topic ⋯ → Make practice questions / Study PDFs · Progress → Make a plan.
3. Generated content always goes through review first and lands in the separate AI section.

---

## 8. Screen sketches

**Today**
```
Good evening, Sachin                LDC 2026 ▾
🔥 6 days   This week ● ● ● ● ● ○ ○
Today: 18 / 30 questions  ▓▓▓▓▓▓░░░

┌ NEXT BEST STEP ─────────────────────────┐
│ Fundamental Rights                      │
│ 48% accuracy · asked in 9 papers        │
│ [ ▶ Quick 10 ]          Open topic ›    │
└─────────────────────────────────────────┘
Continue: Mock exam (23/100, 41 min left) ›
Due for review (3): Travancore History… ›

[        Start a test        ]
Last backup 9 days ago · Back up now      ← only if > 7 days
```

**Library → Topics**
```
[Subjects] [Topics] [Papers] [Sets]
🔍 Search topics
[All] [📌 Revision 1] [📌 Weak] [🔴] [🟢] …  [Sort ▾]
Fundamental Rights          42 q · 📖 3× · 64%
Indian Constitution
Travancore History          31 q · not started
History
```

**Topic page**
```
‹ Indian Constitution                         ⋯
Fundamental Rights
42 PYQs · studied 3× · last test 64%
[PYQs 42 | AI 8 | Cards 12]     ← only if AI/cards exist
[ ▶ Practice ]        [ 📖 Studied +1 ]
📝 My note: "Art. 32 = heart & soul…" ›
Study view ▾   Sort ▾
┌──────────────────────────────────────┐
│ Q12 · 2019 · LDC              ⭐  ⋯  │
│ Which Article …                      │
│ A) …                                 │
│ B) …                         ✓       │
│ C) …   D) …                          │
│ Show explanation ▾             [E]   │
└──────────────────────────────────────┘
```

**Start a test (bottom sheet)**
```
Start a test
What   (•) This topic  ( ) Mock  ( ) Weak areas
       ( ) Still wrong 23  ( ) Flagged 9  ( ) A set ▾
How many  [10] [25] [50] [100] [All 42]
Timer     Off | On  ‹ 23 min ›
Layout    One at a time | Scroll
More options ▸   (per-subject counts, paper filter)
[            Start            ]
```

**During a test**
```
⏸ 18:42            12 / 50          [Submit]
[1][2][3][4]…  (jump bar, answered shaded)
Q12  Which Article …
 A) …        (whole row is the tap target)
 B) …
🤔 Guess                                ⭐
‹ Prev                          Next ›   (fixed)
```

**Results**
```
Net score  31.67 / 50
(+1 right, −⅓ wrong)
✓ 36     ✗ 13     – 1        ← tap to filter
"Guessing earned you +1.3 marks this time."
[Review mistakes]  [Retake]  [Explain my mistakes 🤖]
```

---

## 9. Stats redesign (Progress tab)

### 9.1 Layers

**Summary → Subject → Topic → Question.** Each layer has the same three parts: *how you're doing*, *what stands out*, and *the list below*.

### 9.2 Wireframe

```
Progress · LDC 2026        [PYQ | AI]   [30 days ▾]  ⚙
HOW AM I DOING
Net score per 100 questions: 58   ↑ +6 vs previous 30 days
ⓘ Marks after the negative-mark cut, scaled to a 100-question paper.
Accuracy 71% · Attempted 92%
▁▂▃▅▄▆▇  last 10 tests

WHAT STANDS OUT
• Weakest: Fundamental Rights — 48% (25 answers)          [Practise]
• Improving: Kerala Rivers — 52% → 74%                     [See]
• Guessing costs you in Physics: −2.7 marks from 18 guesses [Why?]
• Slowest: Compound Interest — 71 s per question (avg 34 s)[Practise]
• Not touched: Travancore History — 31 PYQs                [Start]

WHERE YOUR MARKS GO (per 100 questions)
[███████ earned 71 ][▓ lost −6.3 to wrong ][░ 8 unanswered ]

SUBJECTS                           Sort: Weakest ▾
History        ▓▓▓▓▓▓░░  68%                 ›
Geography      ▓▓▓▓░░░░  51%  few answers    ›
…
Test history ›          Detailed tables ›
```

### 9.3 Insights engine

Each insight is a simple, testable rule that only fires with enough data. At most 5 are shown, ranked by marks at stake.

| Student's question | Rule (only fires with enough data) | Plain sentence |
|---|---|---|
| How am I doing overall? | Net per 100 for this period vs the previous one | "58 per 100, up 6" |
| Am I improving? | Topic accuracy, last 14 days vs the 14 before; ≥8 answers each | "Improving in Kerala Rivers" |
| Where am I losing marks? | Highest (frequency × wrong rate × penalty) | "Weakest: …" |
| What should I study next? | Due reviews → weak high-frequency topics → high-frequency topics not touched | Matches Today's next step |
| Is guessing helping? | Guess accuracy vs break-even, per subject; ≥10 guesses | "Guessing costs you in Physics" |
| Am I too slow? | Topic seconds per question > 1.5 × your average; ≥8 timed answers | "Slowest: …" |

### 9.4 Visuals

- Accuracy bars: green ≥70%, amber 40–69%, red <40%. "Few answers" is greyed.
- Sparklines for trends.
- One stacked "where marks go" bar.
- Tables only inside **Detailed tables**.
- Colour is never the only signal: each bar also shows a percentage.

### 9.5 Topic layer

Shows accuracy trend, average time, guess record, difficulty split, and **"Questions you got wrong"**. Tapping one opens the question with your past answers.

### 9.6 One-line explanations (ⓘ)

- **Net score:** "Right answers earn +1; each wrong one costs ⅓. Unanswered costs nothing."
- **Per 100 / normalised %:** "Each question counts once, from your first try, so a 10-question topic test and a 100-question mock weigh fairly." This plays the role of the old "first attempt" basis. Latest and All options stay in ⚙.
- **Few answers:** "Topics with only a few answers are pulled towards your average, so 1 out of 1 doesn't look like 100%."
- **Break-even guessing:** "With −⅓ per wrong answer, a guess pays only if you're right more than 1 time in 4 (25%). Rule out one option and you're already above that."

### 9.7 Preserved

All existing capabilities stay: PYQ/AI separation, all sorts, the all-topics list, time / difficulty / right-wrong / guesswork tables, the counting basis, deleting a single test, and Start fresh.

---

## 10. Malayalam names for subjects and topics

| Aspect | Plan |
|---|---|
| **Setting** | ⚙ → Display → "Subject & topic names": **English** (default) · മലയാളം · Both. Nothing Malayalam-related appears anywhere until you change this. |
| **Display: Both** | English on line 1, Malayalam below in a smaller font, one line each with ellipsis. In chips, only the selected language is shown, to save space. |
| **Display: Malayalam only** | Falls back to English, in grey, if a Malayalam name is missing. |
| **Storage** | Optional fields on subject/topic records: `name_ml`, `name_ml_status` (`official` / `review`). Papers, imports and exports work unchanged without them. |
| **Sourcing** | Seed names come from the **official Kerala PSC Malayalam syllabus** for your exams. I won't invent literal translations. Where I can't confirm official wording, the name is saved as `review` and shows a small ⚠ in the editor (never in normal lists). See Q11. |
| **Editing** | Long-press a subject/topic or use ⋯ → Rename. The sheet has English and Malayalam fields and a "Mark as checked" switch. |
| **Bulk import** | ⚙ → Display → Import Malayalam names (JSON, below). Matching is by ID, or by English name, ignoring case, spaces and punctuation. The report shows matched / not found / changed. Choose "mark imported names as official" or leave them as review. |
| **Search** | Searches both English and Malayalam names. |
| **Font** | Uses Android's built-in Malayalam font, so there's no extra download and it works offline. Slightly larger line height for Malayalam text. |

**Bulk import format**
```json
{ "subjects": [
  { "name": "Indian Constitution", "name_ml": "ഇന്ത്യൻ ഭരണഘടന",
    "topics": [ { "name": "Fundamental Rights", "name_ml": "മൗലികാവകാശങ്ങൾ" } ] }
]}
```

---

## 11. Habit and motivation layer

The Atomic Habits idea behind each piece:

| Principle | What I'd add | Why it won't add clutter |
|---|---|---|
| **Obvious** | **Next best step** card on Today: one suggestion with one button | Replaces scattered due-list, quick-practice and AI-tool blocks |
| **Easy** | **Quick 10** (no setup), remembered test settings, **resume** after interruptions | Fewer taps, not more buttons |
| **Attractive** | "+6 since last month" and an "Improving in…" insight | Shown inside existing cards |
| **Satisfying** | Daily goal ring (default 30 questions, adjustable), a small confetti moment when hit, a week dots row | One compact row on Today |
| **Never miss twice** | Streak counts days you met *any* study action (local date, fixing B5). After a missed day the message is "Get back today", never guilt. | No penalties, no red badges |
| **Gentle safety** | Backup reminder only when the last backup is older than 7 days | Hidden otherwise |

**Off switches:** ⚙ → Today → show streak / show goal.

**Not included:** push notifications. A static PWA can't schedule reminders reliably without a server; I'll revisit this with the backend.

---

## 12. Architecture and tech plan

### 12.1 Stack decision

Keep the stack: **plain HTML/CSS/JavaScript, no framework, no build step, GitHub Pages hosting.**

Upgrades, each of which works on Android without a laptop:

| Change | Benefit | Android-only check |
|---|---|---|
| Native **ES modules** (`<script type="module">`) instead of 3 giant global files | Small, focused files with clear dependencies | Runs directly in Chrome; nothing to compile |
| **IndexedDB** instead of a single localStorage string | Much larger quota (B2), per-record writes, safer | Built into the browser |
| Tiny auto-escaping `html` template helper + `data-action` event delegation | Fewer XSS risks and less re-binding code | Plain JS |
| **Vendored** KaTeX and pdf.js (copied into the repo, not loaded from a CDN at runtime) | Reliable offline use; no third-party surprises | Upload once |
| `navigator.storage.persist()` request | Android is less likely to evict your data | One line |
| *Optional:* GitHub Actions running unit tests on scoring, import and stats logic (`node:test`, no dependencies) | Catches regressions automatically on every commit | Runs on GitHub; results visible in the browser/app (Q13) |
| *Not adopted:* TypeScript, bundlers, React | They need a build toolchain you can't run on the phone | Rejected for now; JSDoc comments document types instead |

### 12.2 Folder structure

About 30 small files, organised by feature:

```
index.html · manifest.webmanifest · sw.js · icons/
vendor/            katex/ · pdfjs/
content/           taxonomy-default.js · taxonomy-ml.js (seed names + status)
src/
  main.js          boot, router, tab shell
  core/            router.js · dom.js (html, escape) · sheet.js · toast.js
                   i18n.js · format.js · dates.js (local-date) · ids.js
                   entitlements.js · flags.js · events.js
  data/            db.js (IndexedDB) · schema.js (versions + migrations)
                   repos/ content.js · user.js · settings.js · ai.js · pdfs.js
                   backup.js · validate.js · import-legacy.js · snapshots.js
  domain/          scoring.js · stats.js · insights.js · schedule.js (spaced review,
                   next step) · test-builder.js · taxonomy.js · text.js (rich text)
  features/        today/ · library/ · question/ · test/ · results/ · progress/
                   notes/ · search/ · settings/ · import/ · ai/ (client, prompts)
                   pdf/ · flashcards/
  strings/         en.js   (ml.js later)
docs/              README · ai-instructions-*.md · sample-paper.json
```

**Rules:**
- UI (`features/`) never touches IndexedDB directly; it calls **repositories**.
- `domain/` is pure functions with no DOM and no storage, so it is easy to test.
- Each feature folder exposes one `register()` function, so new features plug in without editing others.

### 12.3 Data model (IndexedDB object stores)

**Common fields on every record:** `id` (stable, prefixed), `createdAt`, `updatedAt`. Optional and unused for now: `ownerId` (`"local"`), `source` (`pyq` / `ai` / `personal` / `admin`), `visibility` (`private`), `deletedAt` (soft delete for future sync), `rev`. The whole database has a `schemaVersion` with migrations.

**Content** (later this can be admin-published):

| Store | Key fields |
|---|---|
| `syllabi` | name, marking `{pos, negNum, negDen}`, `pattern {questions, minutes, subjectWeights?}`, `stage` (prelims/mains/single) |
| `subjects` | name, `name_ml?`, `name_ml_status?`, order |
| `topics` | subjectId, name, `name_ml?`, `name_ml_status?`, order |
| `papers` | syllabusId, name, postName, kind (`pyq` / `ai` / `typed` / `set-import`), year? |
| `questions` | paperId, number (printed no.), text, options[2–6], answerIndex or null, **status** (`active` / `deleted_by_psc`, fixing B8), explanation, subjectId, topicId, lang (`en` / `ml` / `mixed`, auto-detected), difficultyHint?, sourceRef? (PDF quote) |
| `flashcards` | subjectId, topicId, front, back, sourceRef |

**User data** (always yours, even when content comes from an admin later):

| Store | Key fields |
|---|---|
| `questionState` | questionId, flagged, difficulty, difficultySource (`auto` / `manual`), answerOverride? (your personal fix on admin content later) |
| `topicState` | syllabusId+topicId, studiedCount, lastStudiedAt, nextReviewAt |
| `attempts` | syllabusId, scope `{type, ref}`, startedAt, submittedAt, marking snapshot, timer, layout, status (`in_progress` / `submitted`), answers[] `{questionId, selected, correct, guessed, timeMs, subjectId, topicId}` |
| `sets` | name, questionIds[], kind (`user` / `auto-flagged` / `auto-wrong`) |
| `topicLists`, `labels` | Label assignments are scoped per syllabus (fixing B9) |
| `notes` | target `{type: paper/subject/topic/set/list/question/misc, id}`, text |
| `filterTemplates` | paperIds[] |
| `flashcardState` | cardId, status, reviews, lastAt |
| `activity` | localDate → count (fixing B5) |
| `settings` | key/value |
| `aiPresets` | **Never exported** |
| `styleGuides` | Exported |
| `pdfs` | Optional in exports (large) |
| `snapshots`, `importLog` | Safety records |

**IDs are deterministic for imported data.** For example, the question ID is `q:<paperId>:<qid>`. Re-imports therefore merge instead of duplicating, and your user state stays attached (fixing B3).

### 12.4 Data layer

- `repo.questions.byTopic(topicId, {syllabusId, source})`, `repo.attempts.save()` and so on. All calls are async.
- At start-up, content is loaded into an in-memory index (thousands of questions is still fast). Writes go to IndexedDB, then the cache is updated, then a change event fires.
- Later, a **sync adapter** (Supabase or Firebase) can be added *behind* the same repository functions without touching any screen.
- All writes are wrapped. If a write fails (quota or other error), you see "Couldn't save — your change is kept in memory, please back up", never a silent loss.

### 12.5 Coding standards

- Consistent naming: `camelCase` for code, `kebab-case` for files.
- Functions under about 40 lines; no duplicated logic. One question-card component is used by Library, Test, Results and Search.
- All user and imported text goes through the escaping `html` helper.
- Errors go to a toast plus a status line, never only to the console.
- Comments explain *why*, especially for scoring and stats maths.
- Performance on mid-range phones: long lists render in pages of 50 with "show more"; search is debounced; stats are cached and recalculated only after a new test.

### 12.6 Deploying from Android

- You upload only the changed files per phase. I'll list exact paths.
- Optional, much easier: connect GitHub here, and I can commit the files to the new repo directly (Q13).

---

## 13. Future commercialisation readiness

| Capability | Prepared now (cheap) | Built later |
|---|---|---|
| Super admin / sub-admins | `ownerId`, `source`, `visibility` fields; content separate from user data | Roles (`super_admin`, `editor`, `reviewer`), draft → review → publish workflow, admin web console |
| Admin-published syllabi, papers, questions | Content stores and the repository interface are independent of where content comes from | Server content API; users get read-only admin content plus their own overlays (`questionState.answerOverride`, notes) |
| Subscriptions / feature access | `entitlements.can('feature')` checks at every gated entry point (always `true` today); `flags.js` | Plans, paywall screens, a server-verified entitlement token |
| Accounts | `ownerId: "local"` everywhere; one `auth` adapter slot | Sign-up/sign-in (email, phone OTP, Google); the local profile migrates to the account on first login |
| Multi-device sync | Soft deletes, `updatedAt` / `rev`, deterministic IDs | Sync adapter with conflict rule (last-write-wins per field; attempts are append-only) |
| Translation / rebrand | All UI strings in `strings/en.js` via `t('key')`, `Intl` formatting, flexible layouts; name in one place | `strings/ml.js` and other languages, language picker, theme tokens |
| AI for paying users | Prompts isolated in `features/ai/prompts.js` | **Server-side AI proxy.** You can't ship your API keys inside a web app, so usage limits are enforced on the server. |

**Honest note on what a backend needs** (approximate figures; please verify before deciding):
- **Server and database:** Supabase or Firebase (auth, Postgres/Firestore, file storage, row-level security). Free tiers cover testing; a real paid product is typically from about US$25/month upwards.
- **Payments:** Razorpay (UPI) on the web, roughly 2% per transaction. If you publish on the Play Store, Google Play billing rules apply to digital content.
- **Legal:** a privacy policy and India's DPDP Act 2023 obligations for user data; terms of service; avoid branding that suggests official PSC affiliation.
- **Other costs:** a custom domain (about ₹1,000/year), AI usage, moderation/review time for content, and support.

None of this is built or visible now.

---

## 14. Offline plan

| Works offline | Needs internet |
|---|---|
| Everything you study with: Library, tests, timer, results, Progress, Notes, search, flashcards, editing, imports from files, backup and restore, Malayalam names, maths rendering (KaTeX stored locally) | All AI features (explain, generate, plan, coach, reading scanned PDF pages, PDF questions/cards/notes) |
| Adding a PDF and extracting its text (pdf.js stored locally) | First install of the app; updates |

**Verdict: worth doing now.** It costs little (one service worker and storing two libraries locally). The new service worker uses its own cache names, cleans up only its own caches (fixing B1 for the new app), and shows an "Update available — tap to refresh" prompt instead of switching versions silently.

---

## 15. Data import and safety plan

### 15.1 Import from the old app (read-only, one-way)

1. **Parse** the file. Accepted: Exam Vault, Prep Vault and Question Vault exports.
2. **Validate** structure, types, ID uniqueness, options, answer ranges and references.
3. **Map** names to IDs:
   - Subjects and topics come from questions + the seed taxonomy, with near-duplicate names (issue #1 in §1) proposed for merging; you confirm.
   - String keys in studied counts, labels, lists and notes are mapped to the new IDs. Orphans from old renames (B4) are listed so you can attach them to the right topic or drop them.
4. **Convert:**
   - Answer index `5` becomes "deleted by PSC", unless the question has 6 options (B8); those are flagged for you to decide.
   - Bank-only, typed and AI papers keep their kind.
   - Legacy per-question notes become question notes.
   - Scroll-mode timing artefacts (B6) are detected and excluded from time stats, with the list shown.
5. **Dry-run report:** counts per type, warnings, and skipped items with reasons.
6. **Commit** in a single transaction (all or nothing).
7. **Verify:** recount everything and recompute every attempt's net score; they must match the file → "Verified ✓", or a precise list of differences.
8. **Log:** the import report is saved under Settings → Import history.

### 15.2 Backups in the new app (from day one)

- **Export full backup:** content, user data, settings, taxonomy and style guides, plus `schemaVersion`, app ID and a checksum. AI keys are never included. PDFs are an optional checkbox.
- **Restore** uses the same dry-run → commit → verify flow, in merge or replace mode.
- **Automatic local snapshots** are taken before every import, restore, "start fresh", paper delete or bulk delete. The last 5 are kept, with one-tap undo.
- **Gentle reminder** on Today when the last backup is older than 7 days.
- **Persistent storage** is requested from Android.

---

## 16. Implementation plan

Each phase ships something you can install and test on your phone before the next one starts. The old app is never touched.

| Phase | Delivers | Test on phone |
|---|---|---|
| **0. Identity and shell** | Repo/hosting set up, manifest, icons, service worker, 4-tab shell, Settings skeleton | Installs **next to** the old app; works offline; the old app is unchanged |
| **1. Data layer + import** | IndexedDB, repositories, schema v1, legacy import (dry-run, commit, verify), new backup/restore, read-only Library browsing | Import your real export → see counts ✓ → browse subjects, topics and questions → back up, then restore into a fresh install |
| **2. Library** | Question card, Study/Self-test views, Edit answers, ⋯ actions, reassign/rename via IDs, labels, lists, sets, listing notes, Notes tab, add paper / answer key / explanations, search | All editing works; renames keep studied counts and labels |
| **3. Tests and results** | Start-a-test sheet (all sources), timer/pause/auto-submit, both layouts with correct timing, guesses, resume, results with filters, review, retake, test history, auto difficulty | Take, interrupt, resume and submit; net scores match the old app for the same answers |
| **4. Progress** | Summary, insights, where marks go, drill-down, detailed tables, PYQ/AI toggle, counting basis, start fresh, delete test | Numbers match old stats on the same data (except the documented bug fixes) |
| **5. Today and habits** | Next best step, Quick 10, goal, streak (local dates), due reviews, backup reminder | Daily-use loop works in 1 tap |
| **6. AI** | Presets, explain/mnemonic/note/similar, plan, tricks, guess coach, AI questions, flashcards | Your Gemini/OpenRouter keys work; AI content stays separate |
| **7. Study PDFs** | Library, text extraction, scanned-page reading, page editor, style guide, verified generation, cards, revision notes | Same PDF gives verified questions as before |
| **8. Malayalam names** | Setting, editor, bulk import, search, seed list with review flags | Off by default; Both mode stays compact |
| **9. Polish and docs** | Accessibility, performance pass, rewritten README and AI instructions, new sample, optional GitHub Actions tests | Final side-by-side check |

---

## 17. Open questions

I need your answers to these before Phase 0.

1. **Q1 – Name:** Lakshyam, or another option from §4.1, or your own?
2. **Q2 – Hosting:** A (new free GitHub organisation, full isolation, recommended), B (Cloudflare Pages) or C (same `github.io`)?
3. **Q3 – Old app export gap:** The old backup leaves out your custom taxonomy, settings and AI style guides (B11). Options:
   - (a) A tiny change to the old app's export, about 10 lines, adding them. Reading only; nothing else changes.
   - (b) Accept the gap: custom topics without questions and style guides are lost; settings are re-chosen.
4. **Q4 – Old service-worker bug (B1):** It deletes your other apps' offline caches. May I give you a one-line fix for the old `sw.js`? It changes no features and no data.
5. **Q5 – Answer controls:** Approve replacing the Lock / Hide answers / Show explanations toggles with **Study vs Self-test view + an Edit answers mode**?
6. **Q6 – Test creation:** Approve merging Mock, Weak-area bank, Wrong review, Flagged practice and Random-from-bank into one **Start a test** sheet?
7. **Q7 – Automatic sets:** Should ⭐ Flagged and ❌ Still wrong appear as automatic sets in Library → Sets?
8. **Q8 – Wording:** Rename "Bank" to "Set", or keep "Question bank"?
9. **Q9 – Daily goal:** Measured in questions (default 30), minutes, or sessions?
10. **Q10 – Exam pattern:** Do you want per-syllabus exam patterns (e.g. 100 questions / 75 min, plus subject mark weights from the official syllabus) so mocks mirror the real exam? If yes, which exams are you targeting now?
11. **Q11 – Malayalam source:** Can you share the official KPSC Malayalam syllabus PDFs for your target exams? Without them, I'll seed only names I can confirm and mark the rest "needs review".
12. **Q12 – Visual style:** Keep the dark "ink and paper slip" look (calmer and simplified), or move to a lighter look that follows your phone's light/dark mode? Using system fonts instead of Fraunces / IBM Plex makes the app faster and fully offline. OK?
13. **Q13 – Workflow:** Connect GitHub here so I can commit files directly to the new repo, or continue with manual uploads? And do you want automated tests on GitHub Actions (free, optional)?
14. **Q14 – Data choices during import:**
    - Drop the polluted scroll-mode timing (B6)? (Recommended: yes.)
    - Should past bank tests be re-scored with the correct syllabus marking (B7) or kept as they were?
15. **Q15 – Flashcards:** Keep the simple Known / Again system, or add light spaced repetition, where cards come back after 1, 3, 7… days?
