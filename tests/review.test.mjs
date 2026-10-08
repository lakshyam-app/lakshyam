import test from "node:test";
import assert from "node:assert/strict";
import { mistakeQueue, dueIds, dayOf, GAPS, upcomingCounts } from "../src/domain/review.js";

const day = (d, h = 20) => new Date(2026, 9, d, h, 0).getTime(); // October 2026
const r = (questionId, at, ok, extra = {}) => ({ questionId, at, graded: true, selected: ok ? 0 : 1, isCorrect: ok, guessed: false, ...extra });

test("wrong → due next day; right moves through 3, 7, 21 days; then it leaves", () => {
  let q = mistakeQueue([r("a", day(1), false)]);
  assert.equal(q.get("a").dueDay, "2026-10-02");
  q = mistakeQueue([r("a", day(1), false), r("a", day(2), true)]);
  assert.deepEqual([q.get("a").step, q.get("a").dueDay], [1, "2026-10-05"]);
  const all = [r("a", day(1), false), r("a", day(2), true), r("a", day(5), true), r("a", day(12), true)];
  assert.equal(mistakeQueue(all).get("a").dueDay, dayOf(day(12), GAPS[3]));
  assert.equal(mistakeQueue([...all, r("a", day(30), true)]).has("a"), false);
  // wrong again starts over
  assert.equal(mistakeQueue([...all, r("a", day(13), false)]).get("a").step, 0);
});

test("blank answers don't count; right first time never enters; guesses are handled", () => {
  const q = mistakeQueue([
    r("blank", day(1), false, { selected: null }),
    r("ok", day(1), true),
    r("guess", day(1), true, { guessed: true }),
    r("ungraded", day(1), false, { graded: false })
  ]);
  assert.deepEqual([...q.keys()], ["guess"]);
  assert.equal(q.get("guess").step, 1);
  const kept = mistakeQueue([r("x", day(1), false), r("x", day(2), true, { guessed: true })]).get("x");
  assert.equal(kept.step, 0);
});

test("stop reviewing ignores what came before; a later mistake brings it back", () => {
  const recs = [r("a", day(1), false)];
  assert.equal(mistakeQueue(recs, new Map([["a", day(1) + 1]])).has("a"), false);
  assert.equal(mistakeQueue([...recs, r("a", day(3), false)], new Map([["a", day(1) + 1]])).has("a"), true);
});

test("due list: most overdue and most often wrong first; upcoming counts", () => {
  const q = mistakeQueue([r("old", day(1), false), r("new", day(5), false), r("twice", day(1), false), r("twice", day(1, 21), false), r("later", day(7), false)]);
  assert.deepEqual(dueIds(q, "2026-10-06"), ["twice", "old", "new"]);
  assert.deepEqual(upcomingCounts(q, "2026-10-06", 2), [{ day: "2026-10-07", n: 0 }, { day: "2026-10-08", n: 1 }]);
});
