import test from "node:test";
import assert from "node:assert/strict";
import { readQuestions, readCards, readNote, answerIndexOf, findJson, promptFor } from "../src/domain/ai-import.js";

test("questions from JSON, with words and fences around it; answer as letter, number or text", () => {
  const r = readQuestions('Sure! Here they are:\n```json\n[{"question":"Who founded SNDP?","options":["Ayyankali","Sree Narayana Guru","Chattampi","Vagbhatananda"],"answer":"B","explanation":"1903"},\n{"text":"Q2?","choices":["a","b","c","d"],"answerIndex":3},{"question":"Q2b?","options":["a","b","c","d"],"answer":4},\n{"question":"Q3?","options":["x","y","z","w"],"answer":"z"},]\n```\nHope it helps');
  assert.equal(r.format, "json");
  assert.deepEqual(r.items.map((x) => x.answerIndex), [1, 3, 3, 2]);
  assert.equal(r.items[0].explanation, "1903");
  assert.deepEqual(r.problems, {});
});
test("questions: bad ones are left out and counted", () => {
  const r = readQuestions({ toString: () => '{"questions":[{"question":"no options","options":["a"]},{"question":"no answer","options":["a","b","c","d"],"answer":"E"},{"options":["a","b"]},{"question":"ok","options":["a","b","c","d"],"answer":1}]}' }.toString());
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.problems, { options: 1, "no-answer": 1, "no-text": 1 });
  assert.equal(r.items[0].answerIndex, 0, "a plain answer number counts from 1");
});
test("questions from plain text (numbered, A) lines or inline (a)…(d), Answer:, Explanation:)", () => {
  const r = readQuestions(`1. Who wrote "Jathikkummi"?
A) Kumaranasan
B) Pandit K. P. Karuppan
C) Ulloor
D) Vallathol
Answer: B
Explanation: Written in 1914.

2) **Which year was the Regulating Act?**
(a) 1773 (b) 1784 (c) 1793 (d) 1813
Ans: (a)`);
  assert.equal(r.format, "text");
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].answerIndex, 1);
  assert.equal(r.items[0].explanation, "Written in 1914.");
  assert.deepEqual(r.items[1].options, ["1773", "1784", "1793", "1813"]);
  assert.equal(r.items[1].text, "Which year was the Regulating Act?");
  assert.equal(r.items[1].answerIndex, 0);
});
test("answerIndexOf", () => {
  const o = ["one", "two", "three", "four"];
  assert.equal(answerIndexOf("C", o), 2); assert.equal(answerIndexOf("(d)", o), 3); assert.equal(answerIndexOf("Option A", o), 0);
  assert.equal(answerIndexOf("two", o), 1); assert.equal(answerIndexOf(4, o), 3); assert.equal(answerIndexOf("E", o), null); assert.equal(answerIndexOf("", o), null);
});
test("cards from JSON, Q:/A: pairs, a Markdown table (header skipped) and front | back lines", () => {
  assert.deepEqual(readCards('[{"front":"SNDP founded?","back":"1903"},{"q":"x"}]').items, [{ front: "SNDP founded?", back: "1903" }]);
  assert.deepEqual(readCards('[{"front":"SNDP founded?","back":"1903"},{"q":"x"}]').problems, { "no-back": 1 });
  assert.deepEqual(readCards("Q: Founder of SNDP?\nA: Sree Narayana Guru\n\nQ: Year?\nA: 1903").items, [{ front: "Founder of SNDP?", back: "Sree Narayana Guru" }, { front: "Year?", back: "1903" }]);
  assert.deepEqual(readCards("| Question | Answer |\n|---|---|\n| Regulating Act | 1773 |\n| Pitt's India Act | 1784 |").items, [{ front: "Regulating Act", back: "1773" }, { front: "Pitt's India Act", back: "1784" }]);
  assert.deepEqual(readCards("Salbai :: 1782").items, [{ front: "Salbai", back: "1782" }]);
});
test("a note is kept as written (a ``` fence around it removed)", () => {
  assert.equal(readNote("```markdown\n## Title\n- a\n```").text, "## Title\n- a");
  assert.equal(readNote("plain").text, "plain");
});
test("findJson and prompts", () => {
  assert.equal(findJson("no json here"), null);
  assert.match(promptFor("questions", { subject: "History", topic: "Reform" }), /"answer":"B"/);
  assert.match(promptFor("cards", { topic: "Reform", lang: "ml" }), /Malayalam/);
  assert.match(promptFor("note", { topic: "Reform" }), /Markdown/);
});
