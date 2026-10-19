// 1.26: blanks you never opened don't count; small tests stay off the trend line; when a guess pays off.
// Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { notOpened, countedAnswers, answerRecords, summarize, testTrend, ruleOutForGuess } from "../src/domain/stats.js";
import { gradeTest } from "../src/domain/testing.js";
import { analysisInput } from "../src/domain/test-analysis.js";

const M = { pos: 1, negNum: 1, negDen: 3 };
const blank = (extra = {}) => ({ questionId: "q", graded: true, selected: null, isCorrect: false, ...extra });

test("which blanks count: opened ones do, never-opened ones don't", () => {
  assert.equal(notOpened(blank({ opened: false }), {}), true);
  assert.equal(notOpened(blank({ opened: true }), {}), false);
  assert.equal(notOpened({ ...blank(), selected: 2 }, {}), false, "an answer is never 'not opened'");
  // Lakshyam tests before 1.26: no flag, told by time (every question you were on has time)
  assert.equal(notOpened(blank({ timeMs: null }), {}), true);
  assert.equal(notOpened(blank({ timeMs: 4200 }), {}), false);
  // Imported from PSC Exam Vault: can't tell, so it stays as it was
  assert.equal(notOpened(blank({ timeMs: null }), { oldId: "123" }), false);
  // Time ran out: unreached questions count as left, as in the real exam
  assert.equal(notOpened(blank({ opened: false }), { autoSubmitted: true }), false);
  // Not scored at all: not this rule's business
  assert.equal(notOpened({ ...blank({ opened: false }), graded: false }, {}), false);
});

test("a test ended after 1 answer doesn't drag the stats down", () => {
  const a = { id: "t", status: "submitted", submittedAt: 2, marking: M, answers: [
    { questionId: "a", graded: true, selected: 1, isCorrect: false, timeMs: 3000, opened: true },
    ...Array.from({ length: 86 }, (_, i) => blank({ questionId: `b${i}`, opened: false }))
  ] };
  const old = { id: "o", status: "submitted", submittedAt: 1, marking: M, answers: [
    { questionId: "x", graded: true, selected: 0, isCorrect: true, timeMs: 5000 },
    blank({ questionId: "y", timeMs: 2000 })
  ] };
  assert.equal(countedAnswers(a).length, 1);
  const recs = answerRecords([a, old]);
  assert.deepEqual(recs.map((r) => r.questionId), ["x", "y", "a"]);
  const s = summarize(recs, M);
  assert.equal(s.n, 3); assert.equal(s.blank, 1); assert.equal(Math.round(s.attempted * 100), 67);
});

test("grading records whether each question was on screen", () => {
  const qs = ["a", "b", "c"].map((id) => ({ id, options: ["1", "2"], answerIndex: 0 }));
  const run = { answers: { a: 0 }, timeSpent: { a: 900 }, seen: { b: true } };
  const g = gradeTest(qs, run, M);
  assert.deepEqual(g.answers.map((r) => r.opened), [true, true, false]);
});

