/* Converts a PSC Exam Vault backup (also Prep Vault / Question Vault exports)
   into Lakshyam records. Pure function: no DOM, no database. It never changes
   the input. The result is a plan the user reviews before anything is saved:

     buildImportPlan(backupJson) → { records: { storeName: [...] }, report }

   Every conversion that could surprise the user is listed in report.warnings
   or report.skipped with a reason. */

import { nameKey, ids, levenshtein } from "./ids.js";
import { TAXONOMY_SEED, FALLBACK_TOPIC } from "./taxonomy-seed.js";
import { markingFromLegacy, netScore, DEFAULT_MARKING } from "../domain/scoring.js";

const DELETED_SENTINEL = 5;
const AI_PAPER_PREFIX = "ai-practice-";
const BANK_ONLY_SYLLABUS = "__bank_only__";
const MALAYALAM = /[ഀ-ൿ]/g;

/* ---------- small helpers ---------- */

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === null || v === undefined ? "" : String(v));

function detectLang(text) {
  const letters = text.replace(/\s/g, "").length || 1;
  const ml = (text.match(MALAYALAM) || []).length / letters;
  if (ml > 0.3) return "ml";
  if (ml > 0) return "mixed";
  return "en";
}

function printedNumber(q) {
  if (q.original_number !== undefined && q.original_number !== null && q.original_number !== "") {
    return String(q.original_number);
  }
  const m = str(q.id).match(/(\d+)/);
  return m ? m[1] : null;
}

/** Collects issues with a few examples each, so the report stays short. */
class IssueList {
  constructor() { this.map = new Map(); }
  add(code, example, params = {}) {
    let entry = this.map.get(code);
    if (!entry) { entry = { code, count: 0, examples: [], params }; this.map.set(code, entry); }
    entry.count++;
    if (example !== undefined && entry.examples.length < 5) entry.examples.push(example);
  }
  list() { return [...this.map.values()]; }
}

/* ---------- names: subjects and topics ---------- */

/** Keeps every spelling seen for a name, and picks the one to display. */
class NameBook {
  constructor() {
    this.subjects = new Map(); // subjectKey → { variants: Map(name→count), seedName, seedOrder, topics: Map }
  }

  ensureSubject(name, weight = 1) {
    const key = nameKey(name) || nameKey("Unclassified");
    let s = this.subjects.get(key);
    if (!s) { s = { key, variants: new Map(), seedName: null, seedOrder: null, topics: new Map() }; this.subjects.set(key, s); }
    if (name) s.variants.set(name, (s.variants.get(name) || 0) + weight);
    return s;
  }

  ensureTopic(subjectName, topicName, weight = 1) {
    const s = this.ensureSubject(subjectName, 0);
    const name = str(topicName).trim() || FALLBACK_TOPIC;
    const key = nameKey(name) || nameKey(FALLBACK_TOPIC);
    let t = s.topics.get(key);
    if (!t) { t = { key, variants: new Map(), seedName: null, seedOrder: null }; s.topics.set(key, t); }
    t.variants.set(name, (t.variants.get(name) || 0) + weight);
    return { s, t };
  }

  seed(taxonomy) {
    Object.entries(taxonomy).forEach(([subject, topics], si) => {
      const s = this.ensureSubject(subject, 0);
      s.seedName = subject; s.seedOrder = si;
      [...topics, FALLBACK_TOPIC].forEach((topic, ti) => {
        const { t } = this.ensureTopic(subject, topic, 0);
        t.seedName = topic; t.seedOrder = ti;
      });
    });
  }

  static displayName(entry) {
    if (entry.seedName) return entry.seedName;
    let best = null; let bestCount = -1;
    entry.variants.forEach((count, name) => { if (count > bestCount) { best = name; bestCount = count; } });
    return best;
  }

  subjectId(name) { return ids.subject(this.ensureSubject(name, 0).key); }

  topicId(subjectName, topicName) {
    const { s, t } = this.ensureTopic(subjectName, topicName, 0);
    return ids.topic(s.key, t.key);
  }
}

