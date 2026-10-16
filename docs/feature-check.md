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
| Explain / my mistake / memory trick / revision note, save | Row under each question card (🤖 Explain · 📚 Facts · 💬 Ask AI · ✨ Similar), results. 1.15, at your request: the question-level memory trick moved to 🧠 Memory tricks on each PDF revision note (Still wrong ⋯ tricks stay); the question-level revision note became 📚 Related facts kept under the question | ↪ moved, nothing removed |
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

## Added in 1.8

| Feature | Where | Status |
|---|---|---|
| AI topic strategy: years, posts, question styles, repeated answers and near-repeat questions counted in code; AI explains sub-areas, styles, favourite facts, likely next, a plan fitted to your results, and a last-day checklist; save to the topic's note | Topic page → 🤖 AI strategy (3+ past questions) | ✅ |
| Smart insights weak spots: All · Practised · Not practised yet filter, Show all topics (1.8.1) | Progress → Smart insights | ✅ |

## Added in 1.9

| Feature | Where | Status |
|---|---|---|
| Topic AI strategy kept per topic (also found in older notes); AI practice questions and PDF questions follow its pattern (parts 1-4), switchable; for PDFs it only steers which passage facts are asked, the passage stays the only source and quotes are still checked | Topic ⋯ → Make practice questions (AI); Study PDF → Questions | ✅ |
| PDF flashcards and revision notes follow the topic pattern too: past-paper areas first and marked ⭐ (with a legend in notes), every other important point of the PDF still covered; nothing taken from outside the PDF (1.9.1) | Study PDF → Flashcards / Revision note | ✅ |

## Added in 1.10

| Feature | Where | Status |
|---|---|---|
| PDF revision notes saved as their own notes (one per PDF run, with pages and date) in a 📝 Notes tab next to Cards on topic and subject pages; read, edit, open PDF, delete with Undo; also in the Notes tab as "📄 PDF notes" | Topic / Subject → 📝 Notes | ✅ |
| "From which study PDF" chips on AI questions, Cards and Notes (each PDF, not from a PDF, or all together); notes grouped by PDF and "Read all together" | Topic / Subject → AI · Cards · Notes | ✅ |

## Added in 1.11

| Feature | Where | Status |
|---|---|---|
| Study PDF file moved to your Google Drive ("Lakshyam PDFs"): resumable upload, size + MD5 check, only then the phone copy is removed; page text stays on the phone; pictures / AI page reading fetch it for the session; keep on phone again; delete here only or Drive copy to the Bin | Study PDF → Where the PDF file is kept | ✅ |
| Move all PDFs to Drive with space freed shown; add back PDFs that are in Drive but not on this phone (same id, links restored) | Settings → Backup & data → Study PDFs | ✅ |

## Added in 1.12

| Feature | Where | Status |
|---|---|---|
| Reminders planned on the phone from the timetable, mistakes, diary, exams and backups: block check-in, morning plan (exam milestones 60/30/14/7/3/1 days), questions in free moments, streak rescue (only if nothing studied), day review, weekly report, backup; quiet hours, daily limit (most useful first), 6-minute spacing, pause 1/3/7 days | Settings → Study goals & Today → 🔔 Reminders | ✅ |
| Notification buttons answered without opening the app: ✓ Done / Skipped marks the block, 🙂 Good / 😕 Tough saves the day's mood (kept note and tags), Show answer shows the key; other buttons open the right place | Android notification | ✅ |
| One-time setup with your own Google Apps Script (5-minute timer, signed wake-ups with no content; self-check of signing before turning on); test reminder; set up again; disconnect | 🔔 Reminders → Set up | ✅ (real Google delivery not testable here) |
| Home-screen shortcuts: Quick 10, Today's session, Day review; links from notifications (#/today?go=…) | App icon long-press | ✅ |
| Reminder keys, plan and button presses stay on the phone (not in backups, kept on restore) | — | ✅ |

## Changed in 1.13 (look only; prompts, checks, defaults and saving unchanged — verified by recording every AI request and saved item before and after)

