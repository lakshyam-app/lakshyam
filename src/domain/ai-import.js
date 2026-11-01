/* 1.27 · Questions, flashcards and notes you made with an AI elsewhere (Claude, ChatGPT, Gemini…), pasted in.
   Reads JSON (as the instructions ask) and the usual plain-text shapes, checks everything, and says what it couldn't use.
   Pure: no screen, no storage. Unit-tested (tests/ai-import.test.mjs). */

export const MAX_ITEMS = 300;
const MAX_TEXT = 4000;
const clean = (v, max = MAX_TEXT) => String(v ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const unmd = (s) => String(s).trim().replace(/^\*\*/, "").replace(/\*\*$/, "").trim();

/** The JSON in a reply: a whole array or object, even with words or ``` fences around it. null if none. */
export function findJson(text) {
  const s = String(text || "").replace(/```(?:json)?/gi, "");
  for (const [open, close] of [["[", "]"], ["{", "}"]]) {
    const a = s.indexOf(open); const b = s.lastIndexOf(close);
    if (a < 0 || b <= a) continue;
    const part = s.slice(a, b + 1);
    try { return JSON.parse(part); } catch {
      try { return JSON.parse(part.replace(/,(\s*[}\]])/g, "$1")); } catch { /* not this one */ }
    }
  }
  return null;
}
const listIn = (json, keys) => (Array.isArray(json) ? json : json && typeof json === "object" ? keys.map((k) => json[k]).find(Array.isArray) || null : null);

/* ---------- questions ---------- */

const LETTERS = "ABCDEF";
/** "B", "b)", "(b)", "2", "Option B", or the option's own text → 0-based index, or null. */
export function answerIndexOf(ans, options) {
  if (typeof ans === "number" && Number.isInteger(ans)) return ans >= 0 && ans < options.length ? ans : ans >= 1 && ans <= options.length ? ans - 1 : null;
  const s = String(ans ?? "").trim();
  if (!s) return null;
  const letter = /^(?:option\s*)?\(?([a-f])\)?[.):]?(?:\s|$)/i.exec(s);
  if (letter) { const i = LETTERS.indexOf(letter[1].toUpperCase()); if (i < options.length) return i; }
  const num = /^\(?([1-6])\)?[.):]?(?:\s|$)/.exec(s);
  if (num) { const i = Number(num[1]) - 1; if (i < options.length) return i; }
  const k = s.toLowerCase().replace(/[\s.]+$/, "");
  const at = options.findIndex((o) => o.toLowerCase() === k);
  return at >= 0 ? at : null;
}

function questionFrom(x) {
  if (!x || typeof x !== "object") return { problem: "not-a-question" };
  const text = clean(x.question ?? x.text ?? x.q ?? x.stem);
  let options = x.options ?? x.choices ?? x.answers;
  if (options && !Array.isArray(options) && typeof options === "object") options = Object.values(options); // {"A": "…", "B": "…"}
  options = (Array.isArray(options) ? options : []).map((o) => clean(typeof o === "object" && o ? o.text ?? o.option ?? "" : o, 600).replace(/^\(?[A-Fa-f]\)?[.):]\s+/, "")).filter(Boolean);
  if (!text) return { problem: "no-text" };
  if (options.length < 2 || options.length > 6) return { problem: "options", text };
  // An "…Index" field counts from 0 (as the old app's files do); a plain "answer": 2 counts from 1, as people write it.
  const idx = x.answerIndex ?? x.answer_index ?? x.correct_answer_index;
  const ans = x.answer ?? x.correct ?? x.correctAnswer ?? x.correct_answer;
  const answerIndex = Number.isInteger(idx) ? (idx >= 0 && idx < options.length ? idx : null)
    : Number.isInteger(ans) ? (ans >= 1 && ans <= options.length ? ans - 1 : null) : answerIndexOf(idx ?? ans, options);
  if (answerIndex === null) return { problem: "no-answer", text };
  const explanation = clean(x.explanation ?? x.why ?? x.reason ?? "");
  return { item: { text, options, answerIndex, explanation } };
}

/** Plain-text MCQs: "1. Question" then "A) …" lines (or "(a) … (b) …" on one line), "Answer: B", "Explanation: …". */
function questionsFromText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = []; let cur = null;
  const startQ = /^\s*(?:\*\*)?(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):]\s*(?:\*\*)?\s*(.+)$/i;
  for (const raw of lines) {
    const line = raw.replace(/^\s*[-*]\s+(?=[A-Fa-f][.)]\s)/, "").trim();
    if (!line) continue;
    const opt = /^\(?([A-Fa-f])\s*[.):]\s+(.+)$/.exec(line);
    const ans = /^(?:\*\*)?(?:correct\s+)?(?:answer|ans|key)\s*(?:\*\*)?\s*[:\-–]\s*(?:\*\*)?\s*(.+?)(?:\*\*)?$/i.exec(line);
    const exp = /^(?:\*\*)?(?:explanation|why|reason)\s*(?:\*\*)?\s*[:\-–]\s*(?:\*\*)?\s*(.*)$/i.exec(line);
    const q = startQ.exec(line);
    if (q && !(cur && !cur.options.length && !cur.answer)) { cur = { text: unmd(q[2]), options: [], answer: null, explanation: "" }; blocks.push(cur); continue; }
    if (!cur) continue;
    if (ans) { cur.answer = unmd(ans[1]); continue; }
    if (exp) { cur.explanation = unmd(exp[1]); cur.inExp = true; continue; }
    if (opt && !cur.answer && !cur.inExp) {
      // "(a) one (b) two (c) three (d) four" on one line
      const inline = [...line.matchAll(/\(?([A-Fa-f])\s*[.)]\s+(.+?)(?=\s+\(?[A-Fa-f]\s*[.)]\s+|$)/g)];
      if (inline.length > 1) inline.forEach((m) => cur.options.push(unmd(m[2]))); else cur.options.push(unmd(opt[2]));
      continue;
    }
    if (cur.inExp) cur.explanation += `\n${line}`;
    else if (!cur.options.length) cur.text += `\n${line}`;
  }
  return blocks.map((b) => ({ question: b.text, options: b.options, answer: b.answer, explanation: b.explanation }));
}

/** → { items: [{ text, options, answerIndex, explanation }], problems: { reason: count }, format: "json" | "text" } */
export function readQuestions(input) {
  const json = findJson(input);
  const list = listIn(json, ["questions", "items", "mcqs", "data"]) || (json && typeof json === "object" && (json.question || json.text) ? [json] : null);
  const raw = list || questionsFromText(input);
  const items = []; const problems = {};
  raw.slice(0, MAX_ITEMS).forEach((x) => { const r = questionFrom(x); if (r.item) items.push(r.item); else problems[r.problem] = (problems[r.problem] || 0) + 1; });
  if (raw.length > MAX_ITEMS) problems["too-many"] = raw.length - MAX_ITEMS;
  return { items, problems, format: list ? "json" : "text" };
}

/* ---------- flashcards ---------- */

function cardFrom(x) {
  if (Array.isArray(x) && x.length >= 2) return { front: clean(x[0], 1000), back: clean(x[1], 2000) };
  if (!x || typeof x !== "object") return null;
  return { front: clean(x.front ?? x.question ?? x.q ?? x.term ?? x.prompt, 1000), back: clean(x.back ?? x.answer ?? x.a ?? x.definition ?? x.fact, 2000) };
}

/** Plain-text cards: "Q: … / A: …" pairs, "front | back" lines or a 2-column Markdown table, or "front :: back". */
function cardsFromText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const out = []; let cur = null;
  for (const line of lines) {
    const q = /^(?:\d{1,3}[.)]\s*)?(?:\*\*)?(?:Q|Question|Front)\s*(?:\*\*)?\s*[:.\-–]\s*(?:\*\*)?\s*(.+)$/i.exec(line);
    const a = /^(?:\*\*)?(?:A|Answer|Back)\s*(?:\*\*)?\s*[:.\-–]\s*(?:\*\*)?\s*(.+)$/i.exec(line);
    if (q) { cur = { front: unmd(q[1]), back: "" }; out.push(cur); continue; }
    if (a && cur && !cur.back) { cur.back = unmd(a[1]); continue; }
    if (/^\|?\s*:?-{2,}/.test(line)) continue; // table rule
    const cells = /^\|(.+)\|$/.exec(line);
    if (cells) { const c = cells[1].split("|").map((x) => unmd(x.trim())); if (c.length >= 2) out.push({ front: c[0], back: c.slice(1).join(" · "), table: true }); continue; }
    const pair = /^(?:\d{1,3}[.)]\s*)?(.+?)\s+(?:::|\|)\s+(.+)$/.exec(line);
    if (pair) { out.push({ front: unmd(pair[1]), back: unmd(pair[2]) }); continue; }
    if (cur && cur.back) cur.back += `\n${line}`;
  }
  // A Markdown table's first row is its header ("Question | Answer").
  const firstTable = out.findIndex((c) => c.table);
  if (firstTable >= 0 && /^(q|question|front|term|card)/i.test(out[firstTable].front)) out.splice(firstTable, 1);
  return out;
}

/** → { items: [{ front, back }], problems, format } */
export function readCards(input) {
  const json = findJson(input);
  const list = listIn(json, ["cards", "flashcards", "items", "data"]);
  const raw = list || cardsFromText(input);
  const items = []; const problems = {};
  raw.slice(0, MAX_ITEMS).forEach((x) => {
    const c = cardFrom(x);
    if (c && c.front && c.back) items.push({ front: c.front, back: c.back }); else problems["no-back"] = (problems["no-back"] || 0) + 1;
  });
  if (raw.length > MAX_ITEMS) problems["too-many"] = raw.length - MAX_ITEMS;
  return { items, problems, format: list ? "json" : "text" };
}

/* ---------- a revision note ---------- */

/** → { text, problems } (the note as written, Markdown laid out when read). */
export function readNote(input) {
  const text = String(input ?? "").replace(/\r/g, "").replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1").trim();
  return { text: text.slice(0, 60000), problems: text.length > 60000 ? { "too-long": 1 } : {} };
}

/* ---------- the instructions to give your AI ---------- */

export function promptFor(kind, { subject = "", topic = "", lang = "en" } = {}) {
  const about = `${subject ? `${subject} › ` : ""}${topic}`;
  const ml = lang === "ml" ? " Write in Malayalam (keep names and terms as PSC papers write them)." : "";
  if (kind === "questions") return `Make Kerala PSC-style multiple-choice questions on "${about}" from the material I give you (or from your knowledge if I give none).${ml}
Each question has exactly 4 options and one correct answer; add a short explanation.
Reply with ONLY this JSON (no other words):
[{"question":"…","options":["…","…","…","…"],"answer":"B","explanation":"…"}]`;
  if (kind === "cards") return `Make flashcards for Kerala PSC revision on "${about}" from the material I give you (or from your knowledge if I give none).${ml}
One fact per card: a short question on the front, a short answer on the back.
Reply with ONLY this JSON (no other words):
[{"front":"…","back":"…"}]`;
  return `Write a Kerala PSC revision note on "${about}" from the material I give you (or from your knowledge if I give none).${ml}
Use Markdown: "## " for the title, "### " for each part, "- " bullets, **bold** for key words, and a table where it helps.`;
}