function findPossibleDuplicates(entries) {
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]; const b = entries[j];
      const short = Math.min(a.key.length, b.key.length);
      if (short < 4) continue;
      // "…1968" vs "…1986": same words, different numbers → different things.
      const digitless = (k) => k.replace(/\p{N}+/gu, "");
      if (digitless(a.key) === digitless(b.key)) continue;
      // "Other" vs "Other diseases": the fallback topic is not a duplicate of anything.
      if (a.key === "other" || b.key === "other") continue;
      const close = levenshtein(a.key, b.key) <= Math.max(1, Math.floor(short * 0.12));
      const prefix = a.key.startsWith(b.key) || b.key.startsWith(a.key);
      if (close || prefix) out.push([a, b]);
    }
  }
  return out;
}

/* ---------- main ---------- */

export function buildImportPlan(input, { now = Date.now(), seed = TAXONOMY_SEED } = {}) {
  const warnings = new IssueList();
  const skipped = new IssueList();
  const fail = (code) => ({ ok: false, error: code });

  if (!isObj(input)) return fail("not-object");
  if (!Array.isArray(input.papers)) return fail("no-papers");

  const stamp = { createdAt: now, updatedAt: now, ownerId: "local" };
  const book = new NameBook();
  book.seed(seed);

  /* --- syllabuses --- */
  const legacySyllabi = arr(input.syllabuses).filter((s) => isObj(s) && s.id);
  if (!legacySyllabi.length) legacySyllabi.push({ id: "default", name: "Default", marking: null });
  const syllabusIds = new Set(legacySyllabi.map((s) => String(s.id)));
  arr(input.papers).forEach((p) => {
    const sid = str(p?.syllabus_id) || "default";
    if (sid !== BANK_ONLY_SYLLABUS && !syllabusIds.has(sid)) {
      legacySyllabi.push({ id: sid, name: sid, marking: null });
      syllabusIds.add(sid);
      warnings.add("syllabus-created", sid);
    }
  });
  const syllabi = legacySyllabi.map((s, order) => ({
    id: ids.syllabus(s.id), oldId: String(s.id), name: str(s.name) || String(s.id),
    marking: s.marking ? markingFromLegacy(s.marking) : { ...DEFAULT_MARKING },
    pattern: null, stage: null, order, source: "personal", ...stamp
  }));
  const markingBySyllabus = new Map(syllabi.map((s) => [s.id, s.marking]));
  const sylId = (oldId) => ids.syllabus(str(oldId) || "default");

  /* --- papers and questions --- */
  const papers = []; const questions = []; const questionState = []; const notes = [];
  const questionIndex = new Map(); // "oldPaperId::qid" → question record
  const paperIdsSeen = new Set();

  arr(input.papers).forEach((p, pIndex) => {
    if (!isObj(p) || !p.id) { skipped.add("paper-no-id", `#${pIndex + 1}`); return; }
    const oldPaperId = String(p.id);
    if (paperIdsSeen.has(oldPaperId)) { skipped.add("paper-duplicate-id", oldPaperId); return; }
    paperIdsSeen.add(oldPaperId);

    const isAi = oldPaperId.startsWith(AI_PAPER_PREFIX);
    const bankOnly = p.is_bank_only || p.syllabus_id === BANK_ONLY_SYLLABUS;
    const kind = isAi ? "ai" : bankOnly ? "bank-import" : oldPaperId.startsWith("typed-") ? "typed" : "pyq";
    const paperId = ids.paper(oldPaperId);
    const paper = {
      id: paperId, oldId: oldPaperId, kind,
      syllabusId: bankOnly ? null : sylId(p.syllabus_id),
      name: str(p.name) || oldPaperId, postName: str(p.post_name),
      source: isAi ? "ai" : "personal", questionCount: 0, ...stamp
    };

    const qidsSeen = new Set();
    arr(p.questions).forEach((q, qIndex) => {
      const where = `${paper.name} Q${qIndex + 1}`;
      if (!isObj(q)) { skipped.add("question-not-object", where); return; }
      const qid = str(q.id) || `idx${qIndex + 1}`;
      if (!q.id) warnings.add("question-no-id", where);
      if (qidsSeen.has(qid)) { skipped.add("question-duplicate-id", where); return; }
      if (!str(q.question_text).trim()) { skipped.add("question-no-text", where); return; }
      if (!Array.isArray(q.options) || q.options.length < 2) { skipped.add("question-no-options", where); return; }
      qidsSeen.add(qid);

      const options = q.options.map(str);
      let answerIndex = null; let status = "active";
      const ci = q.correct_answer_index;
      if (ci !== null && ci !== undefined && ci !== "") {
        const n = Number(ci);
        if (n === DELETED_SENTINEL && options.length < 6) status = "deleted_by_psc";
        else if (Number.isInteger(n) && n >= 0 && n < options.length) {
          answerIndex = n;
          if (n === DELETED_SENTINEL) warnings.add("answer-f-or-deleted", where);
        } else warnings.add("answer-out-of-range", where);
      }

      const subjectName = str(q.subject).trim() || "Unclassified";
      if (!str(q.subject).trim()) warnings.add("question-no-subject", where);
      book.ensureTopic(subjectName, q.topic, 1);
      book.ensureSubject(subjectName, 1);

      const id = ids.question(oldPaperId, qid);
      const text = str(q.question_text);
      const record = {
        id, paperId, oldId: qid, order: qIndex, number: printedNumber(q),
        text, options, answerIndex, status,
        explanation: str(q.explanation).trim(),
        subjectId: book.subjectId(subjectName), topicId: book.topicId(subjectName, q.topic),
        lang: detectLang(text + " " + options.join(" ")),
        difficultyHint: ["E", "M", "D"].includes(q.difficulty) && !q.difficulty_auto && !q.difficulty_manual ? q.difficulty : null,
        source: isAi || q.ai_generated ? "ai" : kind === "pyq" ? "pyq" : "personal",
        sourceRef: isObj(q.source) ? { pdf: str(q.source.pdf), page: q.source.page ?? null, quote: str(q.source.quote) } : null,
        ...stamp
      };
      questions.push(record);
      questionIndex.set(`${oldPaperId}::${qid}`, record);
      paper.questionCount++;

      // The user's own state on this question (kept apart from content).
      const flagged = Boolean(q.flagged);
      const difficulty = ["E", "M", "D"].includes(q.difficulty) ? q.difficulty : null;
      // A difficulty you cleared by hand still blocks automatic marking (as in the old app).
      if (flagged || difficulty || q.difficulty_manual) {
        questionState.push({
          id, questionId: id, flagged, difficulty,
          difficultySource: difficulty && q.difficulty_auto ? "auto" : (difficulty || q.difficulty_manual ? "manual" : null), ...stamp
        });
      }
      if (str(q.note).trim()) {
        notes.push({ id: ids.note("question", id), target: { type: "question", id }, label: `${paper.name} · Q${record.number ?? qIndex + 1}`, text: str(q.note).trim(), ...stamp });
      }
    });
    if (!Array.isArray(p.questions)) warnings.add("paper-no-questions", paper.name);
    papers.push(paper);
  });

  /* --- names that appear outside questions (progress, labels, lists, notes) --- */
  const splitKey = (key) => { const i = key.indexOf("|||"); return i < 0 ? null : [key.slice(0, i), key.slice(i + 3)]; };
  const studyEntries = Object.entries(isObj(input.studyProgress) ? input.studyProgress : {});
  studyEntries.forEach(([key]) => {
    const sep = key.indexOf("::");
    const parts = splitKey(sep < 0 ? key : key.slice(sep + 2));
    if (parts) book.ensureTopic(parts[0], parts[1], 0);
  });
  Object.keys(isObj(input.topicLabels) ? input.topicLabels : {}).forEach((key) => {
    const parts = splitKey(key); if (parts) book.ensureTopic(parts[0], parts[1], 0);
  });
  arr(input.topicLists).forEach((l) => arr(l?.items).forEach((it) => it?.subject && book.ensureTopic(it.subject, it.topic, 0)));
  arr(input.flashcards).forEach((c) => c?.subject && book.ensureTopic(c.subject, c.topic, 0));
  arr(input.attempts).forEach((a) => arr(a?.answers).forEach((r) => r?.subject && book.ensureTopic(r.subject, r.topic, 0)));

  /* --- subjects and topics (now that every spelling is known) --- */
  const subjects = []; const topics = []; const mergedNames = []; const possibleDuplicates = [];
  const subjectList = [...book.subjects.values()];
  subjectList.sort((a, b) => (a.seedOrder ?? 999) - (b.seedOrder ?? 999) || NameBook.displayName(a).localeCompare(NameBook.displayName(b)));
  subjectList.forEach((s, order) => {
    const name = NameBook.displayName(s);
    const subjectId = ids.subject(s.key);
    subjects.push({ id: subjectId, key: s.key, name, order, fromSeed: Boolean(s.seedName), source: "personal", ...stamp });
    const otherSpellings = [...s.variants.keys()].filter((v) => v !== name);
    if (otherSpellings.length) mergedNames.push({ kind: "subject", into: name, from: otherSpellings });

    const topicEntries = [...s.topics.values()];
    topicEntries.sort((a, b) => (a.seedOrder ?? 999) - (b.seedOrder ?? 999) || NameBook.displayName(a).localeCompare(NameBook.displayName(b)));
    topicEntries.forEach((t, tOrder) => {
      const tName = NameBook.displayName(t);
      topics.push({
        id: ids.topic(s.key, t.key), subjectId, key: t.key, name: tName, order: tOrder,
        isFallback: t.key === nameKey(FALLBACK_TOPIC), fromSeed: Boolean(t.seedName), source: "personal", ...stamp
      });
      const tOther = [...t.variants.keys()].filter((v) => v !== tName);
      if (tOther.length) mergedNames.push({ kind: "topic", subject: name, into: tName, from: tOther });
    });
    findPossibleDuplicates(topicEntries.map((t) => ({ key: t.key, name: NameBook.displayName(t) })))
      .forEach(([a, b]) => possibleDuplicates.push({ kind: "topic", subject: name, a: a.name, b: b.name }));
  });
  findPossibleDuplicates(subjectList.map((s) => ({ key: s.key, name: NameBook.displayName(s) })))
    .forEach(([a, b]) => possibleDuplicates.push({ kind: "subject", a: a.name, b: b.name }));

  /* --- attempts (test history) --- */
  const attempts = []; let missingAnswerRefs = 0; let timingRemoved = 0;
  const attemptIdsSeen = new Set();
  arr(input.attempts).forEach((a, aIndex) => {
    if (!isObj(a) || !a.id) { skipped.add("attempt-no-id", `#${aIndex + 1}`); return; }
    if (attemptIdsSeen.has(a.id)) { skipped.add("attempt-duplicate-id", a.id); return; }
    attemptIdsSeen.add(a.id);
    const answersIn = arr(a.answers).filter(isObj);
    const isAi = a.type === "ai" || (answersIn.length > 0 && answersIn.every((r) => str(r.paperId).startsWith(AI_PAPER_PREFIX)));

    // Which syllabus: as recorded; bank tests go to the syllabus most of their questions belong to (B7).
    let syllabusId = sylId(a.syllabus_id);
    if (a.type === "bank") {
      const votes = new Map();
      answersIn.forEach((r) => {
        const q = questionIndex.get(`${r.paperId}::${r.qid}`);
        const p = q && papers.find((pp) => pp.id === q.paperId);
        if (p?.syllabusId) votes.set(p.syllabusId, (votes.get(p.syllabusId) || 0) + 1);
      });
      const top = [...votes.entries()].sort((x, y) => y[1] - x[1])[0];
      if (top && top[0] !== syllabusId) { syllabusId = top[0]; warnings.add("bank-test-syllabus", str(a.scopeLabel)); }
    }

    // Scroll-mode timing bug (B6): only question 1 got a time → not real per-question time.
    const timedIdx = answersIn.map((r, i) => (Number(r.timeMs) > 0 ? i : -1)).filter((i) => i >= 0);
    const pollutedTiming = answersIn.length > 3 && timedIdx.length === 1 && timedIdx[0] === 0;
    if (pollutedTiming) { timingRemoved++; warnings.add("timing-removed", str(a.scopeLabel)); }

    const answers = answersIn.map((r) => {
      const q = questionIndex.get(`${r.paperId}::${r.qid}`);
      if (!q) missingAnswerRefs++;
      const subjectName = str(r.subject) || "Unclassified";
      const sel = r.selectedIndex === null || r.selectedIndex === undefined ? null : Number(r.selectedIndex);
      return {
        questionId: q ? q.id : ids.question(str(r.paperId), str(r.qid)),
        selected: Number.isInteger(sel) ? sel : null,
        correct: r.correctIndex === null || r.correctIndex === undefined ? null : Number(r.correctIndex),
        isCorrect: Boolean(r.isCorrect), graded: Boolean(r.isGraded), guessed: Boolean(r.guessed),
        timeMs: pollutedTiming ? null : (Number(r.timeMs) > 0 ? Number(r.timeMs) : null),
        subjectId: book.subjectId(subjectName), topicId: book.topicId(subjectName, r.topic),
        difficulty: ["E", "M", "D"].includes(r.difficulty) ? r.difficulty : null
      };
    });

    const marking = a.marking ? markingFromLegacy(a.marking) : (markingBySyllabus.get(syllabusId) || { ...DEFAULT_MARKING });
    const counts = {
      correct: Number(a.correctCount) || 0, wrong: Number(a.wrongCount) || 0,
      unanswered: Number(a.unansweredCount) || 0, total: Number(a.totalCount) || answers.length
    };
    const computed = netScore(counts.correct, counts.wrong, marking);
    let recorded = a.netScore === undefined || a.netScore === null ? null : Number(a.netScore);
    if (recorded === null) { warnings.add("score-computed", str(a.scopeLabel)); recorded = computed; }
    else if (Math.abs(recorded - computed) > 0.011) warnings.add("score-mismatch", `${str(a.scopeLabel)}: ${recorded} vs ${computed}`);

    attempts.push({
      id: ids.attempt(a.id), oldId: String(a.id), syllabusId, kind: isAi ? "ai" : "pyq",
      scope: mapScope(a, book), status: "submitted",
      submittedAt: Date.parse(a.timestamp) || now, startedAt: null,
      marking, markingWasRecorded: Boolean(a.marking), timerMinutes: a.timerMinutes ?? null,
      autoSubmitted: Boolean(a.autoSubmitted), layout: null,
      counts, netScore: recorded, answers, timingRemoved: pollutedTiming, ...stamp
    });
  });
  if (missingAnswerRefs) warnings.add("answer-question-missing", undefined, { n: missingAnswerRefs });

  /* --- question banks --- */
  const sets = arr(input.banks).filter((b) => isObj(b) && b.id).map((b) => {
    const questionIds = [];
    arr(b.questionRefs).forEach((r) => {
      const q = questionIndex.get(`${r?.paperId}::${r?.qid}`);
      if (q) questionIds.push(q.id); else warnings.add("bank-question-missing", `${str(b.name)}: ${r?.paperId} ${r?.qid}`);
    });
    return { id: ids.bank(b.id), oldId: String(b.id), name: str(b.name) || "Bank", kind: "user", questionIds, ...stamp };
  });

  /* --- topic lists, labels, studied counts --- */
  const topicLists = arr(input.topicLists).filter((l) => isObj(l) && l.id).map((l) => ({
    id: ids.topicList(l.id), oldId: String(l.id), name: str(l.name) || "List",
    topicIds: arr(l.items).filter((it) => it?.subject).map((it) => book.topicId(it.subject, it.topic)), ...stamp
  }));

  // Old labels applied to every syllabus; now labels belong to one syllabus (B9),
  // so each label is copied to every syllabus that has questions in that topic.
  const syllabiByTopic = new Map();
  const paperSyllabus = new Map(papers.map((p) => [p.id, p.syllabusId]));
  questions.forEach((q) => {
    const sid = paperSyllabus.get(q.paperId);
    if (!sid) return;
    if (!syllabiByTopic.has(q.topicId)) syllabiByTopic.set(q.topicId, new Set());
    syllabiByTopic.get(q.topicId).add(sid);
  });
  const labels = [];
  Object.entries(isObj(input.topicLabels) ? input.topicLabels : {}).forEach(([key, lbl]) => {
    const parts = splitKey(key);
    if (!parts || !isObj(lbl)) { skipped.add("label-bad", key); return; }
    const topicId = book.topicId(parts[0], parts[1]);
    const targets = syllabiByTopic.get(topicId) || new Set([syllabi[0].id]);
    targets.forEach((sid) => labels.push({ id: ids.label(sid, topicId), syllabusId: sid, topicId, name: str(lbl.name), color: str(lbl.color), ...stamp }));
  });

  const topicState = [];
  studyEntries.forEach(([key, value]) => {
    const sep = key.indexOf("::");
    const sid = sylId(sep < 0 ? "default" : key.slice(0, sep));
    const parts = splitKey(sep < 0 ? key : key.slice(sep + 2));
    if (!parts) { skipped.add("progress-bad-key", key); return; }
    const info = typeof value === "number" ? { count: value } : (isObj(value) ? value : {});
    const topicId = book.topicId(parts[0], parts[1]);
    const id = ids.topicState(sid, topicId);
    const existing = topicState.find((x) => x.id === id);
    if (existing) { existing.studiedCount += Number(info.count) || 0; warnings.add("progress-merged", parts[1]); return; }
    topicState.push({
      id, syllabusId: sid, topicId, studiedCount: Number(info.count) || 0,
      lastStudiedAt: info.lastStudiedAt ?? null, nextReviewAt: info.nextReviewAt ?? null, ...stamp
    });
  });

  /* --- listing notes --- */
  Object.entries(isObj(input.listingNotes) ? input.listingNotes : {}).forEach(([key, n]) => {
    if (!isObj(n) || !str(n.text).trim()) return;
    const target = mapNoteTarget(key, book);
    notes.push({ id: ids.note(target.type, target.id), target, label: str(n.label), text: str(n.text), ...stamp, updatedAt: Number(n.updatedAt) || now });
  });

  /* --- saved exam filters --- */
  const filterTemplates = arr(input.paperTemplates).filter((t) => isObj(t) && t.id).map((t) => ({
    id: ids.filterTemplate(t.id), syllabusId: sylId(t.syllabus_id), name: str(t.name),
    paperIds: arr(t.paperIds).map((pid) => ids.paper(pid)).filter((pid) => papers.some((p) => p.id === pid)), ...stamp
  }));

  /* --- flashcards --- */
  const flashcards = []; const flashcardState = [];
  arr(input.flashcards).forEach((c) => {
    if (!isObj(c) || !c.id || !str(c.front).trim()) { skipped.add("flashcard-bad", c?.id); return; }
    const id = ids.flashcard(c.id);
    const subjectName = str(c.subject) || "Unclassified";
    flashcards.push({
      id, syllabusId: sylId(c.syllabus_id), subjectId: book.subjectId(subjectName), topicId: book.topicId(subjectName, c.topic),
      front: str(c.front), back: str(c.back),
      sourceRef: isObj(c.source) ? { pdf: str(c.source.pdf), page: c.source.page ?? null, quote: str(c.source.quote) } : null,
      source: "ai", ...stamp
    });
    flashcardState.push({ id, cardId: id, status: str(c.status) || "new", reviews: Number(c.reviews) || 0, lastAt: c.lastAt ?? null, dueAt: null, ...stamp });
  });

  /* --- daily activity (streak) --- */
  const activity = Object.entries(isObj(input.dailyActivity) ? input.dailyActivity : {})
    .filter(([date, count]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(count) > 0)
    .map(([date, count]) => ({ id: date, date, count: Number(count) }));

  const settings = [{ id: "currentSyllabusId", value: syllabi[0].id }];
  if (input.statsResetAt) settings.push({ id: "statsResetAt", value: Number(input.statsResetAt) || 0 });

  const records = {
    syllabi, subjects, topics, papers, questions, flashcards,
    questionState, topicState, attempts, sets, topicLists, labels, notes,
    filterTemplates, flashcardState, activity, settings
  };

  /* --- report --- */
  const legacyNotes = questions.length ? notes.filter((n) => n.target.type === "question").length : 0;
  const report = {
    ok: true,
    source: {
      syllabuses: arr(input.syllabuses).length, papers: arr(input.papers).length,
      questions: arr(input.papers).reduce((n, p) => n + arr(p?.questions).length, 0),
      attempts: arr(input.attempts).length, banks: arr(input.banks).length,
      studied: studyEntries.length, labels: Object.keys(isObj(input.topicLabels) ? input.topicLabels : {}).length,
      topicLists: arr(input.topicLists).length, notes: Object.keys(isObj(input.listingNotes) ? input.listingNotes : {}).length,
      flashcards: arr(input.flashcards).length, filterTemplates: arr(input.paperTemplates).length,
      activityDays: Object.keys(isObj(input.dailyActivity) ? input.dailyActivity : {}).length
    },
    counts: Object.fromEntries(Object.entries(records).map(([k, v]) => [k, v.length])),
    detail: {
      pyqQuestions: questions.filter((q) => q.source === "pyq").length,
      aiQuestions: questions.filter((q) => q.source === "ai").length,
      deletedByPsc: questions.filter((q) => q.status === "deleted_by_psc").length,
      noAnswerYet: questions.filter((q) => q.answerIndex === null && q.status === "active").length,
      withExplanation: questions.filter((q) => q.explanation).length,
      malayalamQuestions: questions.filter((q) => q.lang !== "en").length,
      legacyQuestionNotes: legacyNotes,
      timingRemoved,
      newSubjects: subjects.filter((s) => !s.fromSeed).map((s) => s.name),
      newTopicsCount: topics.filter((t) => !t.fromSeed).length
    },
    checks: {
      attemptNetTotal: Math.round(attempts.reduce((n, a) => n + a.netScore, 0) * 100) / 100,
      questionsPerPaper: Object.fromEntries(papers.map((p) => [p.id, p.questionCount]))
    },
    mergedNames, possibleDuplicates,
    warnings: warnings.list(), skipped: skipped.list(),
    notCarried: ["aiKeys", "pdfs", "styleGuides", "appSettings", "emptyCustomTopics"]
  };

  return { ok: true, records, report };
}

/* ---------- mapping helpers ---------- */

function mapScope(a, book) {
  const type = str(a.type) || "paper";
  const key = str(a.scopeKey);
  const label = str(a.scopeLabel);
  const split = (k) => { const i = k.indexOf("|||"); return i < 0 ? [k, ""] : [k.slice(0, i), k.slice(i + 3)]; };
  if (type === "paper") return { type, ref: ids.paper(key), label };
  if (type === "subject") return { type, ref: book.subjectId(key), label };
  if (type === "topic") { const [s, t] = split(key); return { type, ref: book.topicId(s, t), label }; }
  if (type === "bank") return { type, ref: ids.bank(key), label };
  if (type === "ai") {
    const [s, t] = split(key.replace(/^ai:/, ""));
    return { type, ref: s && s !== "*" ? (t && t !== "*" ? book.topicId(s, t) : book.subjectId(s)) : null, label };
  }
  return { type, ref: key || null, label }; // mock, wrong-review, flagged, search
}

function mapNoteTarget(key, book) {
  const after = (prefix) => key.slice(prefix.length);
  if (key.startsWith("paper:")) return { type: "paper", id: ids.paper(after("paper:")) };
  if (key.startsWith("subject:")) return { type: "subject", id: book.subjectId(after("subject:")) };
  if (key.startsWith("topic:")) {
    const rest = after("topic:"); const i = rest.indexOf("|||");
    return i < 0 ? { type: "misc", id: key } : { type: "topic", id: book.topicId(rest.slice(0, i), rest.slice(i + 3)) };
  }
  if (key.startsWith("bank:")) return { type: "bank", id: ids.bank(after("bank:")) };
  if (key.startsWith("list:")) return { type: "list", id: ids.topicList(after("list:")) };
  if (key === "flagged") return { type: "set", id: "auto:flagged" };
  return { type: "misc", id: key };
}
