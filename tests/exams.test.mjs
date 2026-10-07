import test from "node:test";
import assert from "node:assert/strict";
import * as X from "../src/domain/exams.js";

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const now = at(2026, 10, 7, 20, 0);
const list = X.normalizeList([
  { id: "a", name: "LDC", date: "2026-12-01" },
  { id: "b", name: "Degree prelims", date: "2026-10-20", time: "07:30", syllabusId: "s1" },
  { id: "c", name: "Old", date: "2026-09-01" },
  { id: "d", name: "Today", date: "2026-10-07", time: "10:00" },
  { id: "bad", name: "x", date: "2026-13-40" },
  { id: "e", name: "VEO", date: "2027-01-15" }
]);

test("bad records are dropped and the list is capped", () => {
  assert.equal(list.length, 5);
  assert.equal(X.normalizeList(Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, date: "2027-01-01" }))).length, X.MAX_EXAMS);
  assert.equal(X.normalizeList("nope").length, 0);
});

test("an exam stays until its day ends; finished ones go last", () => {
  assert.deepEqual(X.upcoming(list, now).map((e) => e.id), ["d", "b", "a", "e"]);
  assert.deepEqual(X.finished(list, now).map((e) => e.id), ["c"]);
  assert.equal(X.isOver(list.find((e) => e.id === "d"), at(2026, 10, 8, 0, 0)), true);
});

test("Today: nearest N, or the picked ones in date order", () => {
  assert.deepEqual(X.forToday(list, { mode: "next", count: 2 }, now).map((e) => e.id), ["d", "b"]);
  assert.deepEqual(X.forToday(list, { mode: "chosen", ids: ["e", "a", "c"] }, now).map((e) => e.id), ["a", "e"]);
  assert.deepEqual(X.normalizeDisplay({ mode: "zzz", count: 7, layout: "x" }), X.DEFAULT_DISPLAY);
});

test("nearest exam for a syllabus prefers a linked one", () => {
  assert.equal(X.nearestFor(list, "s1", now).id, "b");
  assert.equal(X.nearestFor(list, "s2", now).id, "d");
});

test("old one-per-syllabus exams are read", () => {
  const old = X.legacyExams([{ id: "s1", name: "Degree", exam: { date: "2026-11-02", time: "", name: "" } }, { id: "s2", name: "LGS", exam: null }]);
  assert.deepEqual(old, [{ id: "exam:s1", name: "Degree", date: "2026-11-02", time: "", syllabusId: "s1" }]);
});
