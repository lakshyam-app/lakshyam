/* Progress maths, shared by tests (weak areas) and the Progress tab. Pure functions.
   Basis "first": each question counts once, from your first try (old app's default);
   "latest": your most recent try; "all": every answer. */

export const SHRINK_K = 5;   // small samples are pulled towards your overall accuracy
export const LOW_N = 5;      // fewer answers than this = "few answers"

/** Answer records from submitted tests, oldest test first. */
export function answerRecords(attempts) {
  return attempts.filter((a) => a.status !== "in_progress")
    .slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
    .flatMap((a) => a.answers.map((r) => ({ ...r, at: a.submittedAt, attemptId: a.id })));
}

export const isAnswered = (r) => r.graded && r.selected !== null && r.selected !== undefined;
export const isTimed = (r) => r.timeMs > 0;

/** One record per question (first or latest try), or all of them, among records that pass `keep`
    (by default: answered and scored). Records must be oldest first. */
export function pickByBasis(records, basis = "first", keep = isAnswered) {
  const ok = records.filter(keep);
  if (basis === "all") return ok;
  const m = new Map();
  ok.forEach((r) => { if (basis === "latest" || !m.has(r.questionId)) m.set(r.questionId, r); });
  return [...m.values()];
}

/** groupKey(record) → { key: { correct, total, adj, low } } with small-sample adjustment. */
export function accuracyBy(records, groupKey) {
  const map = {};
  records.forEach((r) => {
    const k = groupKey(r);
    map[k] ||= { correct: 0, total: 0 };
    map[k].total++;
    if (r.isCorrect) map[k].correct++;
  });
  let c = 0; let t = 0;
  Object.values(map).forEach((a) => { c += a.correct; t += a.total; });
  const prior = t ? c / t : 0.5;
  Object.values(map).forEach((a) => {
    a.adj = (a.correct + SHRINK_K * prior) / (a.total + SHRINK_K);
    a.low = a.total < LOW_N;
  });
  return map;
}

/**
 * Topics ranked by how much they need work: how often they appear in papers ×
 * how often you get them wrong (unpractised topics count as fully weak).
 * questionCountByTopic: Map(topicId → n).  Returns [{ topicId, freq, accuracy|null, priority }]
 */
export function weakTopics(questionCountByTopic, records) {
  const acc = accuracyBy(pickByBasis(records, "first"), (r) => r.topicId);
  const max = Math.max(1, ...questionCountByTopic.values());
  return [...questionCountByTopic.entries()].map(([topicId, freq]) => {
    const a = acc[topicId];
    const accuracy = a && a.total > 0 ? a.adj : null;
    return { topicId, freq, accuracy, priority: (freq / max) * (accuracy === null ? 1 : 1 - accuracy) };
  }).sort((x, y) => y.priority - x.priority);
}

/* ---------- summary ---------- */

