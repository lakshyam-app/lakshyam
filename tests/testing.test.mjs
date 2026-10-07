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

import { summarize, guessSummary, markingInfo, avgDifficulty, findInsights, testTrend } from "../src/domain/stats.js";

const rec = (questionId, topicId, opts = {}) => ({ questionId, topicId, subjectId: opts.s || "S", graded: true, selected: opts.sel === undefined ? 0 : opts.sel, isCorrect: Boolean(opts.ok), guessed: Boolean(opts.g), timeMs: opts.ms || null, at: opts.at || 1 });

test("summary per 100 uses each question once and counts blanks", () => {
  const m = { pos: 1, negNum: 1, negDen: 3 };
  const recs = [rec("a", "T", { ok: true }), rec("b", "T"), rec("c", "T", { sel: null }), rec("d", "T", { ok: true }), rec("a", "T", { at: 2 })];
  const s = summarize(recs, m);
  assert.equal(s.n, 4);
  assert.equal(s.right, 2); assert.equal(s.wrong, 1); assert.equal(s.blank, 1);
  assert.equal(s.per100, 41.67);       // (2 − ⅓) / 4 × 100
  assert.equal(s.accuracy, 2 / 3);
  assert.equal(s.attempted, 0.75);
  assert.equal(summarize(recs, m, "latest").right, 1);
});

test("guessing break-even and summary", () => {
  assert.equal(markingInfo({ pos: 1, negNum: 1, negDen: 3 }).breakEven, 0.25);
  const g = guessSummary([rec("a", "T", { g: true, ok: true }), rec("b", "T", { g: true }), rec("c", "T", { g: true })], { pos: 1, negNum: 1, negDen: 3 });
  assert.deepEqual(g, { n: 3, right: 1, wrong: 2, net: 0.33, acc: 1 / 3 });
});

test("average difficulty out of 9", () => {
  assert.deepEqual(avgDifficulty(["E", "D", null]), { avg: 6, count: 2, total: 3 });
  assert.equal(avgDifficulty([null]), null);
});

test("insights fire only with enough data", () => {
  const counts = new Map([["T1", 50], ["T2", 40], ["T3", 10]]);
  const m = { pos: 1, negNum: 1, negDen: 3 };
  const few = findInsights({ records: [rec("q1", "T1")], questionCountByTopic: counts, marking: m });
  assert.ok(!few.some((i) => i.kind === "weakest"));
  assert.equal(few.find((i) => i.kind === "untouched").topicId, "T2");
  const recs = [];
  for (let i = 0; i < 6; i++) recs.push(rec(`w${i}`, "T1", { ok: i === 0 }));
  for (let i = 0; i < 12; i++) recs.push(rec(`g${i}`, "T2", { g: true, ok: i < 2, s: "Phys" }));
  const all = findInsights({ records: recs, questionCountByTopic: counts, marking: m });
  assert.equal(all[0].kind, "weakest");
  assert.equal(all[0].topicId, "T1");
  const guess = all.find((i) => i.kind === "guessing");
  assert.equal(guess.subjectId, "Phys");
  assert.ok(guess.net < 0);
  const day = 86400000; const now = 40 * day;
  const trendRecs = [];
  for (let i = 0; i < 8; i++) trendRecs.push(rec(`p${i}`, "T3", { ok: i < 3, at: now - 20 * day }));
  for (let i = 0; i < 8; i++) trendRecs.push(rec(`r${i}`, "T3", { ok: i < 7, at: now - 2 * day }));
  const tr = findInsights({ records: trendRecs, questionCountByTopic: counts, marking: m, now });
  assert.ok(tr.some((i) => i.kind === "improving" && i.topicId === "T3"));
});

test("trend has one point per test", () => {
  const atts = [{ id: "b", submittedAt: 2, answers: [rec("x", "T", { ok: true })] }, { id: "a", submittedAt: 1, answers: [rec("y", "T"), rec("z", "T", { ok: true })] }];
  assert.deepEqual(testTrend(atts).map((p) => [p.id, p.value]), [["a", 0.5], ["b", 1]]);
});
