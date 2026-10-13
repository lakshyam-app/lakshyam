/* Finding things in your notes and study PDFs, on the phone, with no AI.
   Sources: [{ kind: "pdf" | "pdfnote" | "note", ref, name, pages: [{ n, t }] }] (a note is one "page").
   Text is cut into short passages; a passage scores by how many of the question's words it has
   (rare words count more), and much more when it also has the right answer.
   Words are matched inside longer words too, so Malayalam endings (…ത്തിൽ, …യുടെ) and English
   plurals still match. */
import { escapeHtml, raw } from "../core/dom.js";

const STOP = new Set(("which what when where who whom whose following correct incorrect statement statements given above below among these those their there about first known called during under from with that this into than were have been being also only both none other true false regarding related famous select choose identify answer option options code codes consider pair pairs match list").split(" "));
const ROMAN_OR_COMBO = /^\W*([ivx]+|\d+|[a-d])(\W+(and|&|,|or)\W*([ivx]+|\d+|[a-d]))*\W*(only)?\W*$/i;
const COMBINED = /(all of|both|none of|neither|above|below|എല്ലാം|ഇവയെല്ലാം|ഇവയൊന്നും|രണ്ടും)/i;

export const norm = (s) => String(s ?? "").toLowerCase().normalize("NFC");
const squash = (s) => norm(s).replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
const isMl = (w) => /[ഀ-ൿ]/.test(w);

/** Search words of a text: no short or common words; Malayalam words of 3+ letters. */
export function words(text) {
  return [...new Set(norm(text).split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => (isMl(w) ? w.length >= 3 : w.length >= 4 || /^\d{3,4}$/.test(w)) && !STOP.has(w)))];
}

/** Passages of about 200–700 characters: paragraphs, with short lines put together. */
export function passagesOf(sources) {
  const out = [];
  sources.forEach((src) => {
    (src.pages || []).forEach((pg) => {
      const lines = String(pg.t || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
      let cur = "";
      const flush = () => { if (cur.trim().length >= 12) out.push({ src, page: pg.n ?? null, text: cur.trim() }); cur = ""; };
      lines.forEach((l) => {
        if (cur.length + l.length > 700) flush();
        cur += (cur ? "\n" : "") + l;
        if (cur.length >= 200 && /[.?!:।]$/.test(l)) flush();
      });
      flush();
    });
  });
  out.forEach((p) => { p.sq = squash(p.text); });
  return out;
}

/** What to look for from a question: its words, and the right answer (when it is a real answer). */
export function queryOf(q) {
  const answer = Number.isInteger(q?.answerIndex) ? String(q.options?.[q.answerIndex] ?? "").trim() : "";
  const usable = answer && !COMBINED.test(answer) && !ROMAN_OR_COMBO.test(answer);
  const ansWords = usable ? words(answer) : [];
  const qWords = words(q?.text).filter((w) => !ansWords.includes(w));
  return { qWords, ansWords, answer: usable && squash(answer).length >= 3 ? squash(answer) : "" };
}

/** Best passages for a question (or for typed words: queryOf({ text })). → [{ src, page, text, score, hits, hasAnswer }] */
export function rank(passages, query, { limit = 8 } = {}) {
  const { qWords, ansWords, answer } = query;
  const N = passages.length || 1;
  const df = new Map();
  [...qWords, ...ansWords].forEach((w) => { const s = squash(w); df.set(w, passages.filter((p) => p.sq.includes(s)).length); });
  const idf = (w) => Math.log(1 + N / (1 + (df.get(w) || 0)));
  const res = [];
  passages.forEach((p) => {
    const hitsQ = qWords.filter((w) => p.sq.includes(squash(w)));
    const hitsA = ansWords.filter((w) => p.sq.includes(squash(w)));
    const hasAnswer = Boolean(answer && p.sq.includes(answer));
    if (!hitsQ.length && !hasAnswer) return;
    let score = hitsQ.reduce((s, w) => s + idf(w), 0) + hitsA.reduce((s, w) => s + 1.5 * idf(w), 0);
    if (hasAnswer) score += 3 + Math.max(0, ...ansWords.map(idf));
    const coverage = qWords.length ? hitsQ.length / qWords.length : 1;
    // A passage is shown only when it is clearly about the question (or has the answer with some of its words).
    const enough = qWords.length <= 2 ? hitsQ.length >= 1 : coverage >= 0.34 || (hasAnswer && hitsQ.length >= 1);
    if (!enough) return;
    res.push({ src: p.src, page: p.page, text: p.text, score: score * (0.5 + coverage), hits: [...hitsQ, ...hitsA], hasAnswer });
  });
  res.sort((a, b) => b.score - a.score);
  // One passage per page is enough.
  const seen = new Set(); const out = [];
  for (const r of res) { const k = `${r.src.kind}|${r.src.ref}|${r.page}`; if (seen.has(k)) continue; seen.add(k); out.push(r); if (out.length >= limit) break; }
  return out;
}

/** A short piece of the passage around its first match, with the matched words marked. */
export function snippet(text, hits, max = 260) {
  const s = String(text).replace(/\s*\n\s*/g, " ");
  const low = norm(s);
  let at = Math.min(...hits.map((w) => low.indexOf(norm(w))).filter((i) => i >= 0));
  if (!Number.isFinite(at)) at = 0;
  const from = Math.max(0, at - 80);
  let part = s.slice(from, from + max);
  if (from > 0) part = `…${part}`;
  if (from + max < s.length) part += "…";
  let out = escapeHtml(part);
  [...hits].sort((a, b) => b.length - a.length).forEach((w) => {
    const re = new RegExp(escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    out = out.replace(re, (m) => `\u0001${m}\u0002`);
  });
  return raw(out.replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>"));
}
