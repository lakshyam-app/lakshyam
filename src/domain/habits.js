/* Daily habits: streak, this week's dots, and the "next best step".
   Dates are the phone's own local dates ("YYYY-MM-DD"), so late-night study
   counts for the right day (fixes the old UTC bug). Pure functions. */

const DAY = 86400000;

/** Moves a "YYYY-MM-DD" date by whole days, in local time. */
export function shiftDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/**
 * Streak = days in a row with any study (a test, or a topic marked studied).
 * Today not done yet doesn't break it: it is still alive from yesterday.
 * Returns { count, todayDone, alive, missedYesterday }.
 */
export function streak(activeDays, today) {
  const todayDone = activeDays.has(today);
  let d = todayDone ? today : shiftDate(today, -1);
  let count = 0;
  while (activeDays.has(d)) { count++; d = shiftDate(d, -1); }
  return { count, todayDone, alive: count > 0, missedYesterday: !todayDone && count === 0 && activeDays.size > 0 };
}

/** Monday-to-Sunday dots for the week containing `today`. */
export function weekDots(activeDays, today) {
  const [y, m, d] = today.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  const monday = shiftDate(today, -dow);
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(monday, i);
    return { date, active: activeDays.has(date), isToday: date === today, future: i > dow };
  });
}

/**
 * Candidates for "What to study next", best first:
 *   1. topics due for review (oldest due first),
 *   2. weak topics that appear often (ranked by frequency × how often you get them wrong),
 *   3. topics that appear often that you have never answered.
 * input: { due: [{ topicId, nextReviewAt, studiedCount }], weak: [{ topicId, freq, accuracy(0–1, adjusted), pct, n }],
 *          untouched: [{ topicId, freq }], gradable: Map(topicId → number of scorable questions) }
 */
export function nextSteps({ due = [], weak = [], untouched = [], gradable = new Map(), limit = 6 }) {
  const out = []; const seen = new Set();
  const add = (x) => { if (!seen.has(x.topicId) && (gradable.get(x.topicId) || 0) > 0) { seen.add(x.topicId); out.push(x); } };
  due.slice().sort((a, b) => a.nextReviewAt - b.nextReviewAt).forEach((x) => add({ ...x, kind: "due" }));
  weak.filter((x) => x.accuracy !== null && x.pct < 0.7).sort((a, b) => b.freq * (1 - b.accuracy) - a.freq * (1 - a.accuracy))
    .forEach((x) => add({ ...x, kind: "weak" }));
  untouched.slice().sort((a, b) => b.freq - a.freq).forEach((x) => add({ ...x, kind: "new" }));
  return out.slice(0, limit);
}

export const daysBetween = (fromMs, toMs) => Math.floor((toMs - fromMs) / DAY);

/** Exam date + time ("YYYY-MM-DD", "HH:MM") → milliseconds on this phone's clock (local time). */
export function examMoment(date, time = "") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!m) return null;
  const [h, min] = /^\d{1,2}:\d{2}$/.test(time || "") ? time.split(":").map(Number) : [0, 0];
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min).getTime();
}

/** Whole days, hours and minutes left (counting down), or past: true. */
export function timeUntil(target, now = Date.now()) {
  const ms = target - now;
  if (ms <= 0) return { past: true, days: 0, hours: 0, minutes: 0 };
  const minutes = Math.floor(ms / 60000);
  return { past: false, days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}
