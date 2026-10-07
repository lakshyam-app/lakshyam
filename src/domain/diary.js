/* Study diary (pure, unit-tested): how effective a day was, and summaries of a week or month.

   Day facts: { planned, done, questions, correct, topics, goal, mood }
     planned / done: study, revision and test blocks in your timetable that day (done = marked done or topics ticked)
     questions / correct: answered in tests that day; topics: topics marked studied that day
     mood: your own rating 1–5 (optional)
   Score 0–100. With a timetable, keeping to the plan counts most; without one,
   questions and topics count. Your mood is shown but does not change the score. */

export const MOODS = [1, 2, 3, 4, 5];
export const MOOD_FACE = { 1: "😫", 2: "😕", 3: "😐", 4: "🙂", 5: "🤩" };

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function dayScore(f) {
  const q = clamp01((f.questions || 0) / Math.max(1, f.goal || 30));
  const tp = clamp01((f.topics || 0) / 3);
  let score;
  if (f.planned > 0) {
    const plan = clamp01((f.done || 0) / f.planned);
    score = 0.5 * plan + 0.3 * q + 0.2 * tp;
  } else {
    score = 0.6 * q + 0.4 * tp;
  }
  // A good accuracy lifts a day a little; it never lowers one.
  if (f.questions >= 10 && f.correct / f.questions >= 0.7) score = Math.min(1, score + 0.05);
  return Math.round(score * 100);
}

/** none (nothing done) · missed (a plan was there, nothing done) · low · fair · good · great */
export function dayLevel(f, score = dayScore(f)) {
  const active = (f.questions || 0) + (f.topics || 0) + (f.done || 0) > 0;
  if (!active) return f.planned > 0 ? "missed" : "none";
  if (score >= 75) return "great";
  if (score >= 50) return "good";
  if (score >= 25) return "fair";
  return "low";
}

/** Monday of the week containing a date ("YYYY-MM-DD"). */
export function mondayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - wd);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Totals for a list of { date, facts } days (a week or a month). */
export function summarize(days) {
  const s = { days: days.length, studied: 0, planned: 0, done: 0, questions: 0, correct: 0, topics: 0, moods: [], scores: [], best: null, worst: null, missed: 0, reviewed: 0 };
  days.forEach(({ date, facts }) => {
    const sc = dayScore(facts);
    const lv = dayLevel(facts, sc);
    s.scores.push(sc);
    if (lv !== "none" && lv !== "missed") s.studied++;
    if (lv === "missed") s.missed++;
    s.planned += facts.planned || 0; s.done += facts.done || 0;
    s.questions += facts.questions || 0; s.correct += facts.correct || 0; s.topics += facts.topics || 0;
    if (facts.mood) { s.moods.push(facts.mood); s.reviewed++; }
    if (!s.best || sc > s.best.score) s.best = { date, score: sc };
    if (!s.worst || sc < s.worst.score) s.worst = { date, score: sc };
  });
  s.avgScore = s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0;
  s.avgMood = s.moods.length ? Math.round((s.moods.reduce((a, b) => a + b, 0) / s.moods.length) * 10) / 10 : null;
  s.planRate = s.planned ? Math.round((s.done / s.planned) * 100) : null;
  s.accuracy = s.questions ? Math.round((s.correct / s.questions) * 100) : null;
  return s;
}

/** Up (+), down (−) or the same, compared with the period before. */
export const trend = (now, before) => (before === null || before === undefined ? null : now - before);
