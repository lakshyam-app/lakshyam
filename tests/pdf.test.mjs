// Study PDFs: the pure helpers and the image request format. Made-up text only.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../src/pdf/pdf-tools.js";
import { buildRequest, visionOrder } from "../src/ai/client.js";
import { genTask, checkTask, cardTask, noteTask, DEFAULT_STYLE } from "../src/ai/pdf-prompts.js";

const EN = "The Vaikom Satyagraha began in the year 1924 and lasted for about twenty months. It demanded the right of all people to use the roads near the Vaikom temple.";
const EN2 = "The Guruvayur Satyagraha was led by K. Kelappan in 1931. It sought temple entry for all Hindus regardless of caste.";
const page = (t, src = "text") => ({ t, src });
const chunkOf = (...texts) => ({ pages: texts.map((_, i) => i + 1), parts: texts.map((t, i) => ({ n: i + 1, t })), len: texts.join("").length });

test("clean-up and page classification", () => {
  assert.equal(T.cleanText("a​b­ c  \n\n\n\nd"), "ab c\n\nd");
  assert.equal(T.cleanText("മല‌യാളം"), "മല‌യാളം", "ZWNJ is kept");
  assert.deepEqual(T.classifyPage("   short  "), { t: "", src: "scan" });
  assert.equal(T.classifyPage(EN).src, "text");
  assert.equal(T.classifyPage("Ìs¶w ]n¶m¡w Aªm¯ ¨³ " + "aebmfw ".repeat(3)).src, "garbled");
  assert.equal(T.classifyPage("കേരളത്തിലെ ആദ്യത്തെ സത്യാഗ്രഹം വൈക്കം സത്യാഗ്രഹം ആണ്").src, "text");
});

test("page counts and usable pages", () => {
  const pages = [page(EN), page("", "scan"), page("x".repeat(40), "garbled"), page(EN2, "ai"), page("", "blank"), page(EN, "edited")];
  const c = T.pageCounts(pages);
  assert.deepEqual([c.readable, c.text, c.ai, c.edited, c.need, c.blank], [3, 1, 1, 1, 2, 1]);
  assert.deepEqual(T.pageNumbers(pages, T.needsAi), [2, 3]);
  assert.deepEqual(T.pageNumbers(pages, T.isUsable), [1, 4, 6]);
});

test("sections: pages are grouped, long pages split, unreadable skipped", () => {
  const pages = [page(EN), page(EN2), page("", "scan"), page("A".repeat(9000)), page(EN)];
  const chunks = T.buildChunks(pages);
  assert.deepEqual(chunks[0].pages, [1, 2]);
  assert.ok(chunks.filter((c) => c.pages[0] === 4).length >= 2, "the long page is split");
  assert.ok(!chunks.some((c) => c.pages.includes(3)));
  assert.deepEqual(T.buildChunks(pages, 5, 5).map((c) => c.pages), [[5]]);
  // Malayalam-heavy text uses smaller sections
  const ml = "മലയാളം ".repeat(500); // 3500 chars: over 1.6 × the 1800 limit for Malayalam
  assert.ok(T.buildChunks([page(ml)]).length >= 2);
  assert.match(T.chunkText(chunks[0]), /^\[Page 1\]\n/);
});

test("planChunks shares N items by size and never exceeds N", () => {
  const cs = [{ len: 1000 }, { len: 3000 }, { len: 1000 }];
  const plan = T.planChunks(cs, 10);
  assert.equal(plan.reduce((a, p) => a + p.n, 0), 10);
  assert.ok(plan[1].n > plan[0].n);
  const many = Array.from({ length: 20 }, (_, i) => ({ len: 100 + i }));
  const p2 = T.planChunks(many, 5);
  assert.equal(p2.length, 5);
  assert.ok(p2.every((p) => p.n === 1));
  assert.deepEqual(T.planChunks([], 5), []);
});

test("quote check: exact, close, across pages, not found", () => {
  const c = chunkOf(EN, EN2);
  assert.deepEqual(T.checkQuote("The Guruvayur Satyagraha was led by K. Kelappan in 1931.", c), { level: "exact", page: 2 });
  assert.equal(T.checkQuote("the  vaikom satyagraha BEGAN in the year 1924", c).level, "exact", "case/space/punctuation ignored");
  assert.equal(T.checkQuote("The Vaikom Satyagraha began in the yaer 1924 and lasted for about twenty months.", c).level, "close");
  assert.equal(T.checkQuote("Gandhi led the Salt March to Dandi in 1930.", c).level, "none");
  assert.equal(T.checkQuote("too short", c).level, "none");
  const across = chunkOf("first part ends with Vaikom", "temple roads were opened to all");
  assert.equal(T.checkQuote("ends with Vaikom temple roads were opened", across).level, "exact");
});

test("options: shuffled, but numbers and 'all of the above' keep their order", () => {
  const it = { options: ["a", "b", "c", "d"], answerIndex: 2 };
  let seed = 0.9; const rand = () => (seed = (seed * 7.3) % 1);
  const s = T.shuffleOptions(it, rand);
  assert.equal(s.options[s.answerIndex], "c");
  assert.deepEqual([...s.options].sort(), ["a", "b", "c", "d"]);
  const years = { options: ["1924", "1931", "1936", "1947"], answerIndex: 0 };
  assert.equal(T.shuffleOptions(years, rand), years, "years are not shuffled");
  assert.ok(T.shouldKeepOrder(["1924", "1931", "1936", "1947"]));
  assert.ok(T.shouldKeepOrder(["x", "y", "Both x and y", "None of these"]));
  assert.ok(T.shouldKeepOrder(["i and ii", "ii and iii", "i only", "all"]));
  assert.ok(!T.shouldKeepOrder(["Kelappan", "Gandhi", "Ayyankali", "Mannathu"]));
});

