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
| Notes tab | Revise tab → 📝 Notes (1.26: the bottom tab became Revise; Notes is unchanged inside it, and #/notes still works) | ↪ moved |
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
| Notes: only the chosen syllabus's notes (its topics, subjects, papers, questions, tests) and general notes by default; "All syllabi" shows every note | Revise → Notes | ✅ |

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

## Added in 1.23

| Feature | Where | Status |
|---|---|---|
| 📱 Add screen time: pick 1–4 screenshots of Digital Wellbeing (App activity details) or Samsung Screen time, or a PDF; your AI preset reads app names and times (the screenshot is not kept); apps under 20 minutes are left out; date read from the screenshot when shown (else you pick it); you can fix any time | Today card; a day in the Study diary | ✅ |
| For each app one tap: All study / Mostly / About half / A little / None / Needed (calls, banking: neither study nor wasted); your usual answer is filled in after the same answer on 2 days; Lakshyam starts as "All study" | Screen-time sheet | ✅ |
| After saving: study · needed · wasted bar, vs your usual day, over/under your limit (kind wording on a bad day), biggest time-wasters, your if–then plan | Screen-time sheet | ✅ |
| Weekly report: study and wasted per day (▲▼ vs the week before), share that was study, days under your limit; limit suggested after 7 days (~20% under your usual day, lowered 10% when kept on 5+ of 7 days, or set your own); biggest time-waster with a Digital Wellbeing app-timer suggestion; ✍ if–then plan (shown on the Today card); the AI weekly report is told the figures. Screen time does not change the day score or colour | Study diary → This week / Last week | ✅ |
| A day in the diary: screen time with Edit / Delete (Undo); swipe left / right or ‹ › for the next / previous day | Study diary → tap a day | ✅ |
| 📖 All daily entries: by week or by month (‹ › to move), "List" (scroll) or "One day" (swipe or ‹ ›); each day shows score, mood, tags, note, questions, topics, screen time; tap to open the day | Study diary, below the calendar | ✅ |
| Fix: on Today at 360 px in Malayalam the goal and habits rows were a little too wide | Today | ✅ |

## Added in 1.24

| Feature | Where | Status |
|---|---|---|
| Every tutor answer (explain, facts, chat, analysis, tricks, strategy, reports…) is told today's date and that facts which change (office holders, records, latest figures, recent schemes) may be out of date: they are marked "⚠ verify: as of <year>"; a past PSC answer may be "correct at the time of the exam; may have changed since". The paper's year is given with each question. AI question writers avoid answers that change over time unless looked up | All AI | ✅ |
| Questions about things that change (subject/topic "Current affairs", words like present / current / latest / appointed / നിലവിലെ / ഇപ്പോഴത്തെ, or a recent year) are looked up on trusted websites first (Gemini Google Search or Groq gpt-oss browser search) for Explain, Related facts and Ask AI; the answer says what was correct at the exam and what is true now; sources with ✓ ≈ ⚠; saved with a "🌐 Sources" line. If searching isn't possible (no such preset, limit used up), it answers from memory and says so | Question cards | ✅ |
| 🌐 Check on the web: on every AI answer sheet not already from the web; chat has a "Search the web for this reply" switch (on by itself for current-affairs questions); test analysis has "🌐 Recheck with the web" | AI sheets, chat, test result | ✅ |
| Switch: "Look up current affairs on the web" (on by default) | Settings → AI | ✅ |

## Added in 1.25

| Feature | Where | Status |
|---|---|---|
| Malayalam style guide for every Malayalam answer: standard Malayalam as in PSC papers / SCERT textbooks, Malayalam script only, names as newspapers write them with English in brackets, and a list of standard terms (ഭരണഘടന, അനുച്ഛേദം, നിർദ്ദേശക തത്വങ്ങൾ, പ്രക്ഷോഭം, ജീവകം…) | All AI | ✅ |
| Malayalam answers are asked of the best Malayalam AI first (Gemini, then Claude / GPT, Gemma, then Groq / OpenRouter); your 🤖 choice is kept for English answers and is not changed by this (switch: "Malayalam answers: use the best Malayalam AI first", on) | Settings → AI | ✅ |
| Factual answers at low creativity (0.2); memory tricks and motivational lines 0.7; reading pages 0. Explanations start from the marked answer and say "not sure" instead of guessing | All AI | ✅ |
| Presets you have flagged 🚩 often (3+ flags and ≥1 in 20 answers) are tried after the others when your 🤖 preset can't answer | All AI | ✅ |
| Second opinion on facts (switch, off by default): when a less reliable AI (Groq, OpenRouter…) answers, a stronger preset you have (Gemini first) checks the facts; "✓ no mistakes found" or "⚠ corrections" shown under the answer and kept with it when saved | AI answer sheets (explain, facts, strategy, coach…) | ✅ |

## Changed and added in 1.26 (from the UX review)

Nothing was removed: every change below moved or merged something, and the numbers are recounted without editing
any saved record. (Review items 16 and the APK items were left for later, as asked.)

| Change | Where | Status |
|---|---|---|
| Fix: Malayalam on 360-px phones, the test header fits (icon-only Pause, shorter count); Submit stays on screen | Test | ✅ |
| Questions you never opened in a test (stopped early) don't count anywhere: not "left", not "still wrong", not in stats, analysis or mistake patterns; past Lakshyam tests are recounted the same way (records unchanged; old-app tests stay as they were). Submit says how many weren't opened; the result has "Do the n you didn't open" and a "Not opened" filter | Test, result, Progress, banks, insights | ↪ counting |
| Automatic AI analysis needs 3 answered questions (blanks no longer count) | Result | ✅ fixed |
| "Where your marks go" has its colour key back (each style has its own name; 10 clashing style names fixed) | Progress | ✅ fixed |
| Streak ring no longer clipped; best-day line above Screen time, written "day score n/100" | Today, Study diary | ✅ fixed |
| Tests on a catch-all topic are named "Subject — Topic" | Results, history, notes | ✅ fixed |
| Short Library tab names in Malayalam (വിഷയം · ടോപ്പിക് · പേപ്പർ · ബാങ്ക്); long names may break after "/" | Library, map | ✅ fixed |
| "Not touched yet" now says "Not practised in a test yet" | Progress insights | ✅ fixed |
| Today: one big button (today's session); one day card (goal ring, streak, checklist); quiet rows for Start a test, topics to revise and the timetable; the backup warning only at the top when a backup is overdue | Today | ↪ calmer |
| Topic reviews: at most 3 due topics a day (asked most × most overdue); the rest wait their turn; the session's topic and the due list agree | Today, Revise | ➕ |
| A test on a due topic with 8+ answers and 60% right counts as its revision automatically (toast with Undo) | Result | ➕ |
| Top bar: just "🤖 EN" for AI, so the syllabus name fits | Top bar | ✅ |
| Papers show the post, year, "done n× · best x/100" or "not done yet", and how many have no answer | Library → Papers | ➕ |
| One 🤖 button on each card opens Explain, Facts, Ask AI, Similar and In my notes (switch to show all five) | Question cards; Settings → AI | ↪ merged |
| Your tries on each card (✗ 5 Oct · ✓ 12 Oct); questions missed 3+ times marked, with a memory trick | Question cards | ➕ |
| Test cards: one short line (Q n of m · Q74 · 2022 · post); the subject and topic aren't shown while you answer (they'd hint at the answer in a mixed test); the result shows everything | Test | ↪ shorter |
| Results open on Wrong when there are wrong answers; Review mistakes / Retake wrong at the top | Result | ↪ |
| Progress leads with how much you leave blank and when a guess pays off with your marking; trend needs 5+ answers per test; time by difficulty says "too few"; "about n in every 100"; accuracy and score labelled apart | Progress, history | ↪ honest numbers |
| Weak spots shows practised topics by default (Not practised is its own filter); "no notes" said once | Smart insights | ↪ |
| Smart insights and My timetable rows moved up | Progress | ↪ moved |
| Diary colours easier to tell apart in dark mode; bigger tap targets on result chips and the 14-day strip | Diary, results | ✅ |
| About: What's new after each update (and a one-time "updated" note), what leaves this phone, credits for KaTeX and pdf.js | Settings → About & updates | ➕ |
| Question lists open in Self-test (answers hidden until you tap) unless you chose a view | Topic, subject, paper, bank lists | ↪ default |
| "Mistakes due" and "Still wrong" each explain their rule where you pick them | Start a test | ✅ |
| 🔁 "Asked in n papers" on repeated questions (tap for the papers) and a "Most repeated first" sort | Question cards, list sort | ➕ |
| ⏳ "Answer as of 2023" on past questions about things that change (the present…, latest, recently), with "Check it now" | Question cards | ➕ |
| 🤖 Sort "Other" into topics: AI suggests a topic for each question; you untick or change any and Apply (past answers move with them; Undo) | Topic page of an "Other" topic | ➕ |
| 🔎 Look-alike subject and topic names, with Merge (asks first; safety copy) | Library → Subjects | ➕ |
| First screen: Restore from Google Drive, Restore or import a file, or Start fresh | First run, empty Library | ➕ |
| Papers for another phone: a file with papers, answer keys, explanations and topic names only; adding it only adds what's missing | Settings → Backup & data | ➕ |
| Target marks per 100 per exam; Progress shows where you likely are (from your recent 300 answers) and the gap | Exams; Progress | ➕ |
| "Why was it wrong?" on a wrong answer (didn't know · mixed up · misread · changed my answer); Smart insights → Why you lose marks | Result; Smart insights | ➕ |
| 🗞 Current affairs quiz: pick a month (and Kerala / India / World, 10 or 20); made only from a web search (Gemini or Groq gpt-oss), never from memory; checked in code (date in the month, a real source page) and by a second web search; you review and save; kept with AI questions (Current Affairs subject), each with its month and source; saved quizzes listed by month | Library → Banks; Revise; Current Affairs ⋯ | ➕ |
| Revise tab (took Notes' place in the bottom bar): due today (mistakes, flashcards, topics), Still wrong, Flagged, Notes, all flashcards as one deck, Study PDFs, AI questions, Current affairs quiz; screens opened from it go back to it | Bottom bar | ➕ |
| Today's "n flashcards due" opens them as one deck across topics (By topic › for the old list) | Today, Revise | ↪ |
| Next steps review lists no longer jump to the top on each tick | Test result → next steps | ✅ fixed |
| Browser smoke test with made-up data, run by GitHub on every push | tests/e2e, CI | ➕ |

## Fixed in 1.26.1

| Fix | Where | Status |
|---|---|---|
| "Ask AI to change it" said the reply couldn't be read: a whole timetable is a long reply, and Gemini's thinking counts against the reply budget, so it was cut off. Gemini now gets room for it; a cut-off or messy reply is asked again once, compactly; the old draft goes as short lines; the timetable is found even with words or an echoed old draft around it | Timetable → Review → Ask AI to change it; Build with AI | ✅ fixed |
| Nothing is planned before the wake-up time or after the bedtime in your routine (the AI is told; the app also trims or removes such blocks and says so) | Timetable with AI | ✅ fixed |
| "Anything else?" is a box that shows everything you write (up to 1000 letters) | Timetable → new | ✅ |
| Subjects you haven't tested say "not practised yet" (was "Not practised yet right") | Timetable → new | ✅ fixed |

## Fixed in 1.26.2

| Fix | Where | Status |
|---|---|---|
| A timetable draft you hadn't started using (e.g. made with AI) hid the timetable row from Today, so there was no way back from there; Today now shows "Finish your timetable" (to its review), or "Plan your days" when there is none | Today | ✅ fixed |

## Fixed in 1.26.3

| Fix | Where | Status |
|---|---|---|
| AI timetables: breaks are named again (Breakfast, Tea break, Lunch, Dinner, Wake up & exercise) instead of plain "Food" / "Exercise" (1.26.1 asked for shorter replies and the names were dropped); every day plan keeps your routine's meals and exercise | Timetable with AI | ✅ fixed |

## Added in 1.26.4

| Change | Where | Status |
|---|---|---|
| Timetable blocks in Today's checklist can be tapped: they open the block's sheet to tick studied topics (they count as studied) or mark Done / Skipped; rows say "tap to tick what you studied" until something is ticked | Today | ✅ added |

## Added in 1.26.5

| Change | Where | Status |
|---|---|---|
| A topic can have several notes of your own, each with a name (typed, or taken from the pasted note's first heading); "📝 My notes" page lists them by name, newest edit first; read (laid out), edit, copy, delete (with Undo) | Topic → 📝 My notes, ⋯ → My notes | ✅ added |
| The topic page no longer shows the note's text, only the "📝 My notes (n)" button | Topic | ✅ changed |
| Pasted Markdown is laid out: headings (##, ###), **bold**, *italic*, bullets, numbered lists, tables and --- lines | Notes (also AI answers) | ✅ added |
| Text typed in a new note isn't lost when Back closes the editor (it comes back when you open the editor again) | My notes | ✅ added |
| The AI strategy sheet no longer offers "Add to the note"; the strategy stays as the topic's 🎯 AI strategy block | Topic → AI strategy | ✅ changed |
| The topic's existing note (from before) is kept as the first of its notes; merging topics moves every note, each kept separately | Data | ✅ kept |

## Added in 1.26.6

| Change | Where | Status |
|---|---|---|
| "▴ All / ▾ All" button at the bottom, right of Done, closes or opens every part of a note at once (shown when the note has 2 or more parts; follows parts you open or close yourself) | My notes → a note | ✅ added |
| Copy is a 📋 button so all five buttons fit one row on a 320–412 px phone | My notes → a note | ✅ changed |
| Escaped Markdown from a copied answer ("1\\. Third Mysore War", "\\*") shows as the plain character | Notes and AI answers | ✅ fixed |

## Added in 1.26.7

| Change | Where | Status |
|---|---|---|
| 🖍 button at the bottom (next to 🗑): tap it, tap headers to colour them gold (tap again to remove), tap 🖍 again to finish; colours stay for that note, also after closing and reopening, and don't change the note's text or its "last edited" date | My notes → a note | ✅ added |
