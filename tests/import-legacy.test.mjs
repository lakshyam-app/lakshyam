// Run with: node --test tests/
// Uses small made-up data only. Never put a real backup in this repo (it is public).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImportPlan } from "../src/data/import-legacy.js";
import { netScore, markingFromLegacy } from "../src/domain/scoring.js";
import { nameKey } from "../src/data/ids.js";

const sample = () => ({
  syllabuses: [{ id: "default", name: "Degree Mains", marking: { positive: 1, negNum: 1, negDen: 3 } }],
  papers: [
    {
      id: "p1", name: "101/2024", post_name: "LDC", syllabus_id: "default",
      questions: [
        { id: "q1", question_text: "Capital of Kerala?", options: ["A", "B", "C", "D"], correct_answer_index: 2, subject: "Geography", topic: "Kerala Physiography & Districts", flagged: true },
        { id: "q2", question_text: "ചോദ്യം", options: ["a", "b", "c", "d"], correct_answer_index: 5, subject: "Physics", topic: "Light Lens & Mirrors" },
        { id: "q3", question_text: "No key yet", options: ["a", "b", "c", "d"], correct_answer_index: null, subject: "Physics", topic: "Light, Lens & Mirrors", difficulty: "D", difficulty_manual: true },
        { id: "q4", question_text: "", options: ["a", "b"], subject: "Physics", topic: "Other" },
        { id: "q5", question_text: "Six options", options: ["a", "b", "c", "d", "e", "f"], correct_answer_index: 5, subject: "Physics", topic: "Other" }
      ]
    },
    { id: "ai-practice-default", name: "AI Practice Questions", syllabus_id: "default", questions: [
      { id: "ai1", question_text: "AI q", options: ["a", "b", "c", "d"], correct_answer_index: 0, subject: "Physics", topic: "Light, Lens & Mirrors", ai_generated: true }
    ] }
  ],
  attempts: [
    { id: "a1", type: "topic", scopeKey: "Physics|||Light Lens & Mirrors", scopeLabel: "Physics — Light", timestamp: "2026-10-01T10:00:00Z",
      answers: [{ paperId: "p1", qid: "q2", subject: "Physics", topic: "Light Lens & Mirrors", selectedIndex: 1, correctIndex: 1, isCorrect: true, isGraded: true }],
      correctCount: 4, wrongCount: 3, unansweredCount: 1, totalCount: 8, syllabus_id: "default", netScore: 3, marking: { positive: 1, negNum: 1, negDen: 3 } },
    { id: "a2", type: "paper", scopeKey: "p1", scopeLabel: "old test", timestamp: "2026-09-01T10:00:00Z",
      answers: [], correctCount: 2, wrongCount: 1, unansweredCount: 0, totalCount: 3, syllabus_id: "default" }
  ],
  banks: [{ id: "b1", name: "Mix", questionRefs: [{ paperId: "p1", qid: "q1" }, { paperId: "gone", qid: "q9" }] }],
  studyProgress: { "default::Physics|||Light, Lens & Mirrors": { count: 2, lastStudiedAt: 1, nextReviewAt: 2 }, "default::Physics|||Light Lens & Mirrors": 1 },
  topicLabels: { "Physics|||Light Lens & Mirrors": { name: "Red", color: "#b14b4b" } },
  topicLists: [{ id: "l1", name: "Weak", items: [{ subject: "Physics", topic: "Light Lens & Mirrors" }] }],
  listingNotes: { "topic:Physics|||Light Lens & Mirrors": { text: "Remember r = 2f", label: "Topic: Light" } },
  dailyActivity: { "2026-10-01": 3 }
});

test("rejects files that are not app backups", () => {
  assert.equal(buildImportPlan(null).ok, false);
  assert.equal(buildImportPlan({ foo: 1 }).ok, false);
});

test("does not change the input", () => {
  const input = sample();
  const before = JSON.stringify(input);
  buildImportPlan(input);
  assert.equal(JSON.stringify(input), before);
});

