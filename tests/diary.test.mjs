// Study diary scores and summaries. Made-up data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayScore, dayLevel, summarize, mondayOf } from "../src/domain/diary.js";

test("day score and level", () => {
  assert.equal(dayScore({ planned: 4, done: 4, questions: 30, correct: 15, topics: 3, goal: 30 }), 100);
  assert.equal(dayScore({ planned: 4, done: 2, questions: 0, topics: 0, goal: 30 }), 25);
  assert.equal(dayScore({ planned: 0, done: 0, questions: 15, correct: 5, topics: 1, goal: 30 }), 43);
  assert.equal(dayScore({ planned: 0, questions: 20, correct: 18, topics: 0, goal: 40 }), 35, "good accuracy adds 5");
  assert.equal(dayLevel({ planned: 3, done: 0, questions: 0, topics: 0 }), "missed");
  assert.equal(dayLevel({ planned: 0, done: 0, questions: 0, topics: 0 }), "none");
  assert.equal(dayLevel({ planned: 4, done: 4, questions: 30, correct: 10, topics: 3, goal: 30 }), "great");
  assert.equal(dayLevel({ planned: 0, questions: 5, correct: 1, topics: 0, goal: 30 }), "low");
});

test("week summary", () => {
  const days = [
    { date: "2026-10-05", facts: { planned: 4, done: 4, questions: 30, correct: 20, topics: 3, goal: 30, mood: 5 } },
    { date: "2026-10-06", facts: { planned: 4, done: 0, questions: 0, correct: 0, topics: 0, goal: 30, mood: 2 } },
    { date: "2026-10-07", facts: { planned: 0, done: 0, questions: 10, correct: 5, topics: 1, goal: 30 } }
  ];
  const s = summarize(days);
  assert.equal(s.studied, 2);
  assert.equal(s.missed, 1);
  assert.equal(s.planRate, 50);
  assert.equal(s.accuracy, 63);
  assert.equal(s.avgMood, 3.5);
  assert.equal(s.best.date, "2026-10-05");
  assert.equal(mondayOf("2026-10-11"), "2026-10-05");
  assert.equal(mondayOf("2026-10-05"), "2026-10-05");
});
