/* Smart insights, worked out in code (no AI needed). The AI only explains the result.
   - weakSpots: where marks are lost, weighted by how often a topic appears in past papers
   - mistakeStats: what kind of questions you get wrong
   - checkFact: is the answer to a past-paper question you missed in your study PDF? */
import { spaceless, numbersIn } from "../pdf/pdf-tools.js";

const STOP = new Set("which what when where who whom whose following correct statement statements given above below among these those their there about first known called during under from with that this into than were have been being also only both none other true false regarding related famous".split(" "));
const LOOKS_COMBINED = /(all of|both|none of|neither|above|below|only\s*$|എല്ലാം|ഇവയെല്ലാം|ഇവയൊന്നും|രണ്ടും|മുകളിൽ)/i;
const ROMAN_COMBO = /^\W*[ivx\d]+(\W+(and|&|,)\W*[ivx\d]+)+\W*(only)?\W*$/i;

/** Significant words of a question (for finding the right page). */
export function keywords(text) {
  return [...new Set(String(text || "").toLowerCase().normalize("NFC").split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => (/[ഀ-ൿ]/.test(w) ? w.length >= 3 : w.length >= 5) && !STOP.has(w) && !/^\d+$/.test(w)))];
}

/**
 * Is this question's correct answer in the PDF pages? pages: [{ n, t }].
 * → { status: "found" | "maybe" | "missing" | "unknown", page }
 *   unknown: the answer is like "Both A and B" / "i and ii only", so text can't tell.
 */
export function checkFact(q, pages) {
  const answer = String(q.options?.[q.answerIndex] ?? "").trim();
  if (!answer || LOOKS_COMBINED.test(answer) || ROMAN_COMBO.test(answer)) return { status: "unknown", page: null };
  const kws = keywords(q.text);
  const prepared = pages.map((p) => ({ n: p.n, s: spaceless(p.t), nums: new Set(numbersIn(p.t)) }));
  const kwHits = (p) => kws.filter((w) => p.s.includes(spaceless(w))).length;
  const nums = numbersIn(answer);
  const words = spaceless(answer.replace(/\d+/g, " "));
  // Mostly a number or a year: the number must be on a page that also mentions the question's words.
  if (nums.length && words.length < 3) {
    const withNum = prepared.filter((p) => nums.every((x) => p.nums.has(x)));
    if (!withNum.length) return { status: "missing", page: null };
    const best = withNum.map((p) => ({ p, h: kwHits(p) })).sort((a, b) => b.h - a.h)[0];
    return best.h >= 1 ? { status: "found", page: best.p.n } : { status: "maybe", page: best.p.n };
  }
  const a = spaceless(answer);
  if (a.length < 3) return { status: "unknown", page: null };
  const hits = prepared.filter((p) => p.s.includes(a));
  if (hits.length) {
    const best = hits.map((p) => ({ p, h: kwHits(p) })).sort((x, y) => y.h - x.h)[0];
    return { status: best.h >= 1 || !kws.length ? "found" : "maybe", page: best.p.n };
  }
  // Multi-word answers written differently: most of its words on one page.
  const parts = keywords(answer).length ? keywords(answer) : String(answer).toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  if (parts.length >= 2) {
    const best = prepared.map((p) => ({ p, h: parts.filter((w) => p.s.includes(spaceless(w))).length })).sort((x, y) => y.h - x.h)[0];
    if (best && best.h / parts.length >= 0.67) return { status: "maybe", page: best.p.n };
  }
  return { status: "missing", page: null };
}

/**
 * Topics ranked by marks at stake.
 * byTopic: Map topicId → { freq, n, correct, adj (shrunk accuracy or null), avgSec, guessNet }
 * → [{ topicId, score, reasons: [ "often" | "weak" | "untried" | "slow" | "guess" | "nonotes" ], … }]
 */
export function rankWeakSpots(byTopic, { hasNotes = () => true, slowSec = 50, limit = 10 } = {}) {
  const maxFreq = Math.max(1, ...[...byTopic.values()].map((x) => x.freq));
  return [...byTopic.entries()].map(([topicId, x]) => {
    const share = x.freq / maxFreq;
    const miss = x.adj === null ? 0.6 : 1 - x.adj; // never practised: treated as a likely loss
    let score = share * miss;
    if (x.avgSec && x.avgSec > slowSec) score *= 1.15;
    if (x.guessNet < 0) score *= 1.1;
    const reasons = [];
    if (share >= 0.5) reasons.push("often");
    if (x.adj === null) reasons.push("untried"); else if (x.adj < 0.6) reasons.push("weak");
    if (x.avgSec && x.avgSec > slowSec) reasons.push("slow");
    if (x.guessNet < 0) reasons.push("guess");
    if (!hasNotes(topicId)) reasons.push("nonotes");
    return { topicId, score, ...x, reasons };
  }).filter((r) => r.score > 0 && (r.adj === null || r.adj < 0.85)).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** What kind of questions you miss. wrong: [{ q, r }] (r = the answer record). */
export function mistakeStats(wrong) {
  const s = { total: wrong.length, statement: 0, numbers: 0, guessed: 0, quick: 0, blank: 0, notQ: 0 };
  wrong.forEach(({ q, r }) => {
    const text = String(q.text || "");
    const ans = String(q.options?.[q.answerIndex] ?? "");
    if (/statement|correct\s*\?|incorrect|true|ശരി|തെറ്റ്|പ്രസ്താവന/i.test(text)) s.statement++;
    if (/\b(NOT|not)\b|അല്ലാത്ത/.test(text)) s.notQ++;
    if (numbersIn(ans).length && spaceless(ans.replace(/\d+/g, "")).length < 4) s.numbers++;
    if (r.guessed) s.guessed++;
    if (r.selected === null) s.blank++;
    else if (r.timeMs && r.timeMs < 10000) s.quick++;
  });
  return s;
}
