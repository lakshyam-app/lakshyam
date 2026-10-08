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

test("notes: only AI write-ups get the layout", () => {
  assert.doesNotMatch(String(noteText("my note\n- point")), /ai-list/);
  assert.match(String(noteText("🤖 Topic strategy\n## 1. What\n- point")), /ai-sec|ai-h/);
});
