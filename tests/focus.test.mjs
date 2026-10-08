import test from "node:test";
import assert from "node:assert/strict";
import { addLeave, cleanFocus, withResiduals, bestTime, slotOf, focusSummary, suggestDnd, MIN_AWAY_MS, MAX_AWAY_MS } from "../src/domain/focus.js";

test("leaves: short glances don't count; long ones are capped", () => {
  assert.deepEqual(addLeave(null, MIN_AWAY_MS - 1), { n: 0, ms: 0 });
  assert.deepEqual(addLeave(null, 8000), { n: 1, ms: 8000 });
  assert.deepEqual(addLeave({ n: 1, ms: 8000 }, 3 * 3600000), { n: 2, ms: 8000 + MAX_AWAY_MS });
  assert.deepEqual(addLeave({ n: "x", ms: -5 }, 6000), { n: 1, ms: 6000 });
});

test("cleanFocus rejects junk from a backup", () => {
  assert.equal(cleanFocus(null), null);
  assert.equal(cleanFocus("3"), null);
  assert.deepEqual(cleanFocus({ n: -2, ms: "abc" }), { n: 0, ms: 0 });
  assert.deepEqual(cleanFocus({ n: 2.7, ms: 1000 }), { n: 2, ms: 1000 });
});

test("slots by hour", () => {
  assert.equal(slotOf(5), "early"); assert.equal(slotOf(9), "morning"); assert.equal(slotOf(13), "afternoon");
  assert.equal(slotOf(18), "evening"); assert.equal(slotOf(22), "night"); assert.equal(slotOf(2), "late");
});

// n answers on a topic at an hour, `right` of them correct, spread over `tests` tests
const make = (topicId, hour, n, right, tests, tag) => Array.from({ length: n }, (_, i) => ({
  topicId, hour, isCorrect: i < right, timeMs: 20000, attemptId: `${tag}-${i % tests}`
}));

test("residuals compare with your usual on the same topic", () => {
  const recs = withResiduals([...make("easy", 9, 100, 90, 2, "a"), ...make("hard", 21, 100, 30, 2, "b")]);
  const easyAvg = recs.filter((r) => r.topicId === "easy").reduce((s, r) => s + r.res, 0) / 100;
  assert.ok(Math.abs(easyAvg) < 0.05); // doing as usual on a topic ≈ 0, however easy the topic is
});

test("best time: hard topics at night aren't blamed on the night", () => {
  // Morning: easy topic 80%; night: hard topic 30%. Same as usual for each topic → no clear best time.
  const recs = [...make("easy", 9, 60, 48, 4, "m"), ...make("hard", 21, 60, 18, 4, "n"),
    ...make("easy", 21, 10, 8, 1, "n2"), ...make("hard", 9, 10, 3, 1, "m2")];
  const r = bestTime(recs);
  assert.equal(r.enoughSlots, 2);
  assert.equal(r.clear, false);
});

test("best time: a real gap on the same topics is found", () => {
  const recs = [...make("t", 9, 120, 102, 6, "m"), ...make("t", 21, 120, 66, 6, "n")]; // 85% vs 55%
  const r = bestTime(recs);
  assert.equal(r.best.id, "morning"); assert.equal(r.worst.id, "night"); assert.equal(r.clear, true);
});

test("best time: not enough data", () => {
  const r = bestTime(make("t", 9, 30, 20, 2, "m"));
  assert.equal(r.best, null); assert.equal(r.enoughSlots, 0);
});

test("focus summary: stayed vs left", () => {
  const attempts = [];
  const records = [];
  for (let i = 0; i < 4; i++) {
    attempts.push({ id: `s${i}`, submittedAt: i, focus: { n: 0, ms: 0 } });
    attempts.push({ id: `l${i}`, submittedAt: 10 + i, focus: { n: 2, ms: 60000 } });
    for (let k = 0; k < 25; k++) {
      records.push({ attemptId: `s${i}`, topicId: "t", isCorrect: k < 21 });
      records.push({ attemptId: `l${i}`, topicId: "t", isCorrect: k < 12 });
    }
  }
  attempts.push({ id: "old", submittedAt: 0 }); // before focus check: ignored
  const f = focusSummary(attempts, records);
  assert.equal(f.tests, 8); assert.equal(f.testsLeft, 4); assert.equal(f.leaves, 8); assert.equal(f.awayMs, 240000);
  assert.ok(f.enough && f.clear);
  assert.ok(f.stayed.vsUsual > f.left.vsUsual);
});

test("Do Not Disturb tip only after repeated leaving", () => {
  assert.equal(suggestDnd([{ submittedAt: 1, focus: { n: 1 } }]), false);
  assert.equal(suggestDnd([{ submittedAt: 1, focus: { n: 1 } }, { submittedAt: 2, focus: { n: 2 } }]), true);
  assert.equal(suggestDnd([{ submittedAt: 1, focus: { n: 1 } }, { submittedAt: 2, focus: { n: 0 } }, { submittedAt: 3, focus: { n: 0 } }]), false);
});
