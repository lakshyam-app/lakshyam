/* Pure test logic: picking questions, timers, grading, auto difficulty.
   No screen or database code here, so it can be unit-tested. */
import { netScore } from "./scoring.js";

/** A question can be scored only if it has a correct answer and wasn't deleted by PSC. */
export const isGradable = (q) => q.status !== "deleted_by_psc" && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length;

export function shuffle(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sampleRandom = (list, n, rand = Math.random) => shuffle(list, rand).slice(0, Math.max(0, Math.min(n, list.length)));

/** n questions from a list. keepOrder: keep the list's own order (e.g. a paper); otherwise mixed. */
export function pickQuestions(list, n, { keepOrder = false, rand = Math.random } = {}) {
  if (n >= list.length) return keepOrder ? list.slice() : shuffle(list, rand);
  const chosen = sampleRandom(list, n, rand);
  if (!keepOrder) return chosen;
  const pos = new Map(list.map((q, i) => [q.id, i]));
  return chosen.sort((a, b) => pos.get(a.id) - pos.get(b.id));
}

/** Same rule as the old app: 0.9 minutes per question, rounded up. */
export const suggestedMinutes = (n) => Math.max(1, Math.ceil(n * 0.9));

/** Splits `target` across groups in proportion to their size (largest remainder),
    never giving a group more than it has. items: [{ key, freq }] → { key: count } */
export function distributeProportionally(items, target) {
  const total = items.reduce((s, i) => s + i.freq, 0) || 1;
  const capped = Math.min(target, total);
  const rows = items.map((i) => {
    const exact = Math.min(i.freq, (capped * i.freq) / total);
    return { key: i.key, freq: i.freq, floor: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  const result = Object.fromEntries(rows.map((r) => [r.key, r.floor]));
  let left = capped - rows.reduce((s, r) => s + r.floor, 0);
  rows.sort((a, b) => b.rem - a.rem);
  // A second pass covers groups that hit their cap while others still have room.
  for (let pass = 0; pass < 2 && left > 0; pass++) {
    for (const r of rows) {
      if (left <= 0) break;
      if (result[r.key] < r.freq) { result[r.key]++; left--; }
    }
  }
  return result;
}

/** Old app's thresholds: over 50 s is Hard, 26–50 s Medium, under 26 s Easy. */
export function autoDifficulty(ms) {
  const sec = ms / 1000;
  return sec > 50 ? "D" : sec >= 26 ? "M" : "E";
}

/**
 * Scores a finished test.
 * questions: the question records in test order (current answers are used).
 * run: { answers: {qid: index}, guesses: {qid: true}, timeSpent: {qid: ms} }
 * difficultyOf(q): the difficulty to store with each answer (for later stats).
 */
export function gradeTest(questions, run, marking, difficultyOf = () => null) {
  const counts = { correct: 0, wrong: 0, unanswered: 0, total: questions.length };
  const answers = questions.map((q) => {
    const graded = isGradable(q);
    const sel = run.answers?.[q.id];
    const selected = Number.isInteger(sel) ? sel : null;
    const isCorrect = graded && selected !== null && selected === q.answerIndex;
    if (graded) {
      if (selected === null) counts.unanswered++;
      else if (isCorrect) counts.correct++;
      else counts.wrong++;
    }
    const ms = run.timeSpent?.[q.id];
    return {
      questionId: q.id, selected, correct: graded ? q.answerIndex : null, isCorrect, graded,
      guessed: Boolean(run.guesses?.[q.id]), timeMs: ms > 0 ? Math.round(ms) : null,
      subjectId: q.subjectId, topicId: q.topicId, difficulty: difficultyOf(q)
    };
  });
  return { answers, counts, netScore: netScore(counts.correct, counts.wrong, marking) };
}

/** Maximum marks for a test (every gradable question right). */
export const maxScore = (counts, marking) => Math.round((counts.correct + counts.wrong + counts.unanswered) * marking.pos * 100) / 100;

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
