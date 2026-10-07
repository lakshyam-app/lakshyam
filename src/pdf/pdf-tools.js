/* Pure helpers for Study PDFs (no browser APIs, so they are unit-tested).
   - page text clean-up and classification (text / scan / garbled)
   - splitting pages into sections ("chunks") and sharing questions among them
   - checking in code that an AI's source quote really is in the PDF text
   - option shuffling, clean-up and de-duplication of AI output
   - "numbers must appear in the PDF" check for cards and notes */

/** Page sources: text = read from the PDF, ai = read by AI from the page picture,
    edited = typed/corrected by you, scan = no text layer, garbled = unreadable
    old-font text, blank = nothing on the page. */
export const PAGE_SOURCES = ["text", "ai", "edited", "scan", "garbled", "blank"];

const INVISIBLE = /[\u0000​﻿­]/g; // ZWNJ/ZWJ (U+200C/D) are kept: they matter in Malayalam
const BAD_CHARS = /[\u0080-\u009f¡-ÿ-�]/g; // typical of old (non-Unicode) Malayalam fonts

export function cleanText(s) {
  return String(s ?? "").replace(INVISIBLE, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Decides what a page's extracted text is good for. */
export function classifyPage(raw) {
  const t = cleanText(raw);
  const chars = t.replace(/\s/g, "");
  if (chars.length < 30) return { t: "", src: "scan" };
  const bad = (chars.match(BAD_CHARS) || []).length;
  if (bad / chars.length > 0.06) return { t, src: "garbled" };
  return { t, src: "text" };
}

export const isUsable = (p) => !!p && ["text", "ai", "edited"].includes(p.src) && String(p.t || "").replace(/\s/g, "").length >= 30;
export const needsAi = (p) => !!p && (p.src === "scan" || p.src === "garbled");

/** Counts pages by kind: { readable, text, ai, edited, need, blank }. */
export function pageCounts(pages) {
  const c = { readable: 0, text: 0, ai: 0, edited: 0, need: 0, blank: 0 };
  (pages || []).forEach((p) => {
    if (!p) return;
    if (needsAi(p)) c.need++;
    else if (p.src === "blank") c.blank++;
    else if (c[p.src] !== undefined) c[p.src]++;
    if (isUsable(p)) c.readable++;
  });
  return c;
}

/** Page numbers (1-based) that match a test. */
export const pageNumbers = (pages, test) => (pages || []).map((p, i) => (test(p) ? i + 1 : 0)).filter(Boolean);

/* ---------- sections ---------- */

export function mlRatio(s) {
  const m = String(s).match(/[ഀ-ൿ]/g);
  return m ? m.length / Math.max(1, String(s).replace(/\s/g, "").length) : 0;
}

export function splitLong(text, limit) {
  const out = []; let cur = "";
  for (const para of String(text).split(/\n/)) {
    if (cur && cur.length + para.length + 1 > limit) { out.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + para;
    while (cur.length > limit * 1.3) { out.push(cur.slice(0, limit)); cur = cur.slice(limit); }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Groups readable pages from..to into sections the AI can handle in one go.
    Malayalam text uses more tokens per character, so its sections are smaller. */
export function buildChunks(pages, from = 1, to = pages.length) {
  const chunks = []; let cur = null;
  const flush = () => { if (cur?.len) chunks.push(cur); cur = null; };
  for (let n = Math.max(1, from); n <= Math.min(pages.length, to); n++) {
    const p = pages[n - 1];
    if (!isUsable(p)) continue;
    const limit = mlRatio(p.t) > 0.3 ? 1800 : 3500;
    if (p.t.length > limit * 1.6) {
      flush();
      splitLong(p.t, limit).forEach((piece) => chunks.push({ pages: [n], parts: [{ n, t: piece }], len: piece.length }));
      continue;
    }
    if (cur && cur.len + p.t.length > limit) flush();
    if (!cur) cur = { pages: [], parts: [], len: 0 };
    cur.pages.push(n); cur.parts.push({ n, t: p.t }); cur.len += p.t.length;
  }
  flush();
  return chunks;
}

/** Shares N items among sections by size (at most 6 per section);
    with more sections than N, picks N evenly spread sections. */
export function planChunks(chunks, N) {
  if (!chunks.length || N < 1) return [];
  if (chunks.length > N) {
    const picks = []; const seen = new Set();
    for (let k = 0; k < N; k++) {
      const c = chunks[Math.min(chunks.length - 1, Math.floor(((k + 0.5) * chunks.length) / N))];
      if (!seen.has(c)) { seen.add(c); picks.push({ chunk: c, n: 1 }); }
    }
    return picks;
  }
  const total = chunks.reduce((a, c) => a + c.len, 0) || 1;
  const alloc = chunks.map((c) => Math.max(1, Math.round((N * c.len) / total)));
  let sum = alloc.reduce((a, b) => a + b, 0);
  while (sum > N) { const i = alloc.indexOf(Math.max(...alloc)); if (alloc[i] <= 1) break; alloc[i]--; sum--; }
  let guard = 200;
  while (sum < N && guard-- > 0) {
    let best = -1; let bestV = -1;
    chunks.forEach((c, i) => { if (alloc[i] < 6) { const v = c.len / alloc[i]; if (v > bestV) { bestV = v; best = i; } } });
    if (best < 0) break;
    alloc[best]++; sum++;
  }
  return chunks.map((c, i) => ({ chunk: c, n: alloc[i] }));
}

export const chunkText = (c) => c.parts.map((p) => `[Page ${p.n}]\n${p.t}`).join("\n\n");
export const chunkSource = (c) => c.parts.map((p) => p.t).join("\n");
export const pageRange = (pages) => (pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : String(pages[0]));

/* ---------- quote check (done in code, not by AI) ---------- */

export function normText(s) {
  return String(s ?? "").normalize("NFC").toLowerCase().replace(INVISIBLE, "").replace(/[^\p{L}\p{N}\p{M}‌‍]+/gu, " ").trim();
}
export const spaceless = (s) => normText(s).replace(/ /g, "");
function grams(s, k) { const set = new Set(); for (let i = 0; i + k <= s.length; i++) set.add(s.substr(i, k)); return set; }

/** Is the quote in the section's text? → { level: "exact" | "close" | "none", page }.
    "close" = at least 90% of its 5-letter pieces are found (small OCR/spacing differences). */
export function checkQuote(quote, chunk) {
  const q = spaceless(quote);
  if (q.length < 12) return { level: "none", page: null };
  const parts = chunk.parts.map((p) => ({ n: p.n, s: spaceless(p.t) }));
  for (const p of parts) if (p.s.includes(q)) return { level: "exact", page: p.n };
  const all = parts.map((p) => p.s).join("");
  if (all.includes(q)) {
    const head = q.slice(0, Math.min(24, q.length));
    const hit = parts.find((p) => p.s.includes(head));
    return { level: "exact", page: (hit || parts[0]).n };
  }
  const k = 5;
  const qg = grams(q, k);
  if (!qg.size) return { level: "none", page: null };
  const allG = grams(all, k);
  let hits = 0; qg.forEach((g) => { if (allG.has(g)) hits++; });
  let bestPage = null; let bestFrac = 0;
  parts.forEach((p) => {
    const pg = grams(p.s, k); let h = 0;
    qg.forEach((g) => { if (pg.has(g)) h++; });
    if (h / qg.size > bestFrac) { bestFrac = h / qg.size; bestPage = p.n; }
  });
  return hits / qg.size >= 0.9 ? { level: "close", page: bestPage } : { level: "none", page: null };
}

/* ---------- AI output clean-up ---------- */

/** Numbers / years stay in order, and so do "all of the above" or "i and ii" style options. */
export function shouldKeepOrder(opts) {
  if (opts.every((o) => /^\s*[\d.,\-\s]+\s*$/.test(String(o)))) return true;
  return opts.some((o) => {
    const s = String(o);
    return /(above|both|all of|none of|neither|only\s*$|എല്ലാം|മുകളിൽ|ഇവയെല്ലാം|ഇവയൊന്നും|രണ്ടും)/i.test(s)
      || /^\W*[\dA-Da-dIVXivx]+\W+(and|&)\W+[\dA-Da-dIVXivx]+/.test(s);
  });
}

/** Models put the right answer at A or B too often, so options are shuffled. */
export function shuffleOptions(item, rand = Math.random) {
  if (shouldKeepOrder(item.options)) return item;
  const idx = item.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { ...item, options: idx.map((i) => item.options[i]), answerIndex: idx.indexOf(item.answerIndex) };
}

/** One generated question → clean item, or null if it is unusable. */
export function sanitizeItem(x) {
  if (!x || typeof x !== "object") return null;
  const text = String(x.question_text ?? x.text ?? "").trim();
  if (!text || !Array.isArray(x.options) || x.options.length < 3 || x.options.length > 6) return null;
  const answerIndex = Number(x.correct_answer_index ?? x.answerIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= x.options.length) return null;
  const options = x.options.map((o) => String(o ?? "").trim());
  if (options.some((o) => !o) || new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
  return {
    text, options, answerIndex,
    quote: String(x.source_quote ?? "").trim(),
    page: Number(x.page) || null,
    type: String(x.question_type ?? "").slice(0, 40),
    explanation: String(x.explanation ?? "").trim(),
    difficulty: ["E", "M", "D"].includes(x.difficulty) ? x.difficulty : null
  };
}

/** Drops items whose key text repeats (case, spaces and punctuation ignored). */
export function dropDuplicates(items, keyOf, seen = new Set()) {
  return items.filter((it) => { const k = spaceless(keyOf(it)); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

/** Verifies one section's generated questions: shape, source quote, shuffle, duplicates. */
export function verifyQuestions(arr, chunk, { rand = Math.random, seen = new Set() } = {}) {
  const stats = { raw: arr.length, badShape: 0, badQuote: 0 };
  const kept = [];
  arr.forEach((x) => {
    const it = sanitizeItem(x);
    if (!it) { stats.badShape++; return; }
    const qc = checkQuote(it.quote, chunk);
    if (qc.level === "none") { stats.badQuote++; return; }
    it.quoteLevel = qc.level;
    it.page = qc.page || it.page || chunk.pages[0];
    it.chunkPages = chunk.pages.slice();
    kept.push(shuffleOptions(it, rand));
  });
  return { items: dropDuplicates(kept, (it) => it.text, seen), stats };
}

/** Reads the second-pass answers ([{n, answer}]) into each item's .check. */
export function applyAnswerCheck(items, reply) {
  const list = Array.isArray(reply) ? reply : reply?.answers || [];
  const map = {};
  list.forEach((a) => { if (a && Number.isInteger(Number(a.n))) map[Number(a.n)] = Number(a.answer); });
  items.forEach((it, i) => {
    const a = map[i + 1];
    if (a === undefined || Number.isNaN(a)) it.check = "none";
    else if (a === it.answerIndex + 1) it.check = "agree";
    else if (a === 0) it.check = "unclear";
    else { it.check = "disagree"; it.checkAnswer = a - 1; }
  });
  return items;
}

/** Best items first (re-check agreed, exact quote), keeping their original order. */
export function trimToBest(items, N) {
  if (items.length <= N) return items.slice();
  const score = (it) => ({ agree: 3, none: 2, unclear: 1, disagree: 0 }[it.check ?? "none"]) + (it.quoteLevel === "exact" ? 0.5 : 0);
  return items.map((it, i) => ({ it, i, s: score(it) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, N).sort((a, b) => a.i - b.i).map((x) => x.it);
}

/** Ticked for saving by default only when every check passed. */
export const passedAll = (it) => it.quoteLevel === "exact" && it.check !== "disagree" && it.check !== "unclear" && !it.flag;

/* ---------- cards and notes ---------- */

export function numbersIn(s) {
  // Malayalam digits are turned into 0-9 so "൧൯൪൭" and "1947" match.
  const ascii = String(s ?? "").replace(/[൦-൯]/g, (d) => String(d.charCodeAt(0) - 0x0D66));
  return (ascii.match(/\d+/g) || []).map((x) => x.replace(/^0+(?=\d)/, ""));
}
/** True if every number in text also appears in the source. */
export function numbersSupported(text, source) {
  const have = new Set(numbersIn(source));
  return numbersIn(text).every((n) => have.has(n));
}

/** Verifies one section's flashcards. Cards with a number not in the PDF are kept but flagged. */
export function verifyCards(arr, chunk) {
  const src = chunkSource(chunk);
  const stats = { raw: arr.length, badShape: 0, badQuote: 0, flagged: 0 };
  const items = [];
  arr.forEach((x) => {
    const front = String(x?.front ?? "").trim(); const back = String(x?.back ?? "").trim();
    if (!front || !back) { stats.badShape++; return; }
    const quote = String(x.source_quote ?? "").trim();
    const qc = checkQuote(quote, chunk);
    if (qc.level === "none") { stats.badQuote++; return; }
    const it = { front, back, quote, page: qc.page || Number(x.page) || chunk.pages[0], quoteLevel: qc.level, flag: false };
    if (!numbersSupported(`${front} ${back}`, src)) { it.flag = true; stats.flagged++; }
    items.push(it);
  });
  return { items, stats };
}

/** Keeps the note's bullets; drops any bullet with a number that is not in the PDF text. */
export function noteLines(text, chunk) {
  const raw = String(text ?? "").trim();
  if (!raw || /^NONE\b/i.test(raw)) return { lines: [], dropped: 0 };
  const src = chunkSource(chunk);
  const lines = []; let dropped = 0;
  raw.split(/\n/).map((l) => l.trim()).filter((l) => /^[-•*]\s+/.test(l)).forEach((l) => {
    const bodyText = l.replace(/^[-•*]\s+/, "");
    const check = bodyText.replace(/\[p\.[\d\s,–-]+\]/g, "").replace(/\*\*/g, "");
    if (!numbersSupported(check, src)) { dropped++; return; }
    lines.push(`- ${bodyText}`);
  });
  return { lines, dropped };
}
