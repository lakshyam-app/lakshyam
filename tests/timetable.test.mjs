// Timetable logic. Made-up data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../src/domain/timetable.js";

let n = 0; const id = () => `x${++n}`;
const A = { id: "A", name: "Weekday", blocks: [{ id: "a1", start: "06:00", end: "07:00", kind: "study", subjectId: "s1" }, { id: "a2", start: "07:00", end: "07:15", kind: "break", breakType: "bath" }, { id: "a3", start: "18:00", end: "19:30", kind: "study", subjectId: "s2" }] };
const B = { id: "B", name: "Weekend", blocks: [{ id: "b1", start: "09:00", end: "12:00", kind: "test" }] };
const base = { id: "tt1", name: "Test", startDate: "2026-10-05", endDate: "2026-11-30", dayPlans: [A, B], overrides: {} };

test("times and dates", () => {
  assert.equal(T.toMin("06:30"), 390);
  assert.equal(T.toMin("24:00"), 1440);
  assert.equal(T.toMin("24:01"), null);
  assert.equal(T.toMin("7:5"), null);
  assert.equal(T.fromMin(390), "06:30");
  assert.equal(T.weekday("2026-10-05"), 1, "a Monday");
  assert.equal(T.weekday("2026-10-11"), 7);
  assert.equal(T.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(T.daysFrom("2026-10-05", "2026-10-12"), 7);
});

test("end date is capped at 6 months from today", () => {
  assert.equal(T.clampEnd("2026-10-07", "2028-01-01", "2026-10-07"), T.addDays("2026-10-07", T.MAX_DAYS));
  assert.equal(T.clampEnd("2026-10-07", "2026-10-01", "2026-10-07"), "2026-10-07", "end before start becomes the start");
});

test("which plan on which date: every day, by weekday (5+2), cycle (alternate), overrides, outside range", () => {
  const daily = { ...base, schedule: { mode: "daily", daily: "A" } };
  assert.equal(T.planIdFor(daily, "2026-10-09"), "A");
  assert.equal(T.planIdFor(daily, "2026-10-04"), null, "before start");
  assert.equal(T.planIdFor(daily, "2026-12-01"), null, "after end");
  const weekly = { ...base, schedule: { mode: "weekly", weekly: { 1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "B", 7: "B" } } };
  assert.equal(T.planIdFor(weekly, "2026-10-09"), "A");
  assert.equal(T.planIdFor(weekly, "2026-10-10"), "B");
  const cyc = { ...base, schedule: { mode: "cycle", cycle: ["A", "B"], cycleStart: "2026-10-05" } };
  assert.deepEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map((d) => T.planIdFor(cyc, d)), ["A", "B", "A", "B"]);
  const cyc3 = { ...base, schedule: { mode: "cycle", cycle: ["A", "A", T.OFF], cycleStart: "2026-10-07" } };
  assert.equal(T.planIdFor(cyc3, "2026-10-06"), T.OFF, "dates before the cycle start still follow the cycle");
  const ov = { ...weekly, overrides: { "2026-10-09": T.OFF, "2026-10-10": "A" } };
  assert.equal(T.planIdFor(ov, "2026-10-09"), T.OFF);
  assert.equal(T.planIdFor(ov, "2026-10-10"), "A");
  assert.equal(T.planFor(ov, "2026-10-09"), null);
  assert.equal(T.planFor(ov, "2026-10-10").name, "Weekday");
});

test("blocks: issues, minutes, now/next, running late", () => {
  const bad = [{ id: "1", start: "06:00", end: "07:00", kind: "study" }, { id: "2", start: "06:30", end: "06:45", kind: "break" }, { id: "3", start: "09:00", end: "08:00", kind: "test" }, { id: "4", start: "x", end: "10:00", kind: "study" }];
  const types = T.blockIssues(bad).map((i) => i.type).sort();
  assert.deepEqual(types, ["bad-time", "ends-before", "overlap"]);
  const m = T.planMinutes(A.blocks);
  assert.equal(m.byKind.study, 150);
  assert.equal(m.byKind.break, 15);
  assert.deepEqual(m.bySubject, { s1: 60, s2: 90 });
  assert.equal(T.blockAt(A.blocks, 390).current.id, "a1");
  assert.equal(T.blockAt(A.blocks, 390).next.id, "a2");
  assert.equal(T.blockAt(A.blocks, 600).current, null);
  assert.equal(T.blockAt(A.blocks, 600).next.id, "a3");
  const sh = T.shiftBlocks(A.blocks, { from: 360, by: 15 });
  assert.deepEqual(sh.map((b) => b.start), ["06:15", "07:15", "18:15"]);
  assert.equal(T.shiftBlocks(A.blocks, { from: 420, by: 15 })[0].start, "06:00");
});

