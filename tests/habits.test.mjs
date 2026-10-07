// Made-up data only (this repo is public).
import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDate, streak, weekDots, nextSteps } from "../src/domain/habits.js";

test("dates move across months and years", () => {
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDate("2025-12-31", 1), "2026-01-01");
});

test("streak counts back from today, or from yesterday if today isn't done yet", () => {
  const days = new Set(["2026-10-04", "2026-10-05", "2026-10-06"]);
  assert.deepEqual(streak(days, "2026-10-06"), { count: 3, todayDone: true, alive: true, missedYesterday: false });
  assert.deepEqual(streak(days, "2026-10-07"), { count: 3, todayDone: false, alive: true, missedYesterday: false });
  assert.deepEqual(streak(days, "2026-10-08"), { count: 0, todayDone: false, alive: false, missedYesterday: true });
  assert.equal(streak(new Set(), "2026-10-08").missedYesterday, false);
});

test("week dots run Monday to Sunday", () => {
  const dots = weekDots(new Set(["2026-10-05", "2026-10-07"]), "2026-10-07"); // a Wednesday
  assert.equal(dots[0].date, "2026-10-05");
  assert.deepEqual(dots.map((d) => d.active), [true, false, true, false, false, false, false]);
  assert.equal(dots[2].isToday, true);
  assert.equal(dots[3].future, true);
});

test("next steps: due first, then weak, then untouched; no duplicates; needs scorable questions", () => {
  const steps = nextSteps({
    due: [{ topicId: "B", nextReviewAt: 5 }, { topicId: "A", nextReviewAt: 1 }],
    weak: [{ topicId: "C", freq: 10, accuracy: 0.4, pct: 0.4 }, { topicId: "A", freq: 50, accuracy: 0.3, pct: 0.3 }, { topicId: "D", freq: 50, accuracy: 0.9, pct: 0.9 }],
    untouched: [{ topicId: "E", freq: 3 }, { topicId: "F", freq: 30 }],
    gradable: new Map([["A", 5], ["B", 5], ["C", 5], ["D", 5], ["E", 5], ["F", 0]])
  });
  assert.deepEqual(steps.map((s) => `${s.kind}:${s.topicId}`), ["due:A", "due:B", "weak:C", "new:E"]);
});
