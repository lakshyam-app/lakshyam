import test from "node:test";
import assert from "node:assert/strict";
import { aiText, noteText } from "../src/domain/text.js";

const h = (s) => String(aiText(s));

test("## parts become section cards; numbered lines under them are steps", () => {
  const out = h("## 1. What is asked\n- **Acts**: 1909, 1919\n  - Ripon: local bodies\n## 2. Strategy\n1. Read the chapter\n2. Make a table");
  assert.equal((out.match(/<details class="ai-sec" open>/g) || []).length, 2);
  assert.match(out, /<span class="ai-n">1<\/span><span>What is asked<\/span>/);
  assert.match(out, /<li><strong>Acts<\/strong>: 1909, 1919<ul class="ai-sub"><li><strong>Ripon<\/strong>: local bodies<\/li><\/ul><\/li>/);
  assert.match(out, /<ol class="ai-list"><li>Read the chapter<\/li><li>Make a table<\/li><\/ol>/);
});

test("without ## headings, short '1. Title' lines are sections", () => {
  const out = h("1. **What is asked**\n- a\n2. How it is asked\nStatements mostly.");
  assert.equal((out.match(/ai-sec/g) || []).length >= 2, true);
  assert.match(out, /<p>Statements mostly\.<\/p>/);
});

test("plain answers stay simple; everything is escaped", () => {
  assert.equal(h("Hello **world**"), "<p>Hello <strong>world</strong></p>");
  assert.match(h("<img src=x onerror=alert(1)>"), /&lt;img/);
  assert.doesNotMatch(h("- <b>x</b>: y"), /<b>/);
});

test("notes: own notes get lists but never fold-up cards; AI write-ups get cards", () => {
  assert.match(String(noteText("my note\n- point")), /<ul class="ai-list">/);
  assert.doesNotMatch(String(noteText("1. First idea\n- a\n2. Second idea\n- b")), /ai-sec/);
  assert.equal(String(noteText("Just a line\nand another")), "Just a line\nand another");
  assert.match(String(noteText("🤖 Topic strategy\n## 1. What\n- point")), /ai-sec|ai-h/);
});

import { inLang, topicStrategyTask } from "../src/ai/prompts.js";
test("the answer language is repeated at the very end of the request", () => {
  assert.equal(inLang("Task", "en"), "Task");
  const ml = inLang("Task", "ml");
  assert.ok(ml.startsWith("Task\n\nLANGUAGE:") && /Malayalam/.test(ml) && /Quote:/.test(ml));
  assert.match(inLang("Task", "both"), /English first/);
});

/* 1.26.5: your own topic notes (pasted from anywhere): a name from the first heading, tables, rules. */
import { titleFromText, bodyWithoutTitle } from "../src/domain/text.js";
test("a note's name comes from its first heading, else its first line", () => {
  assert.equal(titleFromText("## Warren Hastings (1773–1785): Story Mode\n\nPicture Hastings…"), "Warren Hastings (1773–1785): Story Mode");
  assert.equal(titleFromText("\n\n**Plain first line** here\n## Later heading"), "Later heading");
  assert.equal(titleFromText("Just a line of text\nmore"), "Just a line of text");
  assert.equal(titleFromText(""), "");
  assert.equal(titleFromText("- point one"), "point one");
});
test("the name isn't shown twice: the matching first heading is left out when reading", () => {
  assert.equal(bodyWithoutTitle("## Warren Hastings\n\nPicture him.", "Warren Hastings"), "Picture him.");
  assert.equal(bodyWithoutTitle("## Warren Hastings\nPicture him.", "Other name"), "## Warren Hastings\nPicture him.");
  assert.equal(bodyWithoutTitle("Line one\nLine two", "Line one"), "Line two");
});
test("Markdown tables and --- rules are laid out; text in cells is escaped", () => {
  const h = String(noteText("## A\n| Act | Year |\n|---|---|\n| Regulating | **1773** |\n| Pitt's <b> | 1784 |\n\n---\n## B\ntext"));
  assert.match(h, /<table class="ai-table"><thead><tr><th>Act<\/th><th>Year<\/th><\/tr><\/thead><tbody><tr><td>Regulating<\/td><td><strong>1773<\/strong><\/td><\/tr>/);
  assert.match(h, /Pitt&#39;s &lt;b&gt;|Pitt's &lt;b&gt;/);
  assert.match(h, /<hr class="ai-hr">/);
  assert.doesNotMatch(h, /\|---\|/);
});
test("the sample story-mode note keeps every part: headings, bold lines, bullets, italics", () => {
  const note = "## Warren Hastings (1773–1785): Story Mode\n\nPicture Hastings as a new manager.\n👉 **3 Laws → 3 Wars → 1 Scandal → 1 Society**\n\n### 📜 Part 1: Three Laws from London\n\n**(i) The New Boss: Regulating Act, 1773**\nLondon fears…\n\n### 🧠 Memory Hooks\n- **Laws:** Regulate (1773) → Settle (1781) → Control (1784)\n\n*Several names aren't in your notes.*";
  const h = String(noteText(bodyWithoutTitle(note, titleFromText(note))));
  ["Picture Hastings", "<strong>3 Laws", "Part 1: Three Laws from London", "<strong>(i) The New Boss", "Memory Hooks", "<li><strong>Laws:</strong>", "<em>Several names"].forEach((x) => assert.ok(h.includes(x) || h.includes(x.replace("'", "&#39;")), x));
  assert.doesNotMatch(h, /##|\*\*/);
});
