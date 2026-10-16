// 1.22: requests and tokens per AI preset, today and in all. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { tokensOf, rateOf, addUsage, usageView, dayKey, openRouterKey } from "../src/ai/usage.js";

test("tokens are read from OpenAI-style, Anthropic and Gemini replies", () => {
  assert.equal(tokensOf({ usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }), 150);
  assert.equal(tokensOf({ usage: { input_tokens: 30, output_tokens: 20 } }), 50);
  assert.equal(tokensOf({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 40 } }), 40);
  assert.equal(tokensOf({ choices: [] }), 0);
});

test("what is left comes from the rate-limit headers, if they can be read", () => {
  const h = new Map(Object.entries({ "x-ratelimit-remaining-requests": "940", "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-tokens": "7800", "x-ratelimit-limit-tokens": "8000" }));
  assert.deepEqual(rateOf(h), { reqLeft: 940, reqLimit: 1000, tokLeft: 7800, tokLimit: 8000 });
  assert.equal(rateOf(new Map()), null);
  assert.equal(rateOf(undefined), null);
});

test("today starts again on a new day; totals keep counting; earlier requests start the total", () => {
  const d1 = new Date(2026, 9, 16, 10).getTime(); const d2 = new Date(2026, 9, 17, 9).getTime();
  let p = { uses: 95 };
  p = { ...p, usage: addUsage(p, { tokens: 1200 }, d1) };
  p = { ...p, usage: addUsage(p, { tokens: 800, rate: { reqLeft: 5 } }, d1) };
  assert.deepEqual([p.usage.dayReq, p.usage.dayTok, p.usage.totReq, p.usage.totTok], [2, 2000, 97, 2000]);
  assert.equal(p.usage.rate.reqLeft, 5);
  assert.equal(usageView(p, d2).dayReq, 0); // a new day, nothing asked yet
  p = { ...p, usage: addUsage(p, { tokens: 100 }, d2) };
  assert.deepEqual([p.usage.day, p.usage.dayReq, p.usage.dayTok, p.usage.totReq, p.usage.totTok], [dayKey(d2), 1, 100, 98, 2100]);
  assert.deepEqual(usageView({ uses: 7 }), { dayReq: 0, dayTok: 0, totReq: 7, totTok: 0, since: null, rate: null });
});

test("OpenRouter key info: free-model requests left today and credit left", async () => {
  let asked = null;
  const fake = async (url, o) => { asked = { url, auth: o.headers.authorization }; return { ok: true, json: async () => ({ data: { limit: 5, limit_remaining: 3.2, usage_daily: 0.1, free_model_daily_requests: { used: 3, limit: 50, remaining: 47 } } }) }; };
  const r = await openRouterKey({ baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-or-x" }, fake);
  assert.equal(asked.url, "https://openrouter.ai/api/v1/key"); assert.equal(asked.auth, "Bearer sk-or-x");
  assert.deepEqual([r.freeUsed, r.freeLimit, r.freeLeft, r.creditLeft], [3, 50, 47, 3.2]);
  assert.equal(await openRouterKey({ baseUrl: "https://api.groq.com/openai/v1", apiKey: "k" }, fake), null);
  assert.equal(await openRouterKey({ baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" }, async () => ({ ok: false })), null);
});

test("OpenRouter's router: the model that actually answered is the one named", async () => {
  const { servedModel } = await import("../src/ai/client.js");
  const or = { baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/free" };
  assert.equal(servedModel(or, { model: "upstage/solar-pro-3:free" }), "upstage/solar-pro-3:free");
  assert.equal(servedModel(or, { model: "openrouter/free" }), "");
  assert.equal(servedModel(or, {}), "");
  // other providers keep the preset's model name (e.g. OpenAI adds a date to it)
  assert.equal(servedModel({ baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" }, { model: "gpt-4o-mini-2024-07-18" }), "");
});
