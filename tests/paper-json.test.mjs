// Made-up data only (this repo is public).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonText, autoFix, validatePaper, buildPaperRecords, applyAnswerKey, applyExplanations } from "../src/data/paper-json.js";
import { stepStudied, localDate, isDue, REVIEW_INTERVALS_DAYS } from "../src/domain/study.js";

const paperJson = () => ({
  paper: { id: "201/2025", name: "201/2025 LDC", post_name: "LDC" },
  questions: [
    { id: "q1", question_text: "First question text here", options: ["a", "b", "c", "d"], correct_answer_index: 1, subject: "History", topic: "Travancore" },
    { id: "q2", question_text: "Second question text here", options: ["a", "b", "c", "d"], correct_answer_index: 5, subject: "History", topic: "Travancore" },
    { id: "q3", question_text: "Third question", options: ["a", "b", "c", "d"], correct_answer_index: null, subject: "Physics", topic: "" }
  ]
});

const resolveTopic = (s, t) => ({ subjectId: `sub:${s}`, topicId: `top:${s}:${t || "Other"}` });

test("autoFix strips fences and trailing commas but keeps dashes", () => {
  const raw = '```json\n{"paper":{"id":"x","name":"Important Acts – General"},"questions":[],}\n```';
  const { fixed, notes } = autoFix(raw);
  assert.ok(notes.includes("fences") && notes.includes("trailingCommas"));
  const parsed = parseJsonText(fixed);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.json.paper.name, "Important Acts – General");
});

test("parseJsonText shows where it broke", () => {
  const r = parseJsonText('{"a": 1,, "b": 2}');
  assert.equal(r.ok, false);
  assert.ok(typeof r.error === "string");
});

test("validatePaper reports missing pieces and duplicate IDs", () => {
  const bad = { paper: { id: "", name: "x" }, questions: [{ id: "1", question_text: "t", options: ["a"], subject: "S" }, { id: "1", question_text: "", options: ["a", "b"], subject: "" }] };
  const codes = validatePaper(bad).map((e) => e.code);
  assert.deepEqual(codes.sort(), ["noPaperId", "qDuplicateId", "qNoOptions", "qNoSubject", "qNoText"].sort());
  assert.deepEqual(validatePaper(paperJson()), []);
});

test("new paper: index 5 with 4 options means deleted by PSC; duplicates spotted", () => {
  const otherTexts = new Map([["first question text here", "101/2024"]]);
  const r = buildPaperRecords(paperJson(), { syllabusId: "syl:a", existingPaper: null, existingQuestions: new Map(), resolveTopic, otherTexts, now: 1 });
  assert.equal(r.report.added, 3);
  assert.equal(r.questions[1].status, "deleted_by_psc");
  assert.equal(r.questions[1].answerIndex, null);
  assert.equal(r.questions[2].topicId, "top:Physics:Other");
  assert.equal(r.report.duplicates.length, 1);
  assert.equal(r.paper.syllabusId, "syl:a");
  assert.equal(r.isUpdate, false);
});

test("re-import keeps your answers, explanations, moved topics and extra questions", () => {
  const first = buildPaperRecords(paperJson(), { syllabusId: "syl:a", existingPaper: null, existingQuestions: new Map(), resolveTopic, now: 1 });
  const prev = new Map(first.questions.map((q) => [q.oldId, { ...q }]));
  prev.get("q3").answerIndex = 2; // you set an answer in the app
  prev.get("q1").explanation = "My explanation";
  prev.get("q1").topicId = "top:History:Modern"; prev.get("q1").topicMovedByUser = true;
  prev.set("q9", { oldId: "q9" }); // a question only in the app
  const again = paperJson();
  again.questions[0].question_text = "First question text here (corrected)";
  const r = buildPaperRecords(again, { syllabusId: "syl:b", existingPaper: { ...first.paper, syllabusId: "syl:a" }, existingQuestions: prev, resolveTopic, now: 2 });
  const byOld = Object.fromEntries(r.questions.map((q) => [q.oldId, q]));
  assert.equal(byOld.q3.answerIndex, 2);
  assert.equal(byOld.q1.explanation, "My explanation");
  assert.equal(byOld.q1.topicId, "top:History:Modern");
  assert.equal(byOld.q1.text, "First question text here (corrected)");
  assert.equal(r.report.keptAnswers, 1);
  assert.equal(r.report.keptExplanations, 1);
  assert.equal(r.report.keptTopics, 1);
  assert.equal(r.report.notInFile, 1);
  assert.equal(r.paper.syllabusId, "syl:a"); // stays where it was
  assert.equal(r.isUpdate, true);
});

test("answer key: letters, X for deleted, unmatched and unknown reported", () => {
  const qs = [
    { id: "a", number: "1", options: ["a", "b", "c", "d"], answerIndex: null, status: "active" },
    { id: "b", number: "2", options: ["a", "b", "c", "d"], answerIndex: 0, status: "active" },
    { id: "c", number: "3", options: ["a", "b", "c", "d"], answerIndex: 0, status: "active" }
  ];
  const r = applyAnswerKey({ answers: [
    { question_number: 1, correct_option: "c" }, { question_number: "2", correct_option: "X" },
    { question_number: 3, correct_option: "F" }, { question_number: 7, correct_option: "A" }
  ] }, qs);
  assert.equal(r.ok, true);
  assert.equal(r.updates.length, 2);
  assert.equal(r.updates[0].answerIndex, 2);
  assert.equal(r.updates[1].status, "deleted_by_psc");
  assert.deepEqual(r.unmatched, ["7"]);
  assert.deepEqual(r.unrecognized, ["3:F"]);
  assert.equal(applyAnswerKey({}, qs).ok, false);
});

test("explanations are matched by printed number", () => {
  const qs = [{ id: "a", number: "1", explanation: "" }];
  const r = applyExplanations({ explanations: [{ question_number: 1, explanation: " Because " }, { question_number: 2, explanation: "x" }] }, qs);
  assert.equal(r.updates[0].explanation, "Because");
  assert.deepEqual(r.unmatched, ["2"]);
});

test("studied +1/−1 follows the review gaps", () => {
  const DAY = 86400000;
  let s = stepStudied(null, 1, 1000);
  assert.equal(s.studiedCount, 1);
  assert.equal(s.nextReviewAt, 1000 + REVIEW_INTERVALS_DAYS[0] * DAY);
  s = stepStudied(s, 1, 5000);
  assert.equal(s.nextReviewAt, 5000 + REVIEW_INTERVALS_DAYS[1] * DAY);
  s = stepStudied(s, -1, 9000);
  assert.equal(s.studiedCount, 1);
  assert.equal(s.lastStudiedAt, 5000);
  s = stepStudied(s, -1);
  assert.deepEqual(s, { studiedCount: 0, lastStudiedAt: null, nextReviewAt: null });
  assert.equal(isDue({ nextReviewAt: 10 }, 11), true);
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});