test("the AI isn't told about questions you never opened", () => {
  const a = { scope: { label: "T" }, netScore: 1, marking: M, counts: { correct: 1, wrong: 0, unanswered: 3, total: 4 }, answers: [
    { questionId: "a", graded: true, selected: 0, isCorrect: true, timeMs: 5000, correct: 0 },
    blank({ questionId: "b", opened: true, correct: 0 }), blank({ questionId: "c", opened: false, correct: 0 }), blank({ questionId: "d", opened: false, correct: 0 })
  ] };
  const q = (id) => ({ id, text: `Q ${id}`, options: ["x", "y"], answerIndex: 0, topicId: "t" });
  const { facts, lines } = analysisInput(a, { questionOf: q, topicOf: () => "Topic" });
  const f = facts.join("\n");
  assert.match(f, /right 1, wrong 0, left blank 1/);
  assert.match(f, /ended early: 2 more questions were never opened/);
  assert.equal(lines.length, 1); assert.match(lines[0], /^#2 /); // numbered as in the test
});

test("tests with only a few answers stay off the trend line", () => {
  const t1 = { id: "1", status: "submitted", submittedAt: 1, answers: Array.from({ length: 6 }, (_, i) => ({ graded: true, selected: 0, isCorrect: i < 3 })) };
  const t2 = { id: "2", status: "submitted", submittedAt: 2, answers: Array.from({ length: 3 }, () => ({ graded: true, selected: 0, isCorrect: false })) };
  assert.deepEqual(testTrend([t1, t2], () => true, { min: 5 }).map((p) => p.id), ["1"]);
  assert.equal(testTrend([t1, t2]).length, 2, "without a minimum every test is a point");
});

test("how many options to rule out before a guess pays off", () => {
  assert.equal(ruleOutForGuess({ pos: 1, negNum: 1, negDen: 3 }), 1);  // −⅓: rule out one of four
  assert.equal(ruleOutForGuess({ pos: 1, negNum: 1, negDen: 4 }), 0);  // −¼: a blind guess already pays
  assert.equal(ruleOutForGuess({ pos: 1, negNum: 1, negDen: 2 }), 2);  // −½: rule out two
  assert.equal(ruleOutForGuess({ pos: 1, negNum: 0, negDen: 1 }), 0);  // no negative marks
});

import { revisedByTest, REVISION_MIN } from "../src/domain/study.js";
test("a good test on a due topic counts as its revision", () => {
  const now = Date.UTC(2026, 9, 19);
  const due = { studiedCount: 2, nextReviewAt: now - 86400000 };
  const notDue = { studiedCount: 1, nextReviewAt: now + 86400000 };
  const neverStudied = { studiedCount: 0, nextReviewAt: null };
  const ans = (topicId, n, right) => Array.from({ length: n }, (_, i) => ({ topicId, graded: true, selected: 0, isCorrect: i < right }));
  const states = { a: due, b: due, c: notDue, d: neverStudied, e: due };
  const answers = [...ans("a", 10, 7), ...ans("b", 10, 5), ...ans("c", 10, 10), ...ans("d", 10, 10), ...ans("e", REVISION_MIN - 1, 7)];
  assert.deepEqual(revisedByTest(answers, (id) => states[id], now), ["a"]);
  // blanks don't count as answers
  assert.deepEqual(revisedByTest([...ans("a", 6, 6), { topicId: "a", graded: true, selected: null }, { topicId: "a", graded: true, selected: null }], (id) => states[id], now), []);
});

import { isStubborn, missedTimes, STUBBORN } from "../src/data/history.js";
test("a stubborn question: missed 3 times and still not right", () => {
  const w = { right: false, blank: false }; const r = { right: true, blank: false }; const b = { right: false, blank: true };
  assert.equal(STUBBORN, 3);
  assert.equal(missedTimes([w, b, w, r]), 2, "blanks aren't misses");
  assert.equal(isStubborn([w, w, w]), true);
  assert.equal(isStubborn([w, w, b, w]), true);
  assert.equal(isStubborn([w, w, w, r]), false, "got it right at last");
  assert.equal(isStubborn([w, w]), false);
});

import { repeatGroups } from "../src/domain/repeats.js";
test("repeated questions are found across papers, in the same subject", () => {
  const q = (id, paperId, text, answer = "x", subjectId = "s1") => ({ id, paperId, subjectId, text, options: [answer, "other"], answerIndex: 0 });
  const g = repeatGroups([
    q("a", "p1", "Who was the first Chief Minister of Kerala state?", "EMS"),
    q("b", "p2", "The first Chief Minister of Kerala state was", "EMS"),
    q("c", "p3", "Who was the first Governor of Kerala?", "B. Ramakrishna Rao"),
    q("d", "p1", "Who was the first Chief Minister of Kerala state?", "EMS"), // same paper as a: not "again"
    q("e", "p4", "Who was the first Chief Minister of Kerala state?", "EMS", "s2") // another subject
  ]);
  // d is the same question in a's paper; it's in the group through b (asked in 2 papers in all)
  assert.deepEqual([...(g.get("a") || [])].sort(), ["a", "b", "d"]);
  assert.equal(g.has("c"), false);
  assert.equal(g.has("e"), false);
});

import { changesOverTime } from "../src/domain/current.js";
test("⏳ only for answers that depend on when they're asked", () => {
  const q = (text) => ({ text });
  assert.equal(changesOverTime(q("Who is the present Governor of Kerala?")), true);
  assert.equal(changesOverTime(q("The recent Amendment of LIC Act of 1956 was done by way of")), true);
  assert.equal(changesOverTime(q("Who is the current Chief Justice of India?")), true);
  assert.equal(changesOverTime(q("നിലവിലെ കേരള ഗവർണർ ആര്?")), true);
  assert.equal(changesOverTime(q("Who was appointed as the first Governor General of India?")), false);
  assert.equal(changesOverTime(q("Madras is now known as")), false);
  assert.equal(changesOverTime(q("The SI unit of electric current is")), false);
  assert.equal(changesOverTime(q("She has recently ___ her exams."), { subject: "General English" }), false);
  assert.equal(changesOverTime(q("Identify the present tense form")), false);
  assert.equal(changesOverTime(q("ഐ.ടി. ആക്റ്റ് നിലവിൽ വന്ന വർഷം ഏത്?")), false); // "came into force"
  assert.equal(changesOverTime(q("കേരള സാഹിത്യ അക്കാദമിയുടെ ഇപ്പോഴത്തെ അദ്ധ്യക്ഷൻ ആരാണ്?")), true);
});

import { lookAlikePairs, nameSimilarity } from "../src/domain/names-alike.js";
import { tidyTask } from "../src/ai/prompts.js";
test("look-alike subject names are found, different ones aren't", () => {
  assert.equal(nameSimilarity("Important Acts General Acts", "Important Acts – General"), 1);
  assert.ok(nameSimilarity("Important Acts – Education Policy", "Important Acts – General") < 0.75);
  assert.ok(nameSimilarity("Social Reform Movements (India)", "Social & Religious Reform Movements (Kerala)") < 0.75);
  const pairs = lookAlikePairs([{ id: 1, name: "Important Acts General Acts" }, { id: 2, name: "Important Acts – General" }, { id: 3, name: "History" }]);
  assert.deepEqual(pairs.map((p) => [p.a.id, p.b.id]), [[1, 2]]);
  const task = tidyTask("History", [{ key: "T1", name: "Travancore History" }], [{ n: 1, text: "Who built the Padmanabhapuram palace?", options: ["A", "B"] }]);
  assert.match(task, /T1: Travancore History/); assert.match(task, /"T0"/);
});

import { planPapersAdd, readPapersPack, PAPERS_FORMAT } from "../src/data/share.js";
import { checksum } from "../src/data/backup.js";
test("shared papers only add what the other phone doesn't have", () => {
  const data = {
    syllabi: [{ id: "syl:a", name: "Degree Mains" }, { id: "syl:b", name: "10th level" }],
    subjects: [{ id: "sub:history", name: "History" }, { id: "sub:geo", name: "Geography" }],
    topics: [{ id: "top:history:x", subjectId: "sub:history", name: "X" }, { id: "top:geo:y", subjectId: "sub:geo", name: "Y" }],
    papers: [{ id: "pap:1", syllabusId: "syl:a", name: "01/21" }, { id: "pap:2", syllabusId: "syl:a", name: "02/22" }, { id: "pap:3", syllabusId: "syl:b", name: "03/23" }],
    questions: [{ id: "q:1:1", paperId: "pap:1", subjectId: "sub:history", text: "a", options: ["x", "y"] }, { id: "q:2:1", paperId: "pap:2", subjectId: "sub:geo", text: "b", options: ["x", "y"] }, { id: "q:3:1", paperId: "pap:3", subjectId: "sub:geo", text: "c", options: ["x", "y"] }]
  };
  // The other phone already has paper 1, the History subject, and its own "Degree mains" (another id).
  const have = { syllabi: [{ id: "syl:mine", name: "degree mains" }], ids: { subjects: new Set(["sub:history"]), topics: new Set(["top:history:x"]), papers: new Set(["pap:1"]), questions: new Set(["q:1:1"]) } };
  const plan = planPapersAdd(data, have);
  assert.deepEqual(plan.add.papers.map((p) => [p.id, p.syllabusId]), [["pap:2", "syl:mine"], ["pap:3", "syl:b"]]);
  assert.deepEqual(plan.add.questions.map((q) => q.id), ["q:2:1", "q:3:1"]);
  assert.deepEqual(plan.add.syllabi.map((s) => s.id), ["syl:b"]);
  assert.deepEqual(plan.add.subjects.map((s) => s.id), ["sub:geo"]);
  assert.equal(plan.already.papers, 1);
  // a damaged or odd file is caught
  const ok = readPapersPack({ format: PAPERS_FORMAT, data, checksum: checksum(JSON.stringify(data)) });
  assert.equal(ok.ok, true); assert.equal(ok.damaged, false);
  const bad = readPapersPack({ format: PAPERS_FORMAT, data: { ...data, questions: [{ id: "q", paperId: "pap:1", text: 5 }] }, checksum: "x" });
  assert.equal(bad.data.questions.length, 0); assert.equal(bad.damaged, true);
  assert.equal(readPapersPack({ format: "lakshyam-backup" }).ok, false);
});

import { likelyRange } from "../src/domain/stats.js";
import { normalizeExam } from "../src/domain/exams.js";
test("likely marks per 100 with a range; a target on an exam", () => {
  const M = { pos: 1, negNum: 1, negDen: 3 };
  const recs = Array.from({ length: 100 }, (_, i) => ({ questionId: `q${i}`, graded: true, at: i, selected: i % 10 < 8 ? 0 : null, isCorrect: i % 10 < 6 }));
  // 60 right, 20 wrong (−⅓ each), 20 left → 60 − 6.67 = 53.3 per 100
  const r = likelyRange(recs, M);
  assert.equal(r.per100, 53.3); assert.ok(r.low < 53.3 && r.high > 53.3 && r.high - r.low < 20);
  assert.equal(likelyRange(recs.slice(0, 10), M), null, "too few answers");
  assert.equal(normalizeExam({ date: "2026-12-01", name: "LDC", target: "62.5" }).target, 62.5);
  assert.equal(normalizeExam({ date: "2026-12-01", name: "LDC", target: "" }).target, undefined);
  assert.equal(normalizeExam({ date: "2026-12-01", name: "LDC", target: 140 }).target, undefined);
});

import { whyStats } from "../src/domain/stats.js";
test("why wrong answers went wrong", () => {
  const w = (why) => ({ graded: true, selected: 1, isCorrect: false, why });
  const s = whyStats([w("misread"), w("changed"), w("know"), w(undefined), { graded: true, selected: 0, isCorrect: true, why: "know" }]);
  assert.deepEqual([s.know, s.mix, s.misread, s.changed, s.tagged, s.wrong, s.careless], [1, 0, 1, 1, 3, 4, 2]);
});