test("range minutes over a week", () => {
  const weekly = { ...base, schedule: { mode: "weekly", weekly: { 1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "B", 7: T.OFF } } };
  const r = T.rangeMinutes(weekly, "2026-10-05", "2026-10-11");
  assert.equal(r.days, 6);
  assert.equal(r.bySubject.s1, 300);
  assert.equal(r.focus, 5 * 150 + 180);
});

test("instant build: fills windows, shares by weight, no subject twice in a row, ends with revision", () => {
  const blocks = T.autoBlocks({ windows: [{ start: "06:00", end: "08:00" }, { start: "18:00", end: "21:00" }], session: 50, gap: 10, subjects: [{ id: "s1", weight: 3 }, { id: "s2", weight: 1 }, { id: "s3", weight: 1 }], newId: id });
  assert.equal(T.blockIssues(blocks).length, 0);
  const study = blocks.filter((b) => b.kind === "study");
  assert.ok(study.length >= 3);
  assert.equal(blocks.filter((b) => b.kind !== "break").at(-1).kind, "revision");
  for (let i = 1; i < study.length; i++) assert.notEqual(study[i].subjectId, study[i - 1].subjectId, "never the same subject twice in a row here");
  const counts = {}; study.forEach((b) => { counts[b.subjectId] = (counts[b.subjectId] || 0) + 1; });
  assert.ok(counts.s1 >= counts.s2, "heavier subject gets more sessions");
  assert.ok(blocks.every((b) => T.toMin(b.start) >= 360 && T.toMin(b.end) <= 1260));
});

test("AI draft is checked: names mapped, times fixed, overlaps trimmed, schedule read", () => {
  const find = { newId: id, subject: (nm) => ({ history: "s1", geography: "s2" })[nm.toLowerCase()] || null, topic: (sid, nm) => (sid === "s1" && /travancore/i.test(nm) ? "t1" : null) };
  const json = { day_plans: [
    { name: "Weekday", blocks: [{ start: "06:00", end: "07:00", kind: "study", subject: "History", topics: ["Travancore History", "Made up"] }, { start: "06:30", end: "08:00", kind: "study", subject: "Geography" }, { start: "25:00", end: "26:00", kind: "study" }, { start: "13:00", end: "13:30", kind: "lunch" }, { start: "20:00", end: "21:00", kind: "study", subject: "Astrology" }] },
    { name: "Weekend", blocks: [{ start: "09:00", end: "10:00", kind: "test" }] }
  ], schedule: { mode: "weekly", weekly: { monday: "Weekday", tuesday: "Weekday", wednesday: "Weekday", thursday: "Weekday", friday: "Weekday", saturday: "Weekend", sunday: "off" } } };
  const d = T.readAiDraft(json, find);
  const wk = d.dayPlans[0];
  assert.equal(wk.blocks[0].subjectId, "s1");
  assert.deepEqual(wk.blocks[0].topicIds, ["t1"]);
  assert.equal(wk.blocks[1].start, "07:00", "overlap trimmed");
  assert.equal(wk.blocks.find((b) => b.start === "13:00").kind, "break");
  assert.equal(wk.blocks.find((b) => b.start === "13:00").breakType, "food");
  assert.equal(wk.blocks.find((b) => b.start === "20:00").label, "Astrology");
  assert.ok(d.issues.includes("bad-time") && d.issues.includes("overlap") && d.issues.includes("unknown-subject"));
  assert.equal(d.schedule.mode, "weekly");
  assert.equal(d.schedule.weekly[6], d.dayPlans[1].id);
  assert.equal(d.schedule.weekly[7], T.OFF);
  assert.equal(T.readAiDraft({}, find).issues[0], "no-plans");
});

