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
