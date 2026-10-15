// 1.20: next steps after a test, web sources and their trust marks. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { parseSteps, stripTags, contextOf, stepsOf } from "../src/features/test/next-steps.js";
import { splitSources, trustOf, domainOf } from "../src/ai/web.js";
import { testAnalysisTask, factSheetTask, webQuestionsTask, WEB_RULES } from "../src/ai/prompts.js";

const analysis = `## 4. Next steps
- **[FACTS]** Fact sheet on Gandhi's programmes and dates
- [QUESTIONS] 15 questions on NOT-type items for Indian National Movement
1. [CARDS] Flashcards for awards and years
- [REVISE] the 7 wrong ones`;

test("tagged next steps are read; tags are hidden in the text", () => {
  const s = parseSteps(analysis);
  assert.deepEqual(s.map((x) => x.kind), ["facts", "questions", "cards", "revise"]);
  assert.equal(s[0].text, "Fact sheet on Gandhi's programmes and dates");
  assert.doesNotMatch(stripTags(analysis), /\[FACTS\]|\[CARDS\]/);
  // an older analysis without tags still offers every kind
  assert.deepEqual(stepsOf({ analysis: { text: "## 4. Next steps\n- read more" } }).map((x) => x.kind), ["facts", "questions", "cards", "revise"]);
  assert.match(testAnalysisTask(["x"], []), /\[FACTS\] a one-page fact sheet, \[QUESTIONS\]/);
});

test("the AI is told the weak topics and the missed questions", () => {
  const qs = { a: { text: "Who led Vaikom?", options: ["Kelappan", "T K Madhavan"], answerIndex: 1, topicId: "t1" }, b: { text: "Year?", options: ["1924", "1930"], answerIndex: 0, topicId: "t1" }, c: { text: "Capital?", options: ["X", "Y"], answerIndex: 0, topicId: "t2" } };
  const a = { answers: [{ questionId: "a", graded: true, isCorrect: false, selected: 0, correct: 1 }, { questionId: "b", graded: true, isCorrect: false, selected: null, correct: 0 }, { questionId: "c", graded: true, isCorrect: true, selected: 0, correct: 0 }] };
  const ctx = contextOf(a, { questionOf: (id) => qs[id], topicOf: (id) => ({ id, name: id === "t1" ? "Renaissance" : "Geo", subjectId: "s" }), subjectOf: () => ({ name: "History" }) });
  assert.deepEqual(ctx.topics.map((x) => [x.key, x.path]), [["T1", "History › Renaissance"]]);
  assert.equal(ctx.missed[0], "- [T1] Who led Vaikom? → right answer: T K Madhavan");
  assert.match(ctx.missed[1], /\(left blank\)$/);
  const f = factSheetTask({ step: "Gandhi", ...ctx, web: true });
  assert.match(f, /T1: History › Renaissance/); assert.match(f, /SOURCES:/);
  assert.doesNotMatch(factSheetTask({ step: "x", ...ctx, web: false }), /SOURCES:/);
  assert.match(webQuestionsTask({ step: "x", ...ctx, n: 10, web: true }), /"source":/);
  assert.match(WEB_RULES, /Never use quiz, coaching-centre, blog/);
});

test("sources: listed by the AI, and marked trusted / fair / check", () => {
  const { body, sources } = splitSources("- **Fact**: x [1]\n\nSOURCES:\n- [1] Vaikom Satyagraha — https://www.britannica.com/event/Vaikom-Satyagraha\n- [2] Some blog — https://psc-quiz-blog.example.com/x).");
  assert.equal(body, "- **Fact**: x [1]");
  assert.equal(sources.length, 2); assert.equal(sources[0].title, "Vaikom Satyagraha"); assert.equal(sources[1].url, "https://psc-quiz-blog.example.com/x");
  assert.equal(trustOf(domainOf("https://www.kerala.gov.in/a")), "trusted");
  assert.equal(trustOf("pib.gov.in"), "trusted");
  assert.equal(trustOf("en.wikipedia.org"), "fair");
  assert.equal(trustOf(domainOf(sources[1].url)), "check");
  assert.equal(trustOf("britannica.com"), "trusted");
});
