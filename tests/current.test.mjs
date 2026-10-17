// 1.24: questions about things that change are looked up on the web; every answer knows today's date. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { timeSensitive, asksAboutNow, examYear } from "../src/domain/current.js";
import { tutorSystem, timeRules, GENERATE_SYSTEM, WEB_ANSWER, questionBlock } from "../src/ai/prompts.js";

const now = new Date(2026, 9, 17);
test("current-affairs questions are found (subject, words in English or Malayalam, recent years)", () => {
  assert.equal(timeSensitive({ text: "Who is the present CEO of NITI Aayog?" }, { now }), "words");
  assert.equal(timeSensitive({ text: "നീതി ആയോഗിന്റെ നിലവിലെ വൈസ് ചെയർപേഴ്സൺ ആര്?" }, { now }), "words");
  assert.equal(timeSensitive({ text: "Who won the award?" }, { subject: "Current Affairs", now }), "subject");
  assert.equal(timeSensitive({ text: "Which city hosted the 2026 games?" }, { now }), "year");
  assert.equal(timeSensitive({ text: "Who led the Vaikom Satyagraha in 1924?" }, { now }), "");
  assert.equal(timeSensitive({ text: "Capital of Kerala?", options: ["Kochi", "Thiruvananthapuram"] }, { now }), "");
  assert.equal(asksAboutNow("ഇപ്പോൾ ആരാണ്?"), true);
  assert.equal(asksAboutNow("why is B wrong?"), false);
});

test("exam year from the paper code", () => {
  assert.equal(examYear("05_118/22 – M"), 2022);
  assert.equal(examYear("15_060/2023-M"), 2023);
  assert.equal(examYear("Model paper"), null);
});

test("every tutor answer is told today's date and to mark facts that change", () => {
  assert.match(timeRules("2026-10-17"), /Today is 2026-10-17/);
  assert.match(tutorSystem("en"), /⚠ verify/);
  assert.match(tutorSystem("en"), /correct at the time of the exam/);
  assert.match(GENERATE_SYSTEM, /changes over time/);
  assert.match(WEB_ANSWER, /overrides your memory/);
  assert.match(questionBlock({ text: "Q", options: ["a", "b"], answerIndex: 0, exam: "05_118/22 – M (2022)" }), /Exam: 05_118\/22 – M \(2022\)/);
});

test("Malayalam answers go to the best Malayalam AI first; often-flagged presets later; facts at low creativity", async () => {
  const { smartOrder, malayalamRank, writesMalayalam, creativeTask, buildRequest } = await import("../src/ai/client.js");
  const groq = { id: "g", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", uses: 100 };
  const gem = { id: "m", name: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.6-flash", uses: 50 };
  const gemma = { id: "e", name: "Gemma", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemma-4-31b-it", uses: 10 };
  const or = { id: "o", name: "OR", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/free", uses: 20 };
  assert.deepEqual([groq, gem, gemma, or].map(malayalamRank), [3, 0, 2, 3]);
  assert.deepEqual(smartOrder([groq, or, gemma, gem], { malayalam: true }).map((p) => p.id), ["m", "e", "g", "o"]);
  assert.deepEqual(smartOrder([groq, or, gemma, gem]).map((p) => p.id), ["g", "o", "e", "m"]); // English: your order
  const flags = { o: 0, g: 6, e: 0, m: 0 };
  assert.deepEqual(smartOrder([groq, or, gemma, gem], { flagsOf: (p) => flags[p.id] }).map((p) => p.id), ["g", "o", "e", "m"]); // your choice stays first
  assert.deepEqual(smartOrder([or, groq, gemma, gem], { flagsOf: (p) => flags[p.id] }).map((p) => p.id), ["o", "e", "m", "g"]); // flagged fallback tried last
  assert.deepEqual(smartOrder([gem, groq], { malayalam: true, limitedIds: new Set(["m"]) }).map((p) => p.id), ["g", "m"]); // a limited one stays last
  assert.equal(writesMalayalam("x", "…\n\nLANGUAGE: write your whole answer in Malayalam (മലയാളം)"), true);
  assert.equal(writesMalayalam("Write in clear, simple English.", "q"), false);
  assert.equal(creativeTask("", "Make 1-2 memory tricks"), true);
  assert.equal(buildRequest(groq, "s", "Explain").body.temperature, 0.2);
});

test("second opinion: the checker's reply is read", async () => {
  const { readCheck, checkTask } = await import("../src/ai/prompts.js");
  assert.deepEqual(readCheck("OK"), { ok: true, fixes: [] });
  assert.deepEqual(readCheck("**OK.**"), { ok: true, fixes: [] });
  assert.deepEqual(readCheck("- CEO is B.V.R. Subrahmanyam → Anurag Jain (since July 2026) ⚠\n- 1923 → 1924"), { ok: false, fixes: ["CEO is B.V.R. Subrahmanyam → Anurag Jain (since July 2026) ⚠", "1923 → 1924"] });
  assert.equal(readCheck("I think it's mostly fine but hard to say."), null);
  assert.match(checkTask("Q", "A"), /reply with exactly: OK/);
});
