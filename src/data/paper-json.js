/* Question-paper JSON: reading, auto-fixing, checking and turning it into records.
   The file format is exactly the one PSC Exam Vault used, so existing files work:
     { "paper": { "id", "name", "post_name"? },
       "questions": [{ "id", "question_text", "options", "correct_answer_index",
                       "subject", "topic", "explanation"?, "original_number"?, "difficulty"? }] }
   Pure functions: nothing here touches the database. */
import { ids, nameKey } from "./ids.js";

const DELETED_SENTINEL = 5;
const MALAYALAM = /[ഀ-ൿ]/g;

/* ---------- reading + auto-fix ---------- */

/** Parses JSON text. On failure returns the position so the user can see where it broke. */
export function parseJsonText(raw) {
  try {
    return { ok: true, json: JSON.parse(raw) };
  } catch (error) {
    const msg = String(error.message || error);
    const pos = Number((msg.match(/position (\d+)/i) || [])[1]);
    let near = "";
    if (Number.isFinite(pos)) {
      const before = raw.slice(Math.max(0, pos - 40), pos).replace(/\n/g, "⏎");
      const after = raw.slice(pos, pos + 40).replace(/\n/g, "⏎");
      near = `…${before} ▶ ${after}…`;
    }
    return { ok: false, error: msg, near };
  }
}

/** Repairs the usual problems in AI-made JSON. Returns { fixed, notes: [codes] }.
    Unlike the old app, dashes (–) and apostrophes (’) inside the text are left alone:
    replacing them changed names like "Important Acts – General". */
export function autoFix(raw) {
  let fixed = String(raw).trim();
  const notes = [];
  const fence = fixed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) { fixed = fence[1]; notes.push("fences"); }
  if (fixed.charCodeAt(0) === 0xfeff) { fixed = fixed.slice(1); notes.push("bom"); }
  if (/[“”]/.test(fixed) && !parseJsonText(fixed).ok) {
    fixed = fixed.replace(/[“”]/g, '"');
    notes.push("smartQuotes");
  }
  const noTrailing = fixed.replace(/,(\s*[}\]])/g, "$1");
  if (noTrailing !== fixed) { fixed = noTrailing; notes.push("trailingCommas"); }
  const escaped = fixed.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
  if (escaped !== fixed) { fixed = escaped; notes.push("backslashes"); }
  return { fixed, notes };
}

/* ---------- checking ---------- */

/** Returns a list of { code, n? } problems; empty list means the file is usable. */
export function validatePaper(json) {
  const errors = [];
  if (!json || typeof json !== "object") return [{ code: "notObject" }];
  if (!json.paper || typeof json.paper !== "object") errors.push({ code: "noPaper" });
  else {
    if (!json.paper.id) errors.push({ code: "noPaperId" });
    if (!json.paper.name) errors.push({ code: "noPaperName" });
  }
  if (!Array.isArray(json.questions)) errors.push({ code: "noQuestions" });
  else {
    const seen = new Set();
    json.questions.forEach((q, i) => {
      const n = i + 1;
      if (!q || typeof q !== "object") { errors.push({ code: "qNotObject", n }); return; }
      if (!q.id) errors.push({ code: "qNoId", n });
      else if (seen.has(String(q.id))) errors.push({ code: "qDuplicateId", n });
      seen.add(String(q.id));
      if (!String(q.question_text || "").trim()) errors.push({ code: "qNoText", n });
      if (!Array.isArray(q.options) || q.options.length < 2) errors.push({ code: "qNoOptions", n });
      if (!String(q.subject || "").trim()) errors.push({ code: "qNoSubject", n });
    });
  }
  return errors;
}

/* ---------- building records ---------- */

function detectLang(text) {
  const letters = text.replace(/\s/g, "").length || 1;
  const ml = (text.match(MALAYALAM) || []).length / letters;
  return ml > 0.3 ? "ml" : ml > 0 ? "mixed" : "en";
}

function printedNumber(q) {
  if (q.original_number !== undefined && q.original_number !== null && q.original_number !== "") return String(q.original_number);
  const m = String(q.id ?? "").match(/(\d+)/);
  return m ? m[1] : null;
}

function answerFrom(q, optionCount) {
  const ci = q.correct_answer_index;
  if (ci === null || ci === undefined || ci === "") return { answerIndex: null, status: "active" };
  const n = Number(ci);
  if (n === DELETED_SENTINEL && optionCount < 6) return { answerIndex: null, status: "deleted_by_psc" };
  if (Number.isInteger(n) && n >= 0 && n < optionCount) return { answerIndex: n, status: "active" };
  return { answerIndex: null, status: "active", bad: true };
}

export const normText = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9ഀ-ൿ]+/g, " ").trim();

/**
 * Turns a checked paper JSON into records, merging with an existing paper of the same ID.
 * ctx = { syllabusId, existingPaper, existingQuestions: Map(oldQid → record),
 *         resolveTopic(subjectName, topicName) → { subjectId, topicId },
 *         otherTexts: Map(normText → paperName), now }
 * Merge rules (so nothing you fixed in the app is lost):
 *  - text and options from the file win (they may be corrections);
 *  - an empty answer or explanation in the file never wipes one you have;
 *  - a question whose topic you changed in the app keeps your topic;
 *  - questions missing from the file are kept, not deleted.
 */
