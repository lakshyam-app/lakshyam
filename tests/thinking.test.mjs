import test from "node:test";
import assert from "node:assert/strict";
import { stripThinking, replyText } from "../src/ai/client.js";

test("reasoning blocks are removed from replies", () => {
  assert.equal(stripThinking('<thought>The user wants "OK".</thought>OK'), "OK");
  assert.equal(stripThinking("<think>\nplan\n</think>\n\n[1,2]"), "[1,2]");
  assert.equal(stripThinking("<THOUGHT>x</THOUGHT> A <thinking>y</thinking>B"), "A B");
  assert.equal(stripThinking("<thought>cut short with no end"), "");
  assert.equal(stripThinking("Normal answer with a <thought> word in it"), "Normal answer with a <thought> word in it");
  assert.equal(replyText("openai", { choices: [{ message: { content: "<thought>t</thought>Hello" } }] }), "Hello");
});