| Feature | Where | Status |
|---|---|---|
| Make questions / cards / note from a PDF: Save to, Pages (one line, Change opens From/To), How many / Length, then ⚙ More options (difficulty, language, style guide preview with View / edit, Learn from my PYQs, Use default, 🎯 pattern, double-check) with a one-line summary; ⓘ How it works | Study PDF → Practice questions / Flashcards / Revision note | ✅ |
| Steps 1 Choose → 2 Writing → 3 Check & save; Save button stays in view while reviewing | PDF make screens, topic 🤖 Make more sheet | ✅ |
| AI lists: 🤖 AI-made label (ⓘ shows the note); "From: … ▾" picker instead of chips; PDF name and page on each AI question instead of its number; 📄 Source line under the answer; one ⚙ View button (show + order) | Topic / Subject → AI · Cards · Notes | ✅ |
| 🤖 Make more: choose one of the topic's study PDFs, add a PDF, or (questions) general knowledge; Cards and Notes tabs get Make more too | Topic → AI · Cards · Notes | ✅ |

## Added in 1.14

| Feature | Where | Status |
|---|---|---|
| "🤖 Made with: model (n) · checked by model" after making questions / cards / note / general questions; per-item model when more than one model wrote | Check & save screens | ✅ |
| Model saved with each AI question (aiModel: by, checkedBy), flashcard, PDF note (aiModels), style guide and topic strategy (by); shown in Source line, card back / list, note header, style note, pattern hint, strategy sheet | Topic → AI · Cards · Notes; PDF make screen | ✅ |
| ⚙ View → Made with filter (offered when questions come from more than one model, incl. "Not recorded") | Topic / Subject → AI | ✅ |
| AI requests identical to 1.13 (recorded with a mock AI before and after) | — | ✅ |

## Added in 1.15