export function buildPaperRecords(json, ctx) {
  const oldPaperId = String(json.paper.id);
  const paperId = ids.paper(oldPaperId);
  const existing = ctx.existingPaper;
  const now = ctx.now ?? Date.now();
  const report = { added: 0, updated: 0, unchanged: 0, keptAnswers: 0, keptExplanations: 0, keptTopics: 0, notInFile: 0, badAnswers: 0, duplicates: [] };

  const questions = [];
  const seenOld = new Set();
  json.questions.forEach((q, order) => {
    const qid = String(q.id);
    seenOld.add(qid);
    const options = q.options.map((o) => String(o ?? ""));
    const text = String(q.question_text);
    const ans = answerFrom(q, options.length);
    if (ans.bad) report.badAnswers++;
    const { subjectId, topicId } = ctx.resolveTopic(String(q.subject).trim(), String(q.topic || "").trim());
    const prev = ctx.existingQuestions.get(qid);

    const record = {
      id: ids.question(oldPaperId, qid), paperId, oldId: qid, order, number: printedNumber(q),
      text, options, answerIndex: ans.answerIndex, status: ans.status,
      explanation: String(q.explanation || "").trim(),
      subjectId, topicId, lang: detectLang(text + " " + options.join(" ")),
      difficultyHint: ["E", "M", "D"].includes(q.difficulty) ? q.difficulty : null,
      source: prev?.source || "pyq", sourceRef: prev?.sourceRef || null,
      createdAt: prev?.createdAt ?? now, updatedAt: now, ownerId: "local"
    };

    if (prev) {
      if (record.answerIndex === null && record.status === "active" && (prev.answerIndex !== null || prev.status !== "active")) {
        record.answerIndex = prev.answerIndex; record.status = prev.status; report.keptAnswers++;
      }
      if (!record.explanation && prev.explanation) { record.explanation = prev.explanation; report.keptExplanations++; }
      if (prev.topicMovedByUser && (prev.topicId !== record.topicId)) {
        record.subjectId = prev.subjectId; record.topicId = prev.topicId; record.topicMovedByUser = true; report.keptTopics++;
      }
      const same = ["text", "answerIndex", "status", "explanation", "topicId"].every((k) => prev[k] === record[k])
        && JSON.stringify(prev.options) === JSON.stringify(record.options);
      if (same) report.unchanged++; else report.updated++;
    } else {
      report.added++;
      const other = ctx.otherTexts?.get(normText(text));
      if (other && normText(text).length >= 10) report.duplicates.push({ text: text.slice(0, 80), paper: other });
    }
    questions.push(record);
  });
  ctx.existingQuestions.forEach((_, qid) => { if (!seenOld.has(qid)) report.notInFile++; });

  const paper = {
    ...(existing || {}),
    id: paperId, oldId: oldPaperId, kind: existing?.kind || "pyq",
    syllabusId: existing?.syllabusId ?? ctx.syllabusId,
    name: String(json.paper.name),
    postName: String(json.paper.post_name || "").trim() || existing?.postName || "",
    source: existing?.source || "personal",
    questionCount: questions.length + report.notInFile,
    createdAt: existing?.createdAt ?? now, updatedAt: now, ownerId: "local"
  };
  return { paper, questions, report, isUpdate: Boolean(existing) };
}

/* ---------- answer keys and explanations ---------- */

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Answer key: { paper_id?, answers: [{ question_number, correct_option: "A"–"F" | "X" | "DELETED" | "DEL" }] } */
export function applyAnswerKey(json, paperQuestions) {
  if (!json || !Array.isArray(json.answers)) return { ok: false, error: "noAnswers" };
  const byNumber = new Map(paperQuestions.filter((q) => q.number !== null).map((q) => [String(q.number), q]));
  const updates = []; const unmatched = []; const unrecognized = [];
  json.answers.forEach((a) => {
    const num = String(a?.question_number ?? "").trim();
    const q = byNumber.get(num);
    if (!q) { unmatched.push(num); return; }
    const raw = String(a.correct_option || "").trim().toUpperCase();
    if (["X", "DELETED", "DEL"].includes(raw)) { updates.push({ ...q, answerIndex: null, status: "deleted_by_psc" }); return; }
    const i = LETTERS.indexOf(raw);
    if (i < 0 || i >= q.options.length) { unrecognized.push(`${num}:${a.correct_option}`); return; }
    updates.push({ ...q, answerIndex: i, status: "active" });
  });
  return { ok: true, updates, unmatched, unrecognized, total: json.answers.length, paperIdInFile: json.paper_id ?? null };
}

/** Explanations: { explanations: [{ question_number, explanation }] } */
export function applyExplanations(json, paperQuestions) {
  if (!json || !Array.isArray(json.explanations)) return { ok: false, error: "noExplanations" };
  const byNumber = new Map(paperQuestions.filter((q) => q.number !== null).map((q) => [String(q.number), q]));
  const updates = []; const unmatched = [];
  json.explanations.forEach((e) => {
    const num = String(e?.question_number ?? "").trim();
    const q = byNumber.get(num);
    if (!q) { unmatched.push(num); return; }
    updates.push({ ...q, explanation: String(e.explanation || "").trim() });
  });
  return { ok: true, updates, unmatched, unrecognized: [], total: json.explanations.length };
}

export { nameKey };
