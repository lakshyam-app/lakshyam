// 1.24: questions about things that change are looked up on the web; every answer knows today's date. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { timeSensitive, asksAboutNow, examYear } from "../src/domain/current.js";
import { tutorSystem, timeRules, GENERATE_SYSTEM, WEB_ANSWER, questionBlock } from "../src/ai/prompts.js";

const now = new Date(2026, 9, 17);
test("current-affairs questions are found (subject, words in English or Malayalam, recent years)", () => {
  assert.equal(timeSensitive({ text: "Who is the present CEO of NITI Aayog?" }, { now }), "words");
  assert.equal(timeSensitive({ text: "നീതി ആയോഗിന്റെ നിലവിലെ വൈസ് ചെയർപേഴ്സൺ ആര്?" }, { now }), "words");
  assert.equal(timeSensitive({ text: "Who won the award?" }, { subject: "Current Affairs", now }), "subject");
  assert.equal(timeSensitive({ text: "Which city hosted the 2026 games?" }, { now }), "year");
  assert.equal(timeSensitive({ text: "Who led the Vaikom Satyagraha in 1924?" }, { now }), "");
  assert.equal(timeSensitive({ text: "Capital of Kerala?", options: ["Kochi", "Thiruvananthapuram"] }, { now }), "");
  assert.equal(asksAboutNow("ഇപ്പോൾ ആരാണ്?"), true);
  assert.equal(asksAboutNow("why is B wrong?"), false);
});

test("exam year from the paper code", () => {
  assert.equal(examYear("05_118/22 – M"), 2022);
  assert.equal(examYear("15_060/2023-M"), 2023);
  assert.equal(examYear("Model paper"), null);
});

test("every tutor answer is told today's date and to mark facts that change", () => {
  assert.match(timeRules("2026-10-17"), /Today is 2026-10-17/);
  assert.match(tutorSystem("en"), /⚠ verify/);
  assert.match(tutorSystem("en"), /correct at the time of the exam/);
  assert.match(GENERATE_SYSTEM, /changes over time/);
  assert.match(WEB_ANSWER, /overrides your memory/);
  assert.match(questionBlock({ text: "Q", options: ["a", "b"], answerIndex: 0, exam: "05_118/22 – M (2022)" }), /Exam: 05_118\/22 – M \(2022\)/);
});
