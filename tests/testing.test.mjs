// Made-up data only (this repo is public).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isGradable, pickQuestions, suggestedMinutes, distributeProportionally, autoDifficulty, gradeTest, maxScore, clock, formatDuration } from "../src/domain/testing.js";
import { pickByBasis, accuracyBy, weakTopics } from "../src/domain/stats.js";
import { netScore } from "../src/domain/scoring.js";

const q = (id, answerIndex, extra = {}) => ({ id, answerIndex, status: "active", options: ["a", "b", "c", "d"], subjectId: "s", topicId: "t", ...extra });
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test("gradable means a valid answer and not deleted by PSC", () => {
  assert.equal(isGradable(q("1", 0)), true);
  assert.equal(isGradable(q("1", null)), false);
  assert.equal(isGradable(q("1", 4)), false);
  assert.equal(isGradable(q("1", null, { status: "deleted_by_psc" })), false);
});

test("picking keeps paper order when asked, and never more than available", () => {
  const list = ["a", "b", "c", "d", "e"].map((id) => q(id, 0));
  const kept = pickQuestions(list, 3, { keepOrder: true, rand: seq([0.9, 0.1, 0.5, 0.3]) });
  assert.equal(kept.length, 3);
  const order = kept.map((x) => list.findIndex((y) => y.id === x.id));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(pickQuestions(list, 99).length, 5);
});

test("timer suggestion is 0.9 min per question rounded up", () => {
  assert.equal(suggestedMinutes(10), 9);
  assert.equal(suggestedMinutes(25), 23);
  assert.equal(suggestedMinutes(100), 90);
  assert.equal(suggestedMinutes(1), 1);
});

test("mock distribution is proportional and respects caps", () => {
  const r = distributeProportionally([{ key: "A", freq: 60 }, { key: "B", freq: 30 }, { key: "C", freq: 10 }], 50);
  assert.deepEqual(r, { A: 30, B: 15, C: 5 });
  const capped = distributeProportionally([{ key: "A", freq: 2 }, { key: "B", freq: 100 }], 50);
  assert.equal(capped.A + capped.B, 50);
  assert.ok(capped.A <= 2);
  const small = distributeProportionally([{ key: "A", freq: 3 }, { key: "B", freq: 2 }], 10);
  assert.deepEqual(small, { A: 3, B: 2 });
});

test("auto difficulty thresholds match the old app", () => {
  assert.equal(autoDifficulty(25000), "E");
  assert.equal(autoDifficulty(26000), "M");
  assert.equal(autoDifficulty(50000), "M");
  assert.equal(autoDifficulty(50001), "D");
});

test("grading: right, wrong, blank, ungraded; score uses the marking", () => {
  const qs = [q("1", 0), q("2", 1), q("3", 2), q("4", null), q("5", 3)];
  const run = { answers: { 1: 0, 2: 3, 4: 1, 5: 3 }, guesses: { 2: true }, timeSpent: { 1: 12000, 2: 0 } };
  const marking = { pos: 1, negNum: 1, negDen: 3 };
  const r = gradeTest(qs, run, marking);
  assert.deepEqual(r.counts, { correct: 2, wrong: 1, unanswered: 1, total: 5 });
  assert.equal(r.netScore, netScore(2, 1, marking));
  assert.equal(r.netScore, 1.67);
  assert.equal(r.answers[3].graded, false);
  assert.equal(r.answers[1].guessed, true);
  assert.equal(r.answers[0].timeMs, 12000);
  assert.equal(r.answers[1].timeMs, null);
  assert.equal(maxScore(r.counts, marking), 4);
});

test("clock and durations", () => {
  assert.equal(clock(61000), "01:01");
  assert.equal(clock(-5), "00:00");
  assert.equal(formatDuration(45000), "45s");
  assert.equal(formatDuration(125000), "2m 5s");
});

test("first-try basis and weak topics", () => {
  const recs = [
    { questionId: "x", topicId: "T1", graded: true, selected: 1, isCorrect: false },
    { questionId: "x", topicId: "T1", graded: true, selected: 0, isCorrect: true },
    { questionId: "y", topicId: "T2", graded: true, selected: 0, isCorrect: true },
    { questionId: "z", topicId: "T2", graded: true, selected: null, isCorrect: false }
  ];
  assert.equal(pickByBasis(recs).length, 2);
  assert.equal(pickByBasis(recs).find((r) => r.questionId === "x").isCorrect, false);
  assert.equal(pickByBasis(recs, "latest").find((r) => r.questionId === "x").isCorrect, true);
  const acc = accuracyBy(pickByBasis(recs), (r) => r.topicId);
  assert.ok(acc.T1.adj < acc.T2.adj);
  const weak = weakTopics(new Map([["T1", 10], ["T2", 10], ["T3", 2]]), recs);
  assert.equal(weak[0].topicId, "T1");
  assert.equal(weak.find((w) => w.topicId === "T3").accuracy, null);
});