| Feature | Where | Status |
|---|---|---|
| Revision notes from a PDF: each section sees the end of the page before it (context only, no facts taken from it); watermark and repeated header/footer lines removed; slanted watermark text left out; ⭐ marks kept where they stand (no more moving to the top), at most about a third; lists name their body/topic; repeated points left out (count shown); "Page n" headings; a warning when a note could not cover every page; a bigger answer length | Study PDF → Revision note | ✅ |
| Questions from general knowledge get the same independent answer double-check as PDF questions (on by default; disagreeing ones start unticked) | Topic → 🤖 Make more → General knowledge | ✅ |
| Under each question, each kept in its own place: Explanation (with the model that wrote it, Clear + Undo), 📚 Related facts (Keep, Clear + Undo), 💬 chat with AI (kept, Continue, Clear) | Question cards (lists, results) | ✅ |
| "Add to topic notes" removed from the explanation sheet; ⋯ menu without Star and AI help (both are on the card; AI help stays in ⋯ if card AI buttons are off) | Question card | ✅ |
| Saved AI strategy shown as its own block on the topic page: read, make a new one, Clear + Undo | Topic page | ✅ |
| 🧠 Memory tricks (funny rhymes, little stories) for a PDF revision note, kept with the note, shown in Read | Topic → Notes | ✅ |
| List number (#1, #2…) next to the paper's question number | Question lists | ✅ |
| Maths in explanations and AI answers: formulas stay whole (bullets, bold, line breaks inside them no longer break them), \[ \] and \( \) understood, typeset in lists too; long formulas scroll sideways | Everywhere | ✅ |
| Test number strip: Q1 no longer cut off on the left | Test (one at a time) | ✅ |
| After Submit, Back (phone or ‹) goes to where the test was started (topic, subject, bank…), not Test history / Progress | Test result | ✅ |

## Changed in 1.16

| Feature | Where | Status |
|---|---|---|
| Smart insights in folding parts (Weak spots open first; each part shows a one-line summary when folded; what you open stays open); the empty "Targeted practice" part removed (its tip is in Notes check); missed count on practised weak spots; filter chips wrap | Progress → Smart insights | ✅ |
| Notes check looks only in the topic's own PDFs and its subject's general PDFs (no more another topic's PDF); "found" needs the page to be about the question (2 of its words), a lone year or common word no longer counts | Smart insights → a topic | ✅ |
| Insight topic: Practise this topic and Open the topic buttons, also when nothing is missed | Smart insights → a topic | ✅ |
| PDF page opened from "In your notes": ‹ goes back to Smart insights; turning pages there is not a Back step | Smart insights → a topic → page | ✅ |
| ‹ buttons go Back when their screen is the one you came from, so the phone's Back never goes round in circles; topic tabs (PYQ / AI / Cards / Notes), Library views, result filters and sort are not extra Back steps | Everywhere | ✅ |
| Test: Save and leave / Discard go back to where the test was started; the empty test screen has Today / Test history buttons | Test | ✅ |
| Result review: the paper and post on their own line under the question number (no squeezed header); all filter chips visible (wrap); no "Show 0 more" button | Test result, all question lists | ✅ |

## Added in 1.17

| Feature | Where | Status |
|---|---|---|
| 🤖 AI analysis of each test: written automatically right after the test (how it went, where marks were lost, facts to fix, next steps), kept with the test (in backups); Copy, Write again, Clear + Undo; a button on older tests; the figures are worked out in code | Test result; Settings → AI → Analyse each test automatically | ✅ |
| 🤖 switch for which preset is tried first and the AI's answer language (the same setting as Settings → AI) — moved in 1.19 to one button at the top | Top bar | ✅ |
| Chat with AI under each question; Related facts; memory tricks on PDF notes (1.15) | Question cards, Notes | ✅ |

## Added in 1.18

| Feature | Where | Status |
|---|---|---|
| 📖 PDF viewer: the study PDF's real pages, scrolling down; pages drawn near the screen only (long PDFs stay light); page box; − / + zoom (and pinch); a PDF kept in Google Drive opens after a sign-in tap, for this session only; nothing is changed | Study PDF → Read the PDF; page text screen → See this page; AI question Source line; PDF revision note → Open PDF; Smart insights "In your notes" | ✅ |
| 🔎 In my notes from any question: a word search (no AI) over the subject's study PDFs, PDF revision notes and your own notes; best passages first, matched words marked, "has the answer" when the right answer is there; tap → the PDF page or the note; optional "Ask AI which one answers it" (sends only those passages) | Question cards (also with AI buttons off) | ✅ |
| Search also finds words in your notes and study PDFs | 🔍 Search | ✅ |
| 🔊 Read aloud a question and its options with the phone's own voice (free, offline; Malayalam needs the phone's Malayalam voice); speed; show/hide the button. (1.18 also had an optional Gemini natural voice; removed in 1.19.1 at your request) | Question cards and tests; Settings → Look → Read aloud | ✅ |

## Changed in 1.19

| Feature | Where | Status |
|---|---|---|
| One 🤖 button at the top of the app (next to 🔍) shows the preset in use and the AI language (EN / മല / EN+മല); tap to change either for every AI action at once, or open All AI settings. The per-screen 🤖 switches are gone. Follows changes made in Settings → AI and auto-switch. Hidden when no AI preset is set up, and during tests | Top bar | ✅ |

## Changed in 1.19.1

| Feature | Where | Status |
|---|---|---|
| Read aloud uses only the phone's own voice: the Gemini natural-voice option is removed (nothing is sent to Google when reading; a Gemini choice saved by 1.18 is ignored); the app no longer allows playing downloaded audio (CSP back to before 1.18) | Question cards, tests, Settings → Look → Read aloud | ✅ |

## Added in 1.20

| Feature | Where | Status |
|---|---|---|
| The test analysis's Next steps are tagged ([FACTS] / [QUESTIONS] / [CARDS] / [REVISE]) and each gets a "Do it" button (older analyses offer one of each). Made only when you tap | Test result → AI analysis → Do the next steps with AI | ✅ |
| Fact sheet / practice questions / flashcards made with a web search: Gemini presets use Google Search grounding, Groq gpt-oss presets their browser search; the AI is told to use only trustworthy sources (government, NCERT/SCERT, universities, Britannica, The Hindu, Indian Express; Wikipedia only to cross-check; no quiz, coaching, blog or forum sites); each source marked ✓ trusted / ≈ fair / ⚠ check; with Gemini only pages Google really found are kept | Same | ✅ (real web search not testable here) |
| Without a web-capable preset: says so; can use the AI's own knowledge instead, marked "not checked on the web" | Same | ✅ |
| Questions: second independent answer check (disagreements unticked), reviewed, saved to the right topic with their sources, "Practise these now"; flashcards reviewed and saved to the topic; fact sheet saved to Notes with the test and its sources; Revise practises the wrong ones (no AI) | Same | ✅ |
| Notes: only the chosen syllabus's notes (its topics, subjects, papers, questions, tests) and general notes by default; "All syllabi" shows every note | Notes tab | ✅ |

## Changed in 1.20.1

| Change | Where | Status |
|---|---|---|
| Next steps' web search tries each preset that can search in turn (your 🤖 one first). A key whose web-search limit was hit is tried last for an hour; this is kept apart from its normal limit, so normal AI work is not moved off that key. The error lists every key tried with the limit Google names (e.g. its free-tier search limit and size), and offers "Use the AI's own knowledge" | Test result → Do the next steps with AI | ✅ |

## Added in 1.21

| Feature | Where | Status |
|---|---|---|
| 🚩 Flag: under each thing an AI made — answers in the AI sheet (explain, facts, tricks, strategy, coach, weak spots…), saved explanation / Related facts / chat replies on a question, AI-made questions, flashcards (list), PDF notes and their memory tricks, saved strategy, test analysis, next steps (fact sheet, questions, flashcards), PDF question/card/note reviews, AI study plan. Tap again to take the flag back. Kept in your backups (no keys) | Everywhere AI shows its model name | ✅ |
| Flag counts per AI: Settings → AI → 🚩 AI flags (most flagged first, what for, when); 🚩 n on each preset row and in the 🤖 switch at the top; Clear all (with Undo) | Settings → AI | ✅ |
| Test analysis: one ▲ Hide / ▼ Show button for the whole block (analysis and next steps), and "Hide analysis — go to the questions" at its end; stays folded while you review | Test result | ✅ |
| Web answers from Gemma (Gemini API): its planning ("thought" parts) is left out, thinking is turned down; a fact sheet starts at its first section | Next steps | ✅ |
| Sheets with a sticky button row: the row sits on the bottom edge (no text showing under it) | All sheets | ✅ |

## Changed in 1.21.1

| Change | Where | Status |
|---|---|---|
| While an AI is writing: "<preset> is writing… n s"; after 15 s "Ask the next AI" (stops waiting for that one and asks your next preset) and "Stop" | Every AI answer sheet, test analysis, next steps | ✅ |
| Gemma models on Google's API are asked to think less (reasoning_effort minimal), so answers come in seconds instead of minutes; a model that refuses the setting is asked again without it and never sent it again | All AI answers | ✅ |

## Added in 1.21.2

| Feature | Where | Status |
|---|---|---|
| Answer filter on question lists: a "n without answer" pill (shown when some question has no correct answer marked) → All / Without a correct answer / With a correct answer; "Showing n of m"; Practice and Copy use the filtered list; kept while the app is open | Topic (PYQs), subject, paper, bank lists | ✅ |

## Added in 1.22

| Feature | Where | Status |
|---|---|---|
| Each preset shows "Today: n requests · n tokens" and "In all: n requests · n tokens" (counted on this phone from every successful reply, including web searches and PDF jobs; today = your local day; tokens from 1.22 on, request totals include the earlier count) | Settings → AI | ✅ |
| What is left, only where the provider says it: Groq (requests left today, tokens left this minute, from its reply headers if the browser can read them); OpenRouter (free-model requests left today, credit left; asked when Settings → AI opens). Google Gemini: not available to apps (ai.dev/rate-limit) | Settings → AI | ✅ |
| "n today" next to each preset in the 🤖 switch at the top | Top bar | ✅ |

## Changed in 1.22.1

| Change | Where | Status |
|---|---|---|
| With an OpenRouter router model (openrouter/free, openrouter/auto), everything made shows the model that actually answered (from the reply's "model" field), e.g. "OpenRouter (upstage/solar-pro-3:free)"; that name is saved with explanations, questions, analyses, notes, and 🚩 flags count against it. Usage still counts on the OpenRouter preset | Everywhere AI shows its model | ✅ |

## Changed in 1.22.2

| Change | Where | Status |
|---|---|---|
| AI preset order: ↑ ↓ buttons replaced by a ⠿ handle — hold and drag up or down (the list scrolls near its top/bottom; your place is kept after the drop); tap it for Move to the top / up / down / to the bottom | Settings → AI | ✅ |

## Changed in 1.22.3

| Change | Where | Status |
|---|---|---|
| A preset that hit its limit shows a red "⛔ Limit reached · ~n min" label (it is tried last for about an hour); one whose web-search limit was hit shows an amber "🌐 Web search limit · ~n min" | Settings → AI, 🤖 switch at the top | ✅ |

## Added in 1.22.4

| Feature | Where | Status |
|---|---|---|
| Swipe left / right to the next / previous tab (Subjects ⇄ Topics ⇄ Papers ⇄ Banks); not from the screen edges (Android back gesture), the search box or sideways-scrolling rows; up-and-down scrolling and slow drags are not swipes; tabs don't add Back steps | Library | ✅ |

## Fixed in 1.22.5

| Fix | Where | Status |
|---|---|---|
| Tabs, search box and "+ New bank" / "Add a paper" buttons were stretched tall on short tabs since 1.22.4 | Library | ✅ |

