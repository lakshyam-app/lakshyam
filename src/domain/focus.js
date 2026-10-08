/* Focus check and best time of day. Pure functions, no screen code.
   - Leaving the app during a test: counted when you're away at least MIN_AWAY_MS (a quick glance
     at the notification shade doesn't hide the app, so it isn't counted). Paused tests aren't counted.
   - "Compared with your usual": each answer is compared with how you usually do on that topic,
     so a slot or a test full of hard topics isn't unfairly marked down. */

export const MIN_AWAY_MS = 5000;
export const MAX_AWAY_MS = 15 * 60000;   // one leave counts at most this much (the app may have been closed)
export const LONG_SESSION_MS = 25 * 60000; // after this much focused time, suggest a real break
const K = 5;                              // small topics are pulled towards your overall accuracy

/** Adds one leave to the focus record. Returns the new record (doesn't change the old one). */
export function addLeave(focus, ms) {
  const f = { n: Math.max(0, Number(focus?.n) || 0), ms: Math.max(0, Number(focus?.ms) || 0) };
  const d = Math.max(0, Number(ms) || 0);
  if (d < MIN_AWAY_MS) return f;
  return { n: f.n + 1, ms: f.ms + Math.min(d, MAX_AWAY_MS) };
}

/** A safe copy of a stored focus record (data may come from a backup). */
export function cleanFocus(f) {
  if (!f || typeof f !== "object") return null;
  const n = Math.max(0, Math.min(999, Math.floor(Number(f.n) || 0)));
  const ms = Math.max(0, Math.min(999 * MAX_AWAY_MS, Number(f.ms) || 0));
  return { n, ms };
}

/**
 * Each record gets res = (1 if right else 0) − your usual accuracy on that topic.
 * records: answered, graded records ({ topicId, isCorrect }).
 */
export function withResiduals(records) {
  if (!records.length) return [];
  const overall = records.filter((r) => r.isCorrect).length / records.length;
  const by = new Map();
  records.forEach((r) => { const x = by.get(r.topicId) || { c: 0, n: 0 }; x.n++; if (r.isCorrect) x.c++; by.set(r.topicId, x); });
  return records.map((r) => { const x = by.get(r.topicId); return { ...r, res: (r.isCorrect ? 1 : 0) - (x.c + K * overall) / (x.n + K) }; });
}

function groupStats(list) {
  const n = list.length;
  const acc = n ? list.filter((r) => r.isCorrect).length / n : 0;
  const vsUsual = n ? list.reduce((s, r) => s + r.res, 0) / n : 0;
  const timed = list.filter((r) => r.timeMs > 0);
  const sec = timed.length >= 5 ? timed.reduce((s, r) => s + r.timeMs, 0) / timed.length / 1000 : null;
  return { n, acc, vsUsual, sec, tests: new Set(list.map((r) => r.attemptId)).size };
}

/** True when the gap between two groups is bigger than chance would easily give (about 95%). */
function clearGap(a, b) {
  const p = (a.acc * a.n + b.acc * b.n) / Math.max(1, a.n + b.n);
  const se = Math.sqrt(Math.max(1e-6, p * (1 - p)) * (1 / a.n + 1 / b.n));
  return Math.abs(a.vsUsual - b.vsUsual) > 1.96 * se;
}

export const SLOTS = [
  { id: "early", from: 4, to: 8 }, { id: "morning", from: 8, to: 12 }, { id: "afternoon", from: 12, to: 16 },
  { id: "evening", from: 16, to: 20 }, { id: "night", from: 20, to: 24 }, { id: "late", from: 0, to: 4 }
];
export const slotOf = (hour) => SLOTS.find((s) => hour >= s.from && hour < s.to)?.id || "late";
export const SLOT_MIN_ANSWERS = 40;
export const SLOT_MIN_TESTS = 3;

/**
 * Accuracy by time of day. records: answered, graded first tries with { topicId, isCorrect, timeMs, attemptId, hour }.
 * Returns { slots: [{ id, n, tests, acc, vsUsual, sec, enough }], best, worst, clear, enoughSlots }.
 */
export function bestTime(records) {
  const res = withResiduals(records);
  const slots = SLOTS.map((s) => {
    const g = groupStats(res.filter((r) => slotOf(r.hour) === s.id));
    return { id: s.id, ...g, enough: g.n >= SLOT_MIN_ANSWERS && g.tests >= SLOT_MIN_TESTS };
  }).filter((s) => s.n > 0);
  const ok = slots.filter((s) => s.enough);
  if (ok.length < 2) return { slots, best: null, worst: null, clear: false, enoughSlots: ok.length };
  const sorted = ok.slice().sort((a, b) => b.vsUsual - a.vsUsual);
  const best = sorted[0]; const worst = sorted[sorted.length - 1];
  return { slots, best, worst, clear: clearGap(best, worst), enoughSlots: ok.length };
}

export const FOCUS_MIN_TESTS = 3;
export const FOCUS_MIN_ANSWERS = 30;

/**
 * Tests where you stayed in the app vs tests where you left it.
 * attempts: submitted tests (only those with a focus record count).
 * records: answered, graded records with { attemptId, topicId, isCorrect } from those and other tests.
 */
export function focusSummary(attempts, records) {
  const tracked = attempts.map((a) => ({ a, f: cleanFocus(a.focus) })).filter((x) => x.f);
  const leftIds = new Set(tracked.filter((x) => x.f.n > 0).map((x) => x.a.id));
  const stayIds = new Set(tracked.filter((x) => x.f.n === 0).map((x) => x.a.id));
  const res = withResiduals(records);
  const left = groupStats(res.filter((r) => leftIds.has(r.attemptId)));
  const stayed = groupStats(res.filter((r) => stayIds.has(r.attemptId)));
  const leaves = tracked.reduce((s, x) => s + x.f.n, 0);
  const awayMs = tracked.reduce((s, x) => s + x.f.ms, 0);
  const enough = left.tests >= FOCUS_MIN_TESTS && stayed.tests >= FOCUS_MIN_TESTS && left.n >= FOCUS_MIN_ANSWERS && stayed.n >= FOCUS_MIN_ANSWERS;
  return {
    tests: tracked.length, testsLeft: leftIds.size, leaves, awayMs,
    left, stayed, enough, clear: enough && clearGap(stayed, left)
  };
}

/** Whether to show the Do Not Disturb tip before a test: you left the app in at least 2 of your last 3 tracked tests. */
export function suggestDnd(attempts) {
  const last = attempts.filter((a) => cleanFocus(a.focus)).sort((x, y) => (y.submittedAt || 0) - (x.submittedAt || 0)).slice(0, 3);
  return last.length >= 2 && last.filter((a) => cleanFocus(a.focus).n > 0).length >= 2;
}
