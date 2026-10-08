/* What a topic's past-paper questions look like, worked out in code before the AI sees them:
   years and posts, question styles, repeated answers and repeated questions. The AI then
   explains the pattern and writes a strategy; it never has to count. Pure functions. */

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFC")
  .replace(/\$[^$]*\$/g, " ").replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").replace(/\s+/g, " ").trim();
const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));

export const yearOf = (paper) => {
  const m = /(?:^|\D)((?:19|20)\d{2})(?!\d)/.exec(String(paper?.name || ""));
  return m ? Number(m[1]) : null;
};

export const answerText = (q) => (Number.isInteger(q.answerIndex) && q.options?.[q.answerIndex] !== undefined ? String(q.options[q.answerIndex]) : null);

/** Question styles, by the wording (English and Malayalam). */
export const STYLES = {
  statement: /statement|correct\s*\?|incorrect|true|false|പ്രസ്താവന|ശരിയായ|തെറ്റായ/i,
  notQ: /\b(not|except)\b|അല്ലാത്ത|ഒഴികെ/i,
  match: /\bmatch\b|ചേരുംപടി|യോജിപ്പിക്കുക/i,
  order: /chronolog|correct order|arrange|sequence|ക്രമത്തിൽ|ക്രമം/i,
  who: /^\s*(who|whom|whose)\b|ആര്/i,
  when: /^\s*(when|in which year)\b|\byear\b|ഏത് വർഷം|എപ്പോൾ/i,
  where: /^\s*where\b|\bwhich (place|state|district|city|river)\b|എവിടെ|ഏത് ജില്ല|ഏത് സംസ്ഥാന/i
};

export function styleCounts(questions) {
  const c = Object.fromEntries(Object.keys(STYLES).map((k) => [k, 0]));
  c.number = 0;
  questions.forEach((q) => {
    const text = String(q.text || "");
    Object.entries(STYLES).forEach(([k, re]) => { if (re.test(text)) c[k]++; });
    const a = answerText(q);
    if (a && /\d/.test(a) && norm(a.replace(/\d+/g, "")).length < 4) c.number++;
  });
  return c;
}

/* Answers that are about the options, not a fact ("All of the above", "(i) and (iii) only", "Both A and B"). */
const COMBO = /\b(above|these|either|neither|both|options?|statements?)\b|^(none|all|only)$| only$|^[ivx]{1,4}( and)? [ivx]{1,4}\b|^[a-d]( [a-d])* and [a-d]$|ഇവയെല്ലാം|ഇവയൊന്നും|മുകളിൽ|രണ്ടും|എല്ലാം/;

/** Answers that come up again and again (the same fact asked more than once, often in different words). */
export function repeatedAnswers(questions, { min = 2, limit = 20 } = {}) {
  const by = new Map();
  questions.forEach((q) => {
    const a = answerText(q);
    if (!a) return;
    const n0 = norm(a);
    if (n0.length < 2 || COMBO.test(n0) || /^\d{1,2}( \d{1,2})+$/.test(n0) || /^\d{1,2}( \d{1,2})* and \d{1,2}$/.test(n0)) return;
    const k = n0.replace(/ /g, ""); // "E.M.S" and "EMS" are the same answer
    if (!by.has(k)) by.set(k, { answer: a.trim(), n: 0, ids: [] });
    const x = by.get(k); x.n++; x.ids.push(q.id);
  });
  return [...by.values()].filter((x) => x.n >= min).sort((a, b) => b.n - a.n || a.answer.localeCompare(b.answer)).slice(0, limit);
}

/** Groups of nearly the same question (asked again in another paper). */
export function repeatedQuestions(questions, { threshold = 0.7, limit = 15 } = {}) {
  const sets = questions.map((q) => ({ q, w: words(q.text), a: norm(answerText(q)) }));
  const used = new Set(); const groups = [];
  for (let i = 0; i < sets.length; i++) {
    if (used.has(i) || sets[i].w.size < 3) continue;
    const g = [sets[i].q];
    for (let j = i + 1; j < sets.length; j++) {
      if (used.has(j) || sets[j].w.size < 3) continue;
      let inter = 0; sets[i].w.forEach((x) => { if (sets[j].w.has(x)) inter++; });
      const jac = inter / (sets[i].w.size + sets[j].w.size - inter);
      if (jac >= threshold || (jac >= 0.5 && sets[i].a && sets[i].a === sets[j].a)) { g.push(sets[j].q); used.add(j); }
    }
    if (g.length > 1) { used.add(i); groups.push(g); }
  }
  return groups.sort((a, b) => b.length - a.length).slice(0, limit);
}