test("generated questions: shape check, quote check, duplicates", () => {
  const c = chunkOf(EN, EN2);
  const good = { question_text: "Who led the Guruvayur Satyagraha?", options: ["K. Kelappan", "T.K. Madhavan", "Mannathu Padmanabhan", "A.K. Gopalan"], correct_answer_index: 0, source_quote: "The Guruvayur Satyagraha was led by K. Kelappan in 1931.", page: 9, difficulty: "E" };
  const arr = [good, { ...good }, { ...good, question_text: "When did Vaikom start?", source_quote: "It started in 1930 at Dandi beach." },
    { ...good, options: ["a", "a", "b", "c"] }, { ...good, correct_answer_index: 7 }, null];
  const { items, stats } = T.verifyQuestions(arr, c, { rand: () => 0.5 });
  assert.equal(items.length, 1, "the duplicate is dropped");
  assert.equal(stats.badQuote, 1);
  assert.equal(stats.badShape, 3);
  assert.equal(items[0].page, 2, "page comes from where the quote was found");
  assert.equal(items[0].options[items[0].answerIndex], "K. Kelappan");
  assert.equal(items[0].quoteLevel, "exact");
});

test("second-pass check and trimming", () => {
  const items = [0, 1, 2, 3].map((i) => ({ answerIndex: 1, quoteLevel: i === 3 ? "close" : "exact" }));
  T.applyAnswerCheck(items, [{ n: 1, answer: 2 }, { n: 2, answer: 3 }, { n: 3, answer: 0 }]);
  assert.deepEqual(items.map((x) => x.check), ["agree", "disagree", "unclear", "none"]);
  assert.equal(items[1].checkAnswer, 2);
  assert.deepEqual(items.map(T.passedAll), [true, false, false, false]);
  const best = T.trimToBest(items, 2);
  assert.deepEqual(best.map((x) => x.check), ["agree", "none"], "agreed and unchecked kept, original order");
});

test("numbers must be in the PDF (incl. Malayalam digits)", () => {
  assert.ok(T.numbersSupported("Began in 1924", EN));
  assert.ok(!T.numbersSupported("Began in 1925", EN));
  assert.ok(T.numbersSupported("൧൯൨൪ ൽ", "in 1924"));
  assert.ok(T.numbersSupported("007 agents", "7"));
});

test("cards and note bullets are checked against the section", () => {
  const c = chunkOf(EN, EN2);
  const { items, stats } = T.verifyCards([
    { front: "Vaikom Satyagraha began in?", back: "1924", source_quote: "The Vaikom Satyagraha began in the year 1924" },
    { front: "Guruvayur Satyagraha year?", back: "1932", source_quote: "led by K. Kelappan in 1931" },
    { front: "Who?", back: "x", source_quote: "not in this text at all, no" },
    { front: "", back: "y" }
  ], c);
  assert.equal(items.length, 2);
  assert.equal(items[1].flag, true, "a number not in the PDF is flagged");
  assert.deepEqual([stats.badQuote, stats.badShape, stats.flagged], [1, 1, 1]);
  const n = T.noteLines("Intro line\n- **Vaikom** began in 1924 [p.1]\n- It lasted 30 months [p.1]\n* Kelappan led Guruvayur [p.2]", c);
  assert.deepEqual(n.lines, ["- **Vaikom** began in 1924 [p.1]", "- Kelappan led Guruvayur [p.2]"]);
  assert.equal(n.dropped, 1);
  assert.deepEqual(T.noteLines("NONE", c), { lines: [], dropped: 0 });
});

test("prompts carry the passage as untrusted data and ask for quotes", () => {
  const c = chunkOf(EN);
  const g = genTask({ style: DEFAULT_STYLE, examples: [{ text: "Q?", options: ["a", "b"] }], lang: "ml", difficulty: "E" }, c, 3);
  assert.match(g, /<<<\n\[Page 1\]/);
  assert.match(g, /NEVER reuse their facts/);
  assert.match(g, /Malayalam/);
  assert.match(g, /up to 3 multiple-choice questions/);
  assert.match(checkTask(c, [{ text: "Q", options: ["a", "b", "c"] }]), /1-3, or 0/);
  assert.match(cardTask({ lang: "same" }, c, 2), /source_quote/);
  assert.match(noteTask({ detail: "short" }, c), /3–5 bullets.*\[p\.1\]/s);
});

test("image requests: Anthropic base64 blocks, OpenAI image_url, temperature 0", () => {
  const img = "data:image/jpeg;base64,QUJD";
  const p = { format: "openai", baseUrl: "https://x.test/v1", model: "m", apiKey: "k" };
  const o = buildRequest(p, "sys", "read", 100, [img]);
  assert.equal(o.body.temperature, 0);
  assert.deepEqual(o.body.messages[1].content[1], { type: "image_url", image_url: { url: img } });
  assert.equal(buildRequest(p, "s", "u", 100).body.temperature, 0.4);
  const a = buildRequest({ ...p, format: "anthropic", baseUrl: "https://api.anthropic.com" }, "sys", "read", 100, [img]);
  assert.deepEqual(a.body.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
  assert.equal(a.body.messages[0].content[1].text, "read");
  assert.throws(() => buildRequest(p, "s", "u", 100, ["not-a-data-url"]));
});

test("pictures go to Gemini first, then Anthropic/OpenAI, then OpenRouter", () => {
  const order = [{ id: "g", template: "groq" }, { id: "r", template: "openrouter" }, { id: "a", template: "anthropic" }, { id: "c", template: "custom", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" }, { id: "o", template: "openai" }];
  assert.deepEqual(visionOrder(order).map((p) => p.id), ["c", "a", "o", "r", "g"]);
});
