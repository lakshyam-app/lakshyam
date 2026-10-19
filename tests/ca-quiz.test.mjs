// 1.26: monthly current-affairs quiz — months, the checks made in code, and reading a reply that was cut off.
// Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { monthChoices, monthRange, monthKey, isMonthKey, monthName, realDay, dateCheck, regionOf, textKey, startsTicked,
  salvageObjects, caGroups, isCaSubject } from "../src/domain/ca-quiz.js";
import { caQuizTask, caCheckTask, CA_SYSTEM, CA_CHECK_SYSTEM, WEB_RULES } from "../src/ai/prompts.js";

const now = new Date(2026, 9, 19); // 19 Oct 2026

test("months to pick: this month (so far) and the five before it, across a year end", () => {
  assert.deepEqual(monthChoices(now).map((m) => m.key), ["2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"]);
  assert.equal(monthChoices(now)[0].partial, true);
  assert.equal(monthChoices(now)[1].partial, false);
  assert.deepEqual(monthChoices(new Date(2027, 0, 5), 3).map((m) => m.key), ["2027-01", "2026-12", "2026-11"]);
  assert.equal(monthKey(now), "2026-10");
  assert.ok(isMonthKey("2026-09") && !isMonthKey("2026-13") && !isMonthKey("26-09") && !isMonthKey(null));
});

test("a month's dates: whole month, February, and this month only up to today", () => {
  assert.deepEqual(monthRange("2026-09", now), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(monthRange("2028-02", new Date(2028, 5, 1)), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(monthRange("2026-10", now), { from: "2026-10-01", to: "2026-10-19" });
  assert.equal(monthName("2026-09"), "September 2026");
});

test("date check: in the month, outside it, or no real date", () => {
  const r = monthRange("2026-09", now);
  assert.equal(dateCheck("2026-09-01", r), "ok");
  assert.equal(dateCheck("2026-09-30", r), "ok");
  assert.equal(dateCheck("2026-08-31", r), "off");
  assert.equal(dateCheck("2026-10-01", r), "off");
  assert.equal(dateCheck("2026-09-31", r), "none", "no 31 September");
  assert.equal(dateCheck("September 2026", r), "none");
  assert.equal(dateCheck(undefined, r), "none");
  // this month: a date after today can't be news yet
  assert.equal(dateCheck("2026-10-25", monthRange("2026-10", now)), "off");
  assert.equal(realDay(" 2026-09-14T00:00"), "2026-09-14");
});

test("regions, same-question key, and which questions start ticked", () => {
  assert.equal(regionOf(" Kerala "), "kerala");
  assert.equal(regionOf("asia"), null);
  assert.equal(textKey("In September 2026, who won?"), textKey("in september  2026 who won"));
  const ok = { dateCheck: "ok", src: { url: "https://x.gov.in" }, check: "agree" };
  assert.equal(startsTicked(ok), true);
  assert.equal(startsTicked({ ...ok, check: "none" }), true, "a second check that couldn't run doesn't untick");
  assert.equal(startsTicked({ ...ok, check: "disagree" }), false);
  assert.equal(startsTicked({ ...ok, check: "unclear" }), false);
  assert.equal(startsTicked({ ...ok, src: null }), false, "no source page");
  assert.equal(startsTicked({ ...ok, dateCheck: "off" }), false);
  assert.equal(startsTicked({ ...ok, dateCheck: "none" }), false);
});

test("a reply cut off mid-question keeps the complete ones (quotes and braces inside text are fine)", () => {
  const cut = `Here: [{"question_text":"A {b}?","options":["x","y \\"z\\""],"correct_answer_index":0},{"question_text":"B?","options":["p"`;
  const got = salvageObjects(cut);
  assert.equal(got.length, 1);
  assert.equal(got[0].question_text, "A {b}?");
  assert.deepEqual(salvageObjects('{"questions":[{"question_text":"Q1","options":["a","b"]},{"question_text":"Q2","options":["a","b"]}'), [
    { question_text: "Q1", options: ["a", "b"] }, { question_text: "Q2", options: ["a", "b"] }]);
  assert.deepEqual(salvageObjects("no json"), []);
});

test("saved quizzes grouped by month, newest first; other AI questions left out", () => {
  const q = (id, ca) => ({ id, sourceRef: ca ? { ca } : null });
  const g = caGroups([q("a", "2026-08"), q("b", "2026-09"), q("c", null), q("d", "2026-09"), q("e", "bad")]);
  assert.deepEqual(g.map((x) => [x.key, x.questions.map((y) => y.id)]), [["2026-09", ["b", "d"]], ["2026-08", ["a"]]]);
});

test("Current Affairs subject found by English or Malayalam name", () => {
  assert.ok(isCaSubject({ name: "Current Affairs" }));
  assert.ok(isCaSubject({ name: "x", nameMl: "ആനുകാലികം" }));
  assert.ok(!isCaSubject({ name: "History" }));
  assert.ok(!isCaSubject(null));
});

test("prompts: from the web only, the month and its dates, regions, topics, repeats to avoid; the check searches too", () => {
  const task = caQuizTask({ month: "September 2026", from: "2026-09-01", to: "2026-09-30", regions: ["kerala", "world"], topics: [{ key: "T1", name: "Kerala Current Affairs" }], n: 10, avoid: ["Who won the X Award?"] });
  assert.match(task, /MONTH: September 2026 \(2026-09-01 to 2026-09-30\)/);
  assert.match(task, /Kerala: state government/);
  assert.doesNotMatch(task, /India: Union/);
  assert.match(task, /T1: Kerala Current Affairs/);
  assert.match(task, /ALREADY ASKED[\s\S]*Who won the X Award\?/);
  assert.match(task, /"date":"YYYY-MM-DD/);
  assert.match(task, /"source":/);
  assert.match(task, /never use "current", "present", "now", "recently" or "latest"/);
  assert.ok(CA_SYSTEM.includes(WEB_RULES) && CA_CHECK_SYSTEM.includes(WEB_RULES));
  assert.match(caQuizTask({ month: "October 2026", from: "2026-10-01", to: "2026-10-19", partial: true, regions: ["india"], topics: [], n: 20 }), /the month so far/);
  const check = caCheckTask([{ text: "Q?", options: ["a", "b", "c", "d"] }], "September 2026");
  assert.match(check, /news of September 2026/);
  assert.match(check, /#1 Q\?/);
});
