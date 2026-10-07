/* Accuracy maths shared by tests (weak areas) and, later, Progress.
   Basis "first": each question counts once, from your first try (old app's default). */

export const SHRINK_K = 5;   // small samples are pulled towards your overall accuracy
export const LOW_N = 5;      // fewer answers than this = "few answers"

/** Answer records from submitted tests, oldest test first. */
export function answerRecords(attempts) {
  return attempts.filter((a) => a.status !== "in_progress")
    .slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
    .flatMap((a) => a.answers.map((r) => ({ ...r, at: a.submittedAt })));
}

/** One record per question (first or latest try), or all of them. Only answered, graded ones. */
export function pickByBasis(records, basis = "first") {
  const ok = records.filter((r) => r.graded && r.selected !== null && r.selected !== undefined);
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
