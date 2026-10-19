// 1.17: what the AI is told after a test. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { analysisInput } from "../src/domain/test-analysis.js";
import { testAnalysisTask } from "../src/ai/prompts.js";

const qs = {
  a: { id: "a", text: "Longest river of Kerala?", options: ["Periyar", "Pamba", "Chaliyar", "Bharathapuzha"], answerIndex: 0, topicId: "t1" },
  b: { id: "b", text: "Vaikom Satyagraha year?", options: ["1921", "1924", "1930", "1936"], answerIndex: 1, topicId: "t2" },
  c: { id: "c", text: "Capital of Kerala?", options: ["Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur"], answerIndex: 1, topicId: "t1" }
};
const attempt = {
  id: "x", scope: { label: "Kerala basics" }, timerMinutes: 5, netScore: 0.67,
  marking: { pos: 1, negNum: 1, negDen: 3 }, counts: { correct: 1, wrong: 1, unanswered: 1, total: 3 },
  answers: [
    { questionId: "a", selected: 1, correct: 0, isCorrect: false, graded: true, timeMs: 4000, guessed: true },
    { questionId: "b", selected: null, correct: 1, isCorrect: false, graded: true, timeMs: 0, opened: true },
    { questionId: "c", selected: 1, correct: 1, isCorrect: true, graded: true, timeMs: 12000 }
  ]
};
const topics = { t1: "Rivers", t2: "Renaissance" };

test("figures, topics, earlier tries and the questions to look at", () => {
  const { facts, lines } = analysisInput(attempt, { questionOf: (id) => qs[id], topicOf: (id) => topics[id], earlier: [{ date: "2026-10-01", score: 0.33, max: 3 }] });
  const f = facts.join("\n");
  assert.match(f, /Score: 0\.67 out of 3 · right 1, wrong 1, left blank 1 · 50% of answered right/);
  assert.match(f, /−0\.33 for a wrong one/);
  assert.match(f, /Guesses: 1, 0 right, net -0\.33 marks/);
  assert.match(f, /By topic: Rivers 1\/2 right, 8 s each; Renaissance 0\/1 right/);
  assert.match(f, /Earlier tries .*2026-10-01 0\.33\/3/);
  assert.equal(lines.length, 2); // the wrong (guessed) one and the blank; the right one is left out
  assert.match(lines[0], /^#1 \[Rivers\] Longest river of Kerala\? \| answered: B\) Pamba \| right: A\) Periyar \| 4 s \| guessed$/);
  assert.match(lines[1], /answered: left blank \| right: B\) 1924/);
  const task = testAnalysisTask(facts, lines);
  assert.match(task, /## 3\. Facts to fix/);
  assert.match(task, /Only facts you are sure of/);
});
