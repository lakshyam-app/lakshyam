/* Mistake review: spaced repetition for single questions, worked out from your test
   history (so it covers every test you have ever taken and needs no extra saving).
   - A wrong answer puts the question in review, due the next day.
   - A right answer moves it to the next gap: 3, then 7, then 21 days.
   - Right at the 21-day check, it leaves review. Wrong at any point starts again at 1 day.
   - A right answer marked 🤔 (guessed) keeps it where it is; a guessed right answer to a
     question not in review adds it at the 3-day gap (you weren't sure).
   - Blank answers don't count: leaving a question is not a mistake you made.
   Pure: no storage, no screen code. */

export const GAPS = [1, 3, 7, 21];

const pad = (n) => String(n).padStart(2, "0");
/** Local calendar date (YYYY-MM-DD) of a moment, plus `days`. */
export function dayOf(ms, days = 0) {
  const d = new Date(ms);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/**
 * records: answer records, oldest first ({ questionId, graded, selected, isCorrect, guessed, at }).
 * offAt: Map questionId → when you said "stop reviewing" (records up to then are ignored).
 * Returns Map questionId → { step, lastAt, dueDay, wrong }.
 */
export function mistakeQueue(records, offAt = new Map()) {
  const q = new Map();
  for (const r of records) {
    if (!r.graded || r.selected === null || r.selected === undefined) continue;
    const off = offAt.get(r.questionId);
    if (off && r.at <= off) continue;
    const cur = q.get(r.questionId);
    if (!r.isCorrect) q.set(r.questionId, { step: 0, lastAt: r.at, wrong: (cur?.wrong || 0) + 1 });
    else if (r.guessed) q.set(r.questionId, cur ? { ...cur, lastAt: r.at } : { step: 1, lastAt: r.at, wrong: 0 });
    else if (cur) {
      if (cur.step + 1 >= GAPS.length) q.delete(r.questionId);
      else q.set(r.questionId, { ...cur, step: cur.step + 1, lastAt: r.at });
    }
  }
  for (const [id, s] of q) q.set(id, { ...s, dueDay: dayOf(s.lastAt, GAPS[s.step]) });
  return q;
}

/** The questions due on `today` (YYYY-MM-DD), most overdue and most often wrong first. */
export function dueIds(queue, today) {
  return [...queue.entries()].filter(([, s]) => s.dueDay <= today)
    .sort(([, a], [, b]) => a.dueDay.localeCompare(b.dueDay) || b.wrong - a.wrong || a.lastAt - b.lastAt)
    .map(([id]) => id);
}

/** How many come due on each of the next `days` days (for "coming up"). */
export function upcomingCounts(queue, today, days = 7) {
  const out = [];
  const base = new Date(`${today}T12:00:00`).getTime();
  for (let i = 1; i <= days; i++) {
    const d = dayOf(base, i);
    out.push({ day: d, n: [...queue.values()].filter((s) => s.dueDay === d).length });
  }
  return out;
}