/** The figures for one topic. paperOf(id) → paper. */
export function topicFacts(questions, paperOf) {
  const papers = new Map(); const years = new Map(); const posts = new Map();
  questions.forEach((q) => {
    const p = paperOf(q.paperId);
    papers.set(q.paperId, (papers.get(q.paperId) || 0) + 1);
    const y = yearOf(p); if (y) years.set(y, (years.get(y) || 0) + 1);
    const post = String(p?.postName || "").trim(); if (post) posts.set(post, (posts.get(post) || 0) + 1);
  });
  const perPaper = [...papers.values()];
  return {
    total: questions.length,
    papers: papers.size,
    perPaper: perPaper.length ? Math.round((questions.length / perPaper.length) * 10) / 10 : 0,
    maxPerPaper: perPaper.length ? Math.max(...perPaper) : 0,
    years: [...years.entries()].sort((a, b) => a[0] - b[0]),
    posts: [...posts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    styles: styleCounts(questions),
    answers: repeatedAnswers(questions),
    repeats: repeatedQuestions(questions),
    deleted: questions.filter((q) => q.status === "deleted_by_psc").length,
    noKey: questions.filter((q) => q.status !== "deleted_by_psc" && !Number.isInteger(q.answerIndex)).length
  };
}

/**
 * The questions as short lines for the AI, newest papers first, within a size budget (characters).
 * Returns { lines, shown, total }.
 */
export function questionLines(questions, paperOf, { budget = 40000 } = {}) {
  const sorted = questions.slice().sort((a, b) => (yearOf(paperOf(b.paperId)) || 0) - (yearOf(paperOf(a.paperId)) || 0));
  const one = (q, max) => {
    const p = paperOf(q.paperId);
    const tag = [yearOf(p), p?.postName].filter(Boolean).join(" · ");
    const text = String(q.text || "").replace(/\s+/g, " ").trim();
    const ans = q.status === "deleted_by_psc" ? "(deleted by PSC)" : answerText(q)?.replace(/\s+/g, " ").trim() || "(no answer key)";
    return `${tag ? `[${tag}] ` : ""}${text.length > max ? `${text.slice(0, max)}…` : text} → ${ans.slice(0, 120)}`;
  };
  for (const max of [280, 180, 120]) {
    const lines = sorted.map((q) => one(q, max));
    if (lines.reduce((s, l) => s + l.length + 6, 0) <= budget) return { lines: lines.map((l, i) => `${i + 1}. ${l}`), shown: lines.length, total: questions.length };
  }
  const lines = []; let size = 0;
  for (const q of sorted) {
    const l = one(q, 120);
    if (size + l.length + 6 > budget) break;
    lines.push(l); size += l.length + 6;
  }
  return { lines: lines.map((l, i) => `${i + 1}. ${l}`), shown: lines.length, total: questions.length };
}

/**
 * The parts of a strategy that describe the PATTERN (what is asked, how, repeated facts, likely
 * next), for a question maker; the study plan and checklist are left out. Within `max` characters.
 */
export function patternFrom(text, max = 3500) {
  const s = String(text || "").trim();
  if (!s) return "";
  const parts = s.split(/\n(?=\s*(?:#{1,4}\s*)?\d+[.)]\s)/);
  const keep = parts.filter((p) => { const n = Number((/^\s*(?:#{1,4}\s*)?(\d+)[.)]/.exec(p) || [])[1]); return !n || n <= 4; });
  const out = (keep.length ? keep : parts).join("\n").trim();
  return out.length > max ? `${out.slice(0, max)}…` : out;
}
