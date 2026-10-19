/* 1.26 · Monthly current-affairs quiz: the pure parts (months, and the checks made in code on what the AI
   wrote). Unit-tested. The quiz itself is made in features/ai/ca-quiz.js, always from a web search
   (Gemini or Groq gpt-oss presets): an AI's memory doesn't know last month's news. */

export const CA_COUNTS = [10, 20];
export const CA_REGIONS = ["kerala", "india", "world"];
export const CA_MONTHS = 6; // this month (so far) and the five before it

const SUBJECT = /current\s*affairs|ആനുകാലിക|സമകാലിക/i;
/** Is this the Current Affairs subject (English or Malayalam name)? */
export const isCaSubject = (s) => Boolean(s) && (SUBJECT.test(String(s.name || "")) || SUBJECT.test(String(s.nameMl || "")));

/** Where a question lands when the AI's topic doesn't match one of yours (made if missing). */
export const REGION_TOPIC = { kerala: "Kerala Current Affairs", india: "National Current Affairs", world: "International Current Affairs" };

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-09" for a date. */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const isMonthKey = (k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(k || ""));

/** The months you can pick, newest first: this month (so far) and the ones before it. → [{ key, partial }] */
export function monthChoices(now = new Date(), n = CA_MONTHS) {
  return Array.from({ length: n }, (_, i) => ({ key: monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), partial: i === 0 }));
}

/** First and last day of a month; for this month, the last day is today. "2026-09" → { from: "2026-09-01", to: "2026-09-30" } */
export function monthRange(key, now = new Date()) {
  const [y, m] = key.split("-").map(Number);
  const last = `${key}-${pad(new Date(y, m, 0).getDate())}`;
  const today = dayKey(now);
  return { from: `${key}-01`, to: last > today ? today : last };
}

/** "September 2026" (in the given locale; the prompt always uses English). */
export function monthName(key, locale = "en-IN") {
  if (!isMonthKey(key)) return String(key || "");
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** A real calendar day written YYYY-MM-DD at the start of s, else null. */
export function realDay(s) {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Is the event's date in the month asked for? "ok" · "off" (outside it) · "none" (no real date given). */
export function dateCheck(date, range) {
  const d = realDay(date);
  if (!d) return "none";
  return d >= range.from && d <= range.to ? "ok" : "off";
}

export const regionOf = (x) => { const r = String(x || "").trim().toLowerCase(); return CA_REGIONS.includes(r) ? r : null; };

/** Same question? (case, spaces and punctuation ignored) */
export const textKey = (s) => String(s || "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, "");

/** Ticked for saving at first only when every check passed: a date in the month, a source, and the second
    pass (which searched the web on its own) gave the same answer or couldn't run. */
export const startsTicked = (it) => it.dateCheck === "ok" && Boolean(it.src) && it.check !== "disagree" && it.check !== "unclear";

/** The complete question objects in a reply that was cut off (or isn't valid JSON as a whole). */
export function salvageObjects(text) {
  const s = String(text || "");
  const out = []; const starts = [];
  let inStr = false; let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === "\"") inStr = false; continue; }
    if (c === "\"") inStr = true;
    else if (c === "{") starts.push(i);
    else if (c === "}" && starts.length) {
      const part = s.slice(starts.pop(), i + 1);
      if (!/"question_text"\s*:/.test(part)) continue;
      try { const o = JSON.parse(part); if (o && typeof o.question_text === "string") out.push(o); } catch { /* a broken one is left out */ }
    }
  }
  return out;
}

/** Saved quiz questions by month, newest first. → [{ key, questions }] */
export function caGroups(questions) {
  const by = new Map();
  (questions || []).forEach((q) => { const k = q?.sourceRef?.ca; if (!isMonthKey(k)) return; if (!by.has(k)) by.set(k, []); by.get(k).push(q); });
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, list]) => ({ key, questions: list }));
}