/** Penalty per wrong answer, and the guess accuracy at which guessing breaks even. */
export function markingInfo(marking) {
  const pos = marking.pos || 1;
  const pen = marking.negDen > 0 ? marking.negNum / marking.negDen : 0;
  return { pos, pen, breakEven: pos + pen > 0 ? pen / (pos + pen) : 0 };
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * How you're doing on a set of records (scored questions, answered or left).
 * Uses one record per question on the chosen basis.
 * per100: net marks scaled to a 100-question paper.
 */
export function summarize(records, marking, basis = "first") {
  const recs = pickByBasis(records, basis, (r) => r.graded);
  const right = recs.filter((r) => r.isCorrect).length;
  const answered = recs.filter(isAnswered).length;
  const wrong = answered - right;
  const n = recs.length;
  const { pos, pen } = markingInfo(marking);
  const net = right * pos - wrong * pen;
  return {
    n, answered, right, wrong, blank: n - answered,
    accuracy: answered ? right / answered : null,
    attempted: n ? answered / n : null,
    net: r2(net),
    per100: n ? r2((net / n) * 100) : null,
    earned100: n ? r2((right * pos / n) * 100) : null,
    lost100: n ? r2((wrong * pen / n) * 100) : null,
    wrong100: n ? r2((wrong / n) * 100) : null,
    blank100: n ? r2(((n - answered) / n) * 100) : null
  };
}

/** Accuracy (0–1) of each test, oldest first, for a trend line. */
export function testTrend(attempts, keep = () => true) {
  return attempts.filter((a) => a.status !== "in_progress").slice().sort((a, b) => a.submittedAt - b.submittedAt)
    .map((a) => {
      const recs = a.answers.filter((r) => keep(r) && isAnswered(r));
      return recs.length ? { at: a.submittedAt, id: a.id, value: recs.filter((r) => r.isCorrect).length / recs.length, n: recs.length } : null;
    }).filter(Boolean);
}

/** Guessing record: { n, right, wrong, net, acc } (answered guesses only). */
export function guessSummary(records, marking) {
  const { pos, pen } = markingInfo(marking);
  const g = records.filter((r) => r.guessed && isAnswered(r));
  const right = g.filter((r) => r.isCorrect).length;
  const wrong = g.length - right;
  return { n: g.length, right, wrong, net: r2(right * pos - wrong * pen), acc: g.length ? right / g.length : null };
}

export const DIFFICULTY_POINTS = { E: 3, M: 6, D: 9 };

/** Average difficulty out of 9 over the questions that have one (old app's scale). */
export function avgDifficulty(levels) {
  const marked = levels.filter((d) => DIFFICULTY_POINTS[d]);
  if (!marked.length) return null;
  return { avg: Math.round((marked.reduce((s, d) => s + DIFFICULTY_POINTS[d], 0) / marked.length) * 10) / 10, count: marked.length, total: levels.length };
}

/* ---------- insights ---------- */

export const INSIGHT_RULES = {
  weakMin: LOW_N,       // answers needed before a topic can be called weakest
  trendMin: 8,          // answers in each 14-day window for improving/slipping
  trendDays: 14,
  trendGap: 0.1,        // a change of at least 10 points
  guessMin: 10,         // guesses in a subject
  slowMin: 8,           // timed answers in a topic
  slowFactor: 1.5,      // × your average time per question
  untouchedShare: 0.01  // topics with at least 1% of the questions
};

/**
 * "What stands out": at most `limit` short findings, biggest marks at stake first.
 * input: { records (oldest first, this period), allRecords (for trends), questionCountByTopic: Map,
 *          marking, now, basis, catchAll: Set of "Other" topic IDs }
 * Each insight: { kind, topicId|subjectId, stake, ...numbers } — the screen turns it into words.
 */
export function findInsights({ records, allRecords = records, questionCountByTopic, marking, now = Date.now(), basis = "first", limit = 5, catchAll = new Set() }) {
  const R = INSIGHT_RULES;
  const { pen, breakEven } = markingInfo(marking);
  const total = [...questionCountByTopic.values()].reduce((s, n) => s + n, 0) || 1;
  const out = [];

  // Weakest topic: appears often × gets wrong often (needs enough answers).
  const acc = accuracyBy(pickByBasis(records, basis), (r) => r.topicId);
  const weak = Object.entries(acc).filter(([id, a]) => a.total >= R.weakMin && questionCountByTopic.has(id) && a.correct / a.total < 0.7)
    .map(([id, a]) => ({ id, a, share: questionCountByTopic.get(id) / total }))
    .map((x) => ({ ...x, stake: x.share * 100 * (1 - x.a.adj) * (1 + pen) }))
    .sort((x, y) => y.stake - x.stake)[0];
  if (weak) {
    out.push({ kind: "weakest", topicId: weak.id, pct: weak.a.correct / weak.a.total, n: weak.a.total, stake: weak.stake });
  }

  // Improving / slipping: last 14 days vs the 14 before, per topic.
  const day = 86400000;
  const recentFrom = now - R.trendDays * day; const prevFrom = now - 2 * R.trendDays * day;
  const answered = allRecords.filter(isAnswered);
  const win = (from, to) => accuracyBy(answered.filter((r) => r.at >= from && r.at < to), (r) => r.topicId);
  const recent = win(recentFrom, now + 1); const prev = win(prevFrom, recentFrom);
  const moves = Object.keys(recent).filter((id) => prev[id] && recent[id].total >= R.trendMin && prev[id].total >= R.trendMin)
    .map((id) => ({ id, before: prev[id].correct / prev[id].total, after: recent[id].correct / recent[id].total }))
    .filter((m) => Math.abs(m.after - m.before) >= R.trendGap)
    .sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before));
  const up = moves.find((m) => m.after > m.before);
  const down = moves.find((m) => m.after < m.before);
  if (down) out.push({ kind: "slipping", topicId: down.id, before: down.before, after: down.after, stake: (down.before - down.after) * 10 });
  if (up) out.push({ kind: "improving", topicId: up.id, before: up.before, after: up.after, stake: 0.5 });

  // Guessing below break-even in a subject.
  const bySubject = new Map();
  records.filter((r) => r.guessed && isAnswered(r)).forEach((r) => {
    if (!bySubject.has(r.subjectId)) bySubject.set(r.subjectId, []);
    bySubject.get(r.subjectId).push(r);
  });
  const costly = [...bySubject.entries()].map(([id, rs]) => ({ id, g: guessSummary(rs, marking) }))
    .filter((x) => x.g.n >= R.guessMin && x.g.acc < breakEven && x.g.net < 0)
    .sort((x, y) => x.g.net - y.g.net)[0];
  if (costly) out.push({ kind: "guessing", subjectId: costly.id, net: costly.g.net, n: costly.g.n, acc: costly.g.acc, breakEven, stake: -costly.g.net });

  // Slowest topic compared with your own average.
  const timed = pickByBasis(records, basis, isTimed);
  if (timed.length) {
    const avg = timed.reduce((s, r) => s + r.timeMs, 0) / timed.length;
    const byTopic = new Map();
    timed.forEach((r) => { if (!byTopic.has(r.topicId)) byTopic.set(r.topicId, []); byTopic.get(r.topicId).push(r.timeMs); });
    const slow = [...byTopic.entries()].filter(([, ms]) => ms.length >= R.slowMin)
      .map(([id, ms]) => ({ id, ms: ms.reduce((s, x) => s + x, 0) / ms.length, n: ms.length }))
      .filter((x) => x.ms > R.slowFactor * avg).sort((x, y) => y.ms - x.ms)[0];
    if (slow) out.push({ kind: "slowest", topicId: slow.id, ms: slow.ms, avgMs: avg, n: slow.n, stake: ((questionCountByTopic.get(slow.id) || 0) / total) * 100 * 0.3 });
  }

  // A frequent topic you have never answered.
  const touched = new Set(allRecords.filter(isAnswered).map((r) => r.topicId));
  // ("Other"-type catch-all topics are skipped: they aren't something you can sit down and study.)
  const untouched = [...questionCountByTopic.entries()].filter(([id, n]) => !touched.has(id) && !catchAll.has(id) && n / total >= R.untouchedShare)
    .sort((x, y) => y[1] - x[1])[0];
  if (untouched) out.push({ kind: "untouched", topicId: untouched[0], count: untouched[1], stake: (untouched[1] / total) * 100 * 0.5 });

  return out.sort((x, y) => y.stake - x.stake).slice(0, limit);
}
