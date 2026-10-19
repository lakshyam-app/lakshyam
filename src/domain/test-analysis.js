/* What the AI is told about a finished test: figures worked out in code, and the questions that went wrong,
   were left or were guessed. Pure (lookups are passed in), so it is unit-tested. */
import { letterFor } from "./text.js";
import { maxScore } from "./testing.js";
import { notOpened } from "./stats.js";

const MAX_LINES = 40;
const num = (x) => Math.round(Number(x || 0) * 100) / 100;
const secs = (ms) => `${Math.round((ms || 0) / 1000)} s`;

/** What the AI is told (pure: lookups passed in, so it can be tested). */
export function analysisInput(a0, { questionOf, topicOf, earlier = [] }) {
  // Blanks you never opened (a test ended early) aren't part of how it went.
  const unopened = a0.answers.filter((r) => notOpened(r, a0)).length;
  const a = unopened ? { ...a0, answers: a0.answers.filter((r) => !notOpened(r, a0)) } : a0;
  const c0 = a.counts || { correct: 0, wrong: 0, unanswered: 0 };
  const c = { ...c0, unanswered: Math.max(0, (c0.unanswered || 0) - unopened) };
  const mk = a.marking;
  const answered = a.answers.filter((r) => r.selected !== null && r.selected !== undefined);
  const timed = a.answers.filter((r) => r.timeMs > 0);
  const totalMs = timed.reduce((s, r) => s + r.timeMs, 0);
  const guesses = a.answers.filter((r) => r.guessed && r.graded && r.selected !== null);
  const guessRight = guesses.filter((r) => r.isCorrect).length;
  const pen = mk.negNum / mk.negDen;
  const facts = [
    `Test: ${a.scope?.label || "practice test"} · ${a.answers.length} questions${a.timerMinutes ? ` · timed, ${a.timerMinutes} min` : " · not timed"}`,
    `Marking: +${num(mk.pos)} for a right answer, −${num(pen)} for a wrong one, 0 if left blank`,
    `Score: ${num(a.netScore)} out of ${num(maxScore(c, mk))} · right ${c.correct}, wrong ${c.wrong}, left blank ${c.unanswered} · ${answered.length ? Math.round((c.correct / Math.max(1, c.correct + c.wrong)) * 100) : 0}% of answered right`,
    unopened ? `The test was ended early: ${unopened} more questions were never opened (not counted, not a mistake)` : null,
    timed.length ? `Time: ${secs(totalMs)} in all, ${secs(totalMs / timed.length)} per question on average` : null,
    guesses.length ? `Guesses: ${guesses.length}, ${guessRight} right, net ${num(guessRight * mk.pos - (guesses.length - guessRight) * pen)} marks from guessing` : null
  ].filter(Boolean);
  const byTopic = new Map();
  a.answers.forEach((r) => {
    if (!r.graded) return;
    const k = r.topicId || questionOf(r.questionId)?.topicId || "?";
    const x = byTopic.get(k) || { right: 0, n: 0, ms: 0, timed: 0 };
    x.n++; if (r.isCorrect) x.right++; if (r.timeMs) { x.ms += r.timeMs; x.timed++; }
    byTopic.set(k, x);
  });
  if (byTopic.size > 1) {
    facts.push(`By topic: ${[...byTopic.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 12)
      .map(([k, x]) => `${topicOf(k) || "?"} ${x.right}/${x.n} right${x.timed ? `, ${secs(x.ms / x.timed)} each` : ""}`).join("; ")}`);
  }
  if (earlier.length) facts.push(`Earlier tries (same test or topic): ${earlier.map((e) => `${e.date} ${num(e.score)}/${num(e.max)}`).join("; ")}`);
  const lines = [];
  a0.answers.forEach((r, i) => { // numbered as in the test
    if (notOpened(r, a0)) return;
    const wrong = r.graded && !r.isCorrect;
    if (!wrong && !r.guessed) return;
    if (lines.length >= MAX_LINES) return;
    const q = questionOf(r.questionId);
    if (!q) return;
    const opt = (k) => (Number.isInteger(k) && q.options[k] !== undefined ? `${letterFor(k)}) ${String(q.options[k]).slice(0, 90)}` : "—");
    lines.push(`#${i + 1} [${topicOf(q.topicId) || "?"}] ${String(q.text).replace(/\s+/g, " ").slice(0, 220)} | answered: ${r.selected === null || r.selected === undefined ? "left blank" : opt(r.selected)} | right: ${opt(r.correct ?? q.answerIndex)}${r.timeMs ? ` | ${secs(r.timeMs)}` : ""}${r.guessed ? " | guessed" : ""}${r.graded && r.isCorrect ? " | (right)" : ""}`);
  });
  return { facts, lines };
}