test("merges spelling variants into one topic, using the official spelling", () => {
  const { records, report } = buildImportPlan(sample());
  const light = records.topics.filter((t) => t.key === nameKey("Light, Lens & Mirrors"));
  assert.equal(light.length, 1);
  assert.equal(light[0].name, "Light, Lens & Mirrors");
  const qs = records.questions.filter((q) => q.topicId === light[0].id);
  assert.equal(qs.length, 3); // q2, q3 and the AI question
  assert.ok(report.mergedNames.some((m) => m.into === "Light, Lens & Mirrors"));
  // studied counts of both spellings end up on the same topic
  const ts = records.topicState.find((x) => x.topicId === light[0].id);
  assert.equal(ts.studiedCount, 3);
});

test("converts answers, deleted questions and skips broken ones with a reason", () => {
  const { records, report } = buildImportPlan(sample());
  const byOld = Object.fromEntries(records.questions.map((q) => [q.oldId, q]));
  assert.equal(byOld.q1.answerIndex, 2);
  assert.equal(byOld.q2.status, "deleted_by_psc");
  assert.equal(byOld.q2.lang, "ml");
  assert.equal(byOld.q3.answerIndex, null);
  assert.equal(byOld.q5.answerIndex, 5); // 6 options: F is a real answer, flagged for review
  assert.ok(report.warnings.some((w) => w.code === "answer-f-or-deleted"));
  assert.equal(byOld.q4, undefined);
  assert.ok(report.skipped.some((s) => s.code === "question-no-text"));
  assert.equal(byOld.ai1.source, "ai");
});

test("keeps user state apart from content", () => {
  const { records } = buildImportPlan(sample());
  const flagged = records.questionState.find((s) => s.questionId === "q:p1:q1");
  assert.equal(flagged.flagged, true);
  const diff = records.questionState.find((s) => s.questionId === "q:p1:q3");
  assert.equal(diff.difficulty, "D");
  assert.equal(diff.difficultySource, "manual");
});

test("keeps recorded scores and fills in missing ones", () => {
  const { records, report } = buildImportPlan(sample());
  const a1 = records.attempts.find((a) => a.oldId === "a1");
  assert.equal(a1.netScore, 3);
  assert.equal(a1.scope.ref, records.topics.find((t) => t.name === "Light, Lens & Mirrors").id);
  const a2 = records.attempts.find((a) => a.oldId === "a2");
  assert.equal(a2.netScore, netScore(2, 1, markingFromLegacy({ positive: 1, negNum: 1, negDen: 3 })));
  assert.ok(report.warnings.some((w) => w.code === "score-computed"));
});

test("banks keep found questions and report missing ones", () => {
  const { records, report } = buildImportPlan(sample());
  assert.deepEqual(records.sets[0].questionIds, ["q:p1:q1"]);
  assert.ok(report.warnings.some((w) => w.code === "bank-question-missing"));
});

test("notes, labels and lists point at the merged topic", () => {
  const { records } = buildImportPlan(sample());
  const topicId = records.topics.find((t) => t.name === "Light, Lens & Mirrors").id;
  assert.equal(records.notes[0].target.id, topicId);
  assert.equal(records.labels[0].topicId, topicId);
  assert.equal(records.labels[0].syllabusId, "syl:default");
  assert.deepEqual(records.topicLists[0].topicIds, [topicId]);
});

test("same file gives the same records (safe to import twice)", () => {
  const a = buildImportPlan(sample(), { now: 1 });
  const b = buildImportPlan(sample(), { now: 1 });
  assert.equal(JSON.stringify(a.records), JSON.stringify(b.records));
});

test("net score rounding matches the old app", () => {
  const m = markingFromLegacy({ positive: 1, negNum: 1, negDen: 3 });
  assert.equal(netScore(36, 13, m), 31.67);
  assert.equal(netScore(0, 1, m), -0.33);
});
