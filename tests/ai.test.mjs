// No real AI calls: only the pure parts. Made-up data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequest, replyText, classify, parseJsonLoose } from "../src/ai/client.js";
import { tryOrder } from "../src/ai/presets.js";
import { questionBlock, tasks, cleanGenerated, langInstruction } from "../src/ai/prompts.js";
import { know, again, isDue } from "../src/domain/cards.js";

const preset = (id, extra = {}) => ({ id, name: id, format: "openai", baseUrl: "https://x.test/v1/", model: "m", apiKey: "k", ...extra });

test("OpenAI-style and Anthropic requests", () => {
  const o = buildRequest(preset("a"), "sys", "hi", 100);
  assert.equal(o.url, "https://x.test/v1/chat/completions");
  assert.equal(o.headers.authorization, "Bearer k");
  assert.equal(o.body.messages[0].content, "sys");
  const a = buildRequest(preset("b", { format: "anthropic", baseUrl: "https://api.anthropic.com" }), "sys", "hi", 100);
  assert.equal(a.url, "https://api.anthropic.com/v1/messages");
  assert.equal(a.headers["x-api-key"], "k");
  assert.equal(a.body.system, "sys");
  assert.ok(buildRequest(preset("c", { baseUrl: "https://openrouter.ai/api/v1" }), "s", "u").body.reasoning);
});

test("reply text and error kinds", () => {
  assert.equal(replyText("openai", { choices: [{ message: { content: " hello " } }] }), "hello");
  assert.equal(replyText("anthropic", { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }), "a\nb");
  assert.deepEqual(classify(429, "x"), { limit: true, busy: false });
  assert.deepEqual(classify(503, "x"), { limit: false, busy: true });
  assert.deepEqual(classify(400, "You exceeded your current quota"), { limit: true, busy: false });
});

test("preset order: active first, limited ones last, no fallback = one", () => {
  const ps = [preset("a"), preset("b", { limitHitAt: 1000 }), preset("c"), preset("d", { apiKey: "" })];
  assert.deepEqual(tryOrder(ps, { activeId: "b", fallback: true }, 2000).map((p) => p.id), ["c", "a", "b"]);
  assert.deepEqual(tryOrder(ps, { activeId: "b", fallback: true }, 1000 + 3600001).map((p) => p.id), ["b", "c", "a"]);
  assert.deepEqual(tryOrder(ps, { activeId: "c", fallback: false }).map((p) => p.id), ["c"]);
});

test("loose JSON from chatty replies", () => {
  assert.deepEqual(parseJsonLoose('Sure!\n```json\n[{"a":1},]\n```'), [{ a: 1 }]);
  assert.throws(() => parseJsonLoose("no json here"));
});

test("question block and tasks", () => {
  const q = { text: "Capital?", options: ["A1", "B1", "C1", "D1"], answerIndex: 2, status: "active", subject: "Geo", topic: "Kerala" };
  assert.match(questionBlock(q), /Correct answer: C\) C1/);
  assert.match(tasks.explain(q, 1), /Student chose: B\) B1/);
  assert.match(tasks.explain(q, 1), /why the student's choice is wrong/);
  assert.match(tasks.explain(q, 2), /why each other option is wrong/);
  assert.match(questionBlock({ ...q, status: "deleted_by_psc" }), /DELETED by PSC/);
  assert.match(langInstruction("ml"), /Malayalam/);
});

test("generated questions are checked", () => {
  const good = cleanGenerated([
    { question_text: "Q1", options: ["a", "b", "c", "d"], correct_answer_index: 1, explanation: "e", difficulty: "M" },
    { question_text: "", options: ["a", "b"], correct_answer_index: 0 },
    { question_text: "Q3", options: ["a", "b"], correct_answer_index: 5 },
    { question_text: "Q4", options: ["a"], correct_answer_index: 0 }
  ]);
  assert.equal(good.length, 1);
  assert.deepEqual(good[0], { text: "Q1", options: ["a", "b", "c", "d"], answerIndex: 1, explanation: "e", difficulty: "M" });
});

test("flashcard spacing 1 → 3 → 7 → 14 → 30 days; again resets", () => {
  const DAY = 86400000;
  let s = { status: "new" };
  assert.equal(isDue(s, 0), true);
  const gaps = [];
  for (let i = 0; i < 6; i++) { s = know(s, 0); gaps.push(s.dueAt / DAY); }
  assert.deepEqual(gaps, [1, 3, 7, 14, 30, 30]);
  assert.equal(isDue(s, 29 * DAY), false);
  s = again(s, 5);
  assert.equal(s.streak, 0);
  assert.equal(isDue(s, 5), true);
  assert.equal(isDue({ status: "known", dueAt: null }, 1), false);
});
