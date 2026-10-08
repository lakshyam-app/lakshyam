import test from "node:test";
import assert from "node:assert/strict";
import { yearOf, styleCounts, repeatedAnswers, repeatedQuestions, topicFacts, questionLines } from "../src/domain/topic-pattern.js";

const q = (id, text, options, answerIndex, paperId = "p1", extra = {}) => ({ id, text, options, answerIndex, paperId, status: "active", ...extra });
const papers = { p1: { name: "LDC 2019 (061/2019)", postName: "LDC" }, p2: { name: "VEO 2023", postName: "VEO" }, p3: { name: "Degree prelims", postName: "" } };
const paperOf = (id) => papers[id];

test("year from the paper name", () => {
  assert.equal(yearOf(papers.p1), 2019);
  assert.equal(yearOf(papers.p3), null);
  assert.equal(yearOf({ name: "Code 120345" }), null);
});

test("styles by wording, in English and Malayalam", () => {
  const c = styleCounts([
    q("a", "Which of the following statements is correct?", ["x", "y"], 0),
    q("b", "Which one is NOT a fundamental right?", ["x", "y"], 0),
    q("c", "ശരിയായ പ്രസ്താവന ഏത്?", ["x", "y"], 0),
    q("d", "In which year was the Constitution adopted?", ["1949", "1950"], 0)
  ]);
  assert.equal(c.statement, 2); assert.equal(c.notQ, 1); assert.equal(c.when, 1); assert.equal(c.number, 1);
});

test("repeated answers ignore 'all of the above' and number pairs", () => {
  const r = repeatedAnswers([
    q("a", "First CM of Kerala?", ["EMS", "Pattom"], 0),
    q("b", "Who led the first communist ministry?", ["E.M.S", "C. Achutha Menon"], 0),
    q("c", "x", ["All of the above", "y"], 0),
    q("d", "y", ["All of the above", "z"], 0),
    q("e", "z", ["1 and 2", "2 and 3"], 0),
    q("f", "w", ["1 and 2", "2"], 0),
    q("g", "Year of the Temple Entry Proclamation?", ["1936", "1947"], 0),
    q("h", "Temple Entry Proclamation was in", ["1936", "1924"], 0),
    q("i", "p", ["All the above", "x"], 0), q("j", "p2", ["All the above", "x"], 0),
    q("k", "p3", ["Options (ii), (iii) and (iv) are correct", "x"], 0), q("l", "p4", ["Options (ii), (iii) and (iv) are correct", "x"], 0),
    q("m", "p5", ["ഇവയെല്ലാം", "x"], 0), q("n", "p6", ["ഇവയെല്ലാം", "x"], 0)
  ]);
  assert.deepEqual(r.map((x) => [x.answer, x.n]), [["1936", 2], ["EMS", 2]]);
});

test("nearly the same question in two papers", () => {
  const g = repeatedQuestions([
    q("a", "Who was the first Chief Minister of Kerala state?", ["EMS", "B"], 0, "p1"),
    q("b", "Who was the first Chief Minister of the Kerala state", ["EMS", "C"], 0, "p2"),
    q("c", "Which river is the longest in Kerala?", ["Periyar", "Pamba"], 0, "p2")
  ]);
  assert.equal(g.length, 1); assert.deepEqual(g[0].map((x) => x.id), ["a", "b"]);
});

test("facts and lines", () => {
  const qs = [q("a", "Q one about rights", ["A1", "B1"], 0, "p1"), q("b", "Q two about duties", ["A2", "B2"], 1, "p2"), q("c", "Q three", ["A3", "B3"], null, "p2", { status: "deleted_by_psc" })];
  const f = topicFacts(qs, paperOf);
  assert.equal(f.total, 3); assert.equal(f.papers, 2); assert.deepEqual(f.years, [[2019, 1], [2023, 2]]);
  assert.equal(f.deleted, 1); assert.equal(f.noKey, 0);
  const l = questionLines(qs, paperOf);
  assert.equal(l.shown, 3);
  assert.match(l.lines[0], /^1\. \[2023 · VEO\] /); // newest first
  assert.ok(l.lines.some((x) => x.includes("(deleted by PSC)")));
});

test("lines stay within the budget", () => {
  const many = Array.from({ length: 500 }, (_, i) => q(`q${i}`, "A fairly long question text ".repeat(12) + i, ["answer " + i, "x"], 0, i % 2 ? "p1" : "p2"));
  const l = questionLines(many, paperOf, { budget: 20000 });
  assert.ok(l.lines.join("\n").length <= 20000);
  assert.ok(l.shown < 500 && l.total === 500);
});

import { patternFrom } from "../src/domain/topic-pattern.js";
import { genTask } from "../src/ai/pdf-prompts.js";
import { generateTask } from "../src/ai/prompts.js";
test("pattern keeps parts 1-4 of a strategy, leaves out the plan and checklist", () => {
  const s = "## 1. What is asked\n- A\n## 2. How it is asked\n- B\n## 3. Repeated\n- C\n## 4. Likely next\n- D\n## 5. Strategy\n1. Read\n## 6. Last-day checklist\n- E";
  const p = patternFrom(s);
  assert.ok(p.includes("What is asked") && p.includes("Likely next") && !p.includes("Strategy\n") && !p.includes("checklist"));
  assert.equal(patternFrom("no parts at all"), "no parts at all");
  assert.ok(patternFrom("x".repeat(5000), 100).length <= 101);
});
test("pattern in prompts: PDF version forbids using it as a source", () => {
  const chunk = { pages: [1], parts: [{ n: 1, t: "Passage text." }] };
  const withP = genTask({ style: "S", pattern: "## 1. What is asked\n- Acts" }, chunk, 5);
  assert.match(withP, /NOT a source of facts/);
  assert.ok(withP.indexOf("TOPIC PATTERN") < withP.indexOf("SOURCE PASSAGE"));
  assert.doesNotMatch(genTask({ style: "S" }, chunk, 5), /TOPIC PATTERN/);
  assert.match(generateTask({ subject: "H", topic: "T", n: 5, lang: "en", difficulty: "mixed", examples: [], pattern: "- Acts" }), /PATTERN OF THIS TOPIC/);
});

import { cardTask, noteTask } from "../src/ai/pdf-prompts.js";
test("cards and notes from a PDF: pattern only steers, full coverage asked", () => {
  const chunk = { pages: [2], parts: [{ n: 2, t: "Passage text." }] };
  const c = cardTask({ pattern: "- Acts" }, chunk, 10);
  assert.match(c, /NOT a source of facts/); assert.match(c, /"pyq"/); assert.match(c, /cover the passage's important exam points/);
  assert.doesNotMatch(cardTask({}, chunk, 10), /TOPIC PATTERN|"pyq"/);
  const n = noteTask({ pattern: "- Acts" }, chunk);
  assert.match(n, /EVERY exam-worthy fact/); assert.match(n, /⭐/); assert.match(n, /never drop a point/);
  assert.doesNotMatch(noteTask({}, chunk), /⭐|TOPIC PATTERN/);
});