test("calendar file: one event per block, reminders, escaping, folding, end at midnight", () => {
  const tt = { ...base, endDate: "2026-10-06", schedule: { mode: "daily", daily: "A" }, dayPlans: [{ ...A, blocks: [...A.blocks, { id: "a4", start: "23:00", end: "24:00", kind: "custom", label: "Read; news, notes" }] }] };
  const { text, count } = T.buildIcs(tt, "2026-10-05", "2026-10-06", { kinds: new Set(["study", "custom"]), alarm: 10, title: (b) => b.label || `Study ${b.subjectId} ${"long title ".repeat(10)}`, now: new Date(Date.UTC(2026, 9, 1)) });
  assert.equal(count, 6);
  assert.match(text, /BEGIN:VCALENDAR\r\n/);
  assert.match(text, /DTSTART:20261005T060000\r\n/);
  assert.match(text, /DTEND:20261006T000000/, "24:00 ends at the next midnight");
  assert.match(text, /TRIGGER:-PT10M/);
  assert.ok(text.includes("SUMMARY:Read\\; news\\, notes"), "special characters escaped");
  assert.ok(text.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), "lines folded");
  assert.ok(!/bath/.test(text), "breaks left out");
});

// 1.26.1: the routine's wake-up and bedtime bound the day; a long AI reply is still read
import { routineBounds, keepInsideDay, jsonWithKey } from "../src/domain/timetable.js";

test("wake-up and bedtime read from the routine (English and Malayalam)", () => {
  assert.deepEqual(routineBounds("Wake up at 6 am.  exercise and freshen up from 6 to 7. Breakfast at 8:30. Dinner at 7:30 pm"), { wake: 360, sleep: null });
  assert.deepEqual(routineBounds("e.g. wake 5:00, bath 7:00, office 9:30–5:30, dinner 8:30, sleep 10:30"), { wake: 300, sleep: 1350 });
  assert.deepEqual(routineBounds("5:00 ഉണരും, 7:00 കുളി, 10:30 ഉറക്കം"), { wake: 300, sleep: 1350 });
  assert.deepEqual(routineBounds("I get up at 5.30 and go to bed by 11 pm"), { wake: 330, sleep: 1380 });
  assert.deepEqual(routineBounds("sleep at 1 am, wake at 9"), { wake: 540, sleep: null }, "after midnight isn't a bound");
  assert.deepEqual(routineBounds("Exercise 6-7, lunch 1:30"), { wake: null, sleep: null });
  assert.deepEqual(routineBounds(""), { wake: null, sleep: null });
});

test("nothing before waking or after bedtime; the routine's own blocks stay; trimmed blocks don't overlap", () => {
  const blocks = [
    { start: "05:30", end: "06:00", kind: "study" },
    { start: "05:50", end: "06:40", kind: "study" },
    { start: "06:00", end: "07:00", kind: "break", breakType: "exercise", label: "Wake up, exercise and freshen up" },
    { start: "07:00", end: "07:30", kind: "study" },
    { start: "20:40", end: "21:30", kind: "study" },
    { start: "21:05", end: "21:30", kind: "revision" }
  ];
  const r = keepInsideDay(blocks, { wake: 360, sleep: 1275 });
  assert.deepEqual(r.blocks.map((b) => `${b.start}-${b.end} ${b.kind}`), ["06:00-07:00 break", "07:00-07:30 study", "20:40-21:15 study"]);
  assert.deepEqual(r.issues.sort(), ["after-sleep", "before-wake"]);
  assert.deepEqual(keepInsideDay(blocks, {}).blocks.length, blocks.length, "no routine times: unchanged");
});

test("the timetable JSON is found in a reply with words, fences, an echoed old draft, or a cut-off end", () => {
  assert.deepEqual(jsonWithKey('Old: {"day_plans":[1]}\nNew: ```json\n{"day_plans":[2],"notes":"a } b"}\n```', "day_plans"), { day_plans: [2], notes: "a } b" });
  assert.deepEqual(jsonWithKey('{"day_plans":[3],}', "day_plans"), { day_plans: [3] }, "trailing comma");
  assert.equal(jsonWithKey('{"day_plans":[{"name":"A","blocks":[{"start":"05', "day_plans"), null, "cut off");
  assert.equal(jsonWithKey('{"other":1}', "day_plans"), null);
});
