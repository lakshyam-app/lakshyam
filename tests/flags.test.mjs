// 1.21: 🚩 flags per AI, Gemini thought parts, fact sheet preamble. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { flagCounts, presetFlags, presetFor } from "../src/ai/flags.js";
import { answerParts } from "../src/ai/web.js";
import { dropPreamble } from "../src/features/test/next-steps.js";

const list = [
  { ref: "a", by: "gemma-4-31b-it", presetId: "p1", kind: "factSheet", at: 3 },
  { ref: "b", by: "gemma-4-31b-it", presetId: "p1", kind: "explain", at: 5 },
  { ref: "c", by: "gemma-4-31b-it", presetId: "p1", kind: "factSheet", at: 4 },
  { ref: "d", by: "llama-x", presetId: "", kind: "chat", at: 9 }
];

test("flags are counted per AI, most first, with what they were for", () => {
  const c = flagCounts(list);
  assert.deepEqual(c.map((x) => [x.by, x.n]), [["gemma-4-31b-it", 3], ["llama-x", 1]]);
  assert.deepEqual(c[0].kinds, { factSheet: 2, explain: 1 });
  assert.equal(c[0].last, 5);
});

test("a preset's flags: by its id, or by its model for flags without one", () => {
  assert.equal(presetFlags({ id: "p1", model: "gemma-4-31b-it" }, list), 3);
  assert.equal(presetFlags({ id: "p9", model: "LLAMA-X" }, list), 1);
  assert.equal(presetFlags({ id: "p2", model: "gemma-4-31b-it" }, list), 0); // same model, other preset: not its flags
  const ps = [{ id: "x", name: "Groq", model: "llama-x" }, { id: "y", name: "Gemini", model: "gemini-flash" }];
  assert.equal(presetFor("Llama-X", ps).id, "x");
  assert.equal(presetFor("Gemini", ps).id, "y");
  assert.equal(presetFor("", ps), null);
});

test("Gemini: the model's own planning (thought parts) is not part of the answer", () => {
  assert.equal(answerParts([{ text: "Plan: plain text only. Check formatting? Yes.", thought: true }, { text: "## 1. Nivarthana\n- **1932**" }]), "## 1. Nivarthana\n- **1932**");
  assert.equal(answerParts(undefined), "");
});

test("fact sheet: anything before the first ## section is dropped", () => {
  assert.equal(dropPreamble("Expert tutor for Kerala PSC.\n- Plain text only.\n## 1. Nivarthana\n- **Year**: 1932"), "## 1. Nivarthana\n- **Year**: 1932");
  assert.equal(dropPreamble("## 1. A\n- x"), "## 1. A\n- x");
  assert.equal(dropPreamble("No sections here"), "No sections here");
});

test("Gemma on Google's API is asked to think less (answers come faster); other models are not", async () => {
  const { buildRequest } = await import("../src/ai/client.js");
  const g = { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemma-4-31b-it", apiKey: "k" };
  assert.equal(buildRequest(g, "s", "u").body.reasoning_effort, "minimal");
  assert.equal(buildRequest({ ...g, noEffort: true }, "s", "u").body.reasoning_effort, undefined);
  assert.equal(buildRequest({ ...g, model: "gemini-flash-latest" }, "s", "u").body.reasoning_effort, undefined);
  assert.equal(buildRequest({ ...g, baseUrl: "https://api.groq.com/openai/v1" }, "s", "u").body.reasoning_effort, undefined);
});
