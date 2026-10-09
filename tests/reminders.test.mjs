import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, normalizePrefs, inQuiet, pickForWake } from "../src/domain/reminders.js";

const say = (k, v = {}) => `${k}${Object.keys(v).length ? JSON.stringify(v) : ""}`;
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime(); // October 2026, phone's local time
const day = (d, extra = {}) => ({ date: `2026-10-${String(d).padStart(2, "0")}`, ttId: "tt1", blocks: [], studied: false, reviewed: false, ...extra });
const prefs = (p = {}) => ({ on: true, ...p });

test("off → nothing; quiet hours across midnight", () => {
  assert.deepEqual(buildPlan({ now: at(9, 6), prefs: { on: false }, say, days: [day(9)] }), []);
  const q = normalizePrefs({}).quiet;
  assert.equal(inQuiet(at(9, 23), q), true); assert.equal(inQuiet(at(9, 5), q), true); assert.equal(inQuiet(at(9, 12), q), false);
});

test("block check-ins at block ends, not for breaks or marked blocks", () => {
  const blocks = [
    { id: "b1", start: "09:00", end: "09:50", kind: "study", title: "History", topics: "Mughals" },
    { id: "b2", start: "09:50", end: "10:00", kind: "break", title: "Break" },
    { id: "b3", start: "10:00", end: "10:50", kind: "study", title: "Polity", marked: true }
  ];
  const p = buildPlan({ now: at(9, 6), prefs: prefs({ kinds: { morning: false, question: 0, rescue: false, review: false, weekly: false, backup: false } }), say, days: [day(9, { blocks })] });
  assert.deepEqual(p.map((x) => [x.kind, new Date(x.at).getHours(), new Date(x.at).getMinutes()]), [["block", 9, 50]]);
  assert.deepEqual(p[0].data, { ttId: "tt1", date: "2026-10-09", bid: "b1" });
  assert.deepEqual(p[0].actions.map((a) => a.action), ["done", "skipped"]);
});

test("rescue only when not studied; review only when not reviewed; past times skipped", () => {
  const p = buildPlan({ now: at(9, 21), prefs: prefs({ kinds: { block: false, morning: false, question: 0, weekly: false, backup: false } }), say,
    days: [day(9, { studied: false }), day(10, { studied: true, reviewed: true })] });
  // 9th: rescue 20:30 already past; review 21:45 still ahead. 10th: studied and reviewed → nothing.
  assert.deepEqual(p.map((x) => x.kind), ["review"]);
});

test("daily limit keeps the most useful; spacing; quiet hours", () => {
  const blocks = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, start: `${String(8 + i).padStart(2, "0")}:00`, end: `${String(8 + i).padStart(2, "0")}:50`, kind: "study", title: `S${i}` }));
  const p = buildPlan({ now: at(9, 6), prefs: prefs({ max: 5, kinds: { question: 0, weekly: false, backup: false } }), say, days: [day(9, { blocks })] });
  assert.equal(p.length, 5);
  assert.ok(p.every((x) => x.kind === "block"));
  const two = buildPlan({ now: at(9, 6), prefs: prefs({ times: { morning: "09:50" }, kinds: { question: 0, rescue: false, review: false, weekly: false, backup: false } }), say,
    days: [day(9, { blocks: [{ id: "b", start: "09:00", end: "09:50", kind: "study", title: "X" }] })] });
  assert.equal(two.length, 2); assert.ok(two[1].at - two[0].at >= 6 * 60000);
  const late = buildPlan({ now: at(9, 6), prefs: prefs({ times: { review: "23:15" }, kinds: { block: false, morning: false, question: 0, rescue: false, weekly: false, backup: false } }), say, days: [day(9)] });
  assert.equal(late.length, 0);
});

test("questions carry the answer key; milestones in the morning; weekly on Sunday; backup once", () => {
  const qs = [{ id: "q1", text: "Which Act introduced separate electorates?", options: ["1892", "1909", "1919", "1935"], answerIndex: 1 }, { id: "q2", text: "Q2?", options: ["a", "b"], answerIndex: 0 }];
  const p = buildPlan({ now: at(10, 6), prefs: prefs({ kinds: { block: false, rescue: false, review: false, question: 2 } }), say, questions: qs,
    exams: [{ name: "Degree Mains", at: at(17, 10) }], dueCount: 12, lastBackupAt: at(1, 9),
    days: [day(10), day(11)] });
  const q = p.filter((x) => x.kind === "question");
  assert.equal(q.length, 2); assert.equal(q[0].data.key, "B) 1909"); assert.match(q[0].body, /A\) 1892/); assert.equal(q[0].url, "#/today?go=q&id=q1");
  const m = p.find((x) => x.kind === "morning");
  assert.match(m.title, /milestone.*"n":7/); assert.match(m.body, /"n":12/);
  assert.equal(p.filter((x) => x.kind === "weekly").length, 1); // 11 Oct 2026 is a Sunday
  assert.equal(p.filter((x) => x.kind === "backup").length, 1);
});

test("pause; pick the reminder a wake-up is for", () => {
  const p = buildPlan({ now: at(9, 6), prefs: prefs({ pauseUntil: at(10, 0), kinds: { question: 0, weekly: false, backup: false } }), say, days: [day(9), day(10)] });
  assert.ok(p.every((x) => x.at >= at(10, 0)));
  const items = [{ id: "a", at: at(9, 9) }, { id: "b", at: at(9, 9, 10) }];
  assert.equal(pickForWake(items, [], at(9, 9, 2)).id, "a");
  assert.equal(pickForWake(items, ["a"], at(9, 9, 2)).id, "b");
  assert.equal(pickForWake(items, [], at(9, 12)), null);
});
