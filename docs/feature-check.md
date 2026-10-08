# Feature check: PSC Exam Vault → Lakshyam

Every feature of the old app (from the audit in [`redesign-brief.md` §6](redesign-brief.md#6-feature-audit))
and where it now lives in Lakshyam. Checked by hand on the 1.0.0 build with a real backup
imported, in English and Malayalam.

**Legend:** ✅ there, same or better · ➕ new in Lakshyam · ↪ deliberately changed (reason given)

## Syllabus and content

| Old feature | In Lakshyam | |
|---|---|---|
| Multiple syllabuses + switcher | Top-bar syllabus chip | ✅ |
| Marking scheme per syllabus (exact fraction) | Settings → Syllabuses; shown in words on results | ✅ |
| Add / edit / delete syllabus | Settings → Syllabuses | ✅ |
| Exam pattern (questions, minutes, subject weights) | Settings → Syllabuses → pattern; used by Mock | ➕ |
| Import paper JSON (file / paste, checks, auto-fix, duplicate warning) | Library → Papers → + Add paper (now with **Copy instructions for AI**) | ✅ |
| Re-import a paper with the same ID | Same flow; your flags, notes and fixes are kept | ✅ fixed |
| Answer key JSON | Paper ⋯ → Add answer key | ✅ |
| Bulk explanations JSON | Paper ⋯ → Add explanations | ✅ |
| Rename / post name / move to syllabus / delete paper | Paper ⋯ (delete has undo) | ✅ |
| Filter a paper by subject / topic | Filter chip on the paper screen | ✅ |
| Edit question, reassign, deleted-by-PSC, delete, copy | Question card ⋯ | ✅ |
| Tap a letter to set the answer + answers lock | View menu → Edit answers (read-only otherwise) | ↪ no lock needed |
| Hide answers / show explanations | Study / Self-test view; "Show explanation" per card | ✅ |
| Scroll / swipe | Test sheet, listing view menu, results layout switch | ✅ |
| Sort by difficulty / time | Listing sort menu | ✅ |
| ⭐ Flag + flagged list | ⭐ on the card; automatic ⭐ Flagged set | ✅ |
| Copy list | Listing ⋯ → Copy all questions | ✅ |
| Exam include filter + saved templates | Filter chip; templates inside the filter sheet | ✅ |
| "avg diff" on every row | In sorting and Progress only | ↪ less clutter |

## Taxonomy and study tracking

| Old feature | In Lakshyam | |
|---|---|---|
| Subjects → Topics | Library → Subjects → subject (topics sorted by question count by default; same Sort & filter sheet) | ✅ |
| Topic list with sorts, sub-filters, label chips, lists | Library → Topics: search + Sort & filter sheet + one chip row | ✅ |
| Rename subject / topic (merges on clash) | Topic / subject ⋯; stable IDs | ✅ fixed |
| Add custom subject / topic | Inside the reassign sheet | ✅ |
| Studied +1 / −1 | 📖 Studied +1 on the topic page; −1 via undo or ⋯; also ticked from the timetable | ✅ |
| Due for review | Today | ✅ |
| Test count per topic + link | Topic subtitle → test history for that topic | ✅ |
| Named topic lists, colour labels, long-press | Topics chip row, Sort & filter sheet, long-press (also in ⋯) | ✅ |
| Malayalam names | Settings → Display: English · മലയാളം · Both | ➕ |

## Tests

| Old feature | In Lakshyam | |
|---|---|---|
| Practice from paper / subject / topic / search / AI / set | ▶ Practice on every listing | ✅ |
| Timer (0.9 min × questions, ±, pause, auto-submit) | Test sheet; remembers your choice | ✅ |
| Scroll / swipe, jump bar, Prev / Next | Both layouts; scroll timing fixed | ✅ fixed |
| Guess marking | 🤔 on each question | ✅ |
| Mock exam | Start a test → Mock | ✅ |
| Weak-area bank | Start a test → Weak areas (More → save as a bank) | ✅ |
| Wrong-answer review | Start a test → Still wrong | ✅ |
| Random exam from a bank | Start a test → From a bank | ✅ |
| Retake | Results screen | ✅ |
| Resume an unfinished test | Continue card on Today | ➕ |

## Results and history

| Old feature | In Lakshyam | |
|---|---|---|
| Correct / wrong / unanswered filters | Results screen | ✅ |
| Guessed right / wrong filters | Results filter menu | ✅ |
| Per-question time | Card meta line | ✅ |
| Attempts tab (group, sort, search) | Progress → Test history | ✅ |
| Delete a test | Test history ⋯ | ✅ |

## Question bank, difficulty, stats

| Old feature | In Lakshyam | |
|---|---|---|
| Banks: create, rename, delete, add from pool, import JSON, type a question, remove | Library → Banks | ✅ |
| Difficulty E/M/D, auto from time, manual override | Chip on the card; times editable in Settings (with "apply to past tests", undo) | ✅ |
| Difficulty on/off | Settings | ✅ |
| Overview cards, recent scores | Progress summary + sparkline | ✅ |
| Subject → topic drill-down, all-topics list | Progress layers | ✅ |
| Time / Difficulty / Right-Wrong / Guesswork tabs | Progress → Detailed tables (filter by subject, sort, minimum answers, hide empty rows — 1.6.4) | ✅ |
| Counting basis | Progress ⚙ | ✅ |
| Low-data mark | "few answers" tag | ✅ |
| PYQ vs AI stats | Progress header switch | ✅ |
| Start fresh stats | Progress ⚙ | ✅ |
| Streak / today counter | Today | ✅ |
| Stats quick practice / AI tools | Today, Start a test, Smart insights | ✅ |

## Notes, search, text

| Old feature | In Lakshyam | |
|---|---|---|
| "My note" per listing | Collapsed note on each listing | ✅ |
| Notes tab | Notes tab | ✅ |
| Older per-question notes | Imported as notes linked to their question | ✅ |
| Global search, scope, preview, view as list | 🔍; also finds subjects / topics in both languages | ✅ |
| Line breaks, bold / italic, maths, Malayalam | Same syntax; KaTeX stored locally (offline) | ✅ |

## AI

| Old feature | In Lakshyam | |
|---|---|---|
| Presets, priority, auto-fallback, test, answer language | Settings → AI; presets can now be paused | ✅ |
| Explain / my mistake / memory trick / revision note, save | Row under each question card, card ⋯, results | ✅ |
| Similar questions / generate for topic | Card ⋯ / topic ⋯ (reviewed before saving, kept apart) | ✅ |
| Weak-area study plan | Replaced by **My timetable** (AI draft you review and approve) and **Smart insights** | ↪ the timetable does the same job with dates and topics you tick |
| Tricks for wrong answers | Still wrong ⋯ | ✅ |
| Guess coach | Guessing insight / detailed table | ✅ |
| AI questions separate from PYQs | PYQ / AI / Cards switch | ✅ |
| Flashcards (study / list, known / again, shuffle) | Cards view, with spaced review | ✅ |
| Study PDFs (text, scanned pages, editor, style guide, quoted questions, flashcards, notes) | Topic ⋯ → Study PDFs; page editor now warns before losing unsaved edits | ✅ |
| Bank-tab AI / Flashcard hubs | Kept on Library → Banks as rows (shown only when AI content exists) | ↪ the brief planned to remove them as duplicates; kept because they are harmless and some people look there |

## Data

| Old feature | In Lakshyam | |
|---|---|---|
| Backup export / restore (merge or replace) | Settings → Backup; dry-run, safety copy, checks | ✅ |
| Question Vault / Prep Vault exports | Same importer | ✅ |

## New in Lakshyam (not in the old app)

Today screen with Quick 10 and daily goal · exam countdown · timetable (any days and hours, up to 6 months, calendar export) · study diary (automatic checklist, coloured days, day review with faces, weekly / monthly AI reports) · Smart insights · safety copies with Undo · app in Malayalam · themes (Phone / Light / Dark / Paper) · Settings search · up to 20 exam countdowns · mistake review on a schedule · Today's session · Google Drive backup · syllabus map · question text size · crossing out options · screen kept on in tests.

## Added in 1.7 (from the focus research review)

| Feature | Where | Status |
|---|---|---|
| Focus check: leaves of 5 s+ during a test counted (not while paused), shown on the result; Do Not Disturb tip before a test after repeated leaving; real-break tip after 25+ min | Test → Result; Start test sheet; Settings → Tests & questions | ✅ |
| Best time of day (first tries vs your usual on the same topics, shown only when the gap is clear) and stayed-vs-left comparison | Progress → Smart insights → When you focus best; timetable hint and AI prompt; weekly/monthly diary report | ✅ |
