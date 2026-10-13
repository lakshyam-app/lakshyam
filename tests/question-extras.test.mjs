// 1.15: AI help kept under a question, maths in explanations, memory tricks. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { textSig, richText, aiText, smartText, protectMath } from "../src/domain/text.js";
import { tasks, chatTask, noteTricksTask, tricksTask, MNEMONIC_STYLE, generalCheckTask, GENERAL_CHECK_SYSTEM } from "../src/ai/prompts.js";
import { applyAnswerCheck } from "../src/pdf/pdf-tools.js";

const q = { text: "Which river is the longest in Kerala?", options: ["Periyar", "Bharathapuzha", "Pamba", "Chaliyar"], answerIndex: 0, subject: "Geography", topic: "Rivers" };

test("an explanation's fingerprint changes when its text is edited (the model label then drops)", () => {
  const a = "Periyar is the longest river (244 km).";
  assert.equal(textSig(a), textSig(`  ${a}\n`));
  assert.notEqual(textSig(a), textSig("Periyar is the longest river (224 km)."));
  assert.notEqual(textSig(a), textSig(""));
  assert.equal(textSig(null), textSig(""));
});

test("maths stays whole: bullets, bold or line breaks inside a formula don't split it", () => {
  const out = String(aiText("- **Speed**: $v = \\frac{d}{t}$ and $a*b*c$\n\\[\nE = \\frac12 m v^{2}\n\\]"));
  assert.match(out, /<span class="math">\$v = \\frac\{d\}\{t\}\$<\/span>/);
  assert.match(out, /<span class="math">\$a\*b\*c\$<\/span>/); // not turned into italics
  assert.match(out, /<span class="math">\\\[ E = \\frac12 m v\^\{2\} \\\]<\/span>/); // one line, kept for KaTeX
  assert.doesNotMatch(out, /<em>b<\/em>/);
  // plain text and prices aren't mistaken for maths
  assert.equal(protectMath("Costs Rs. 5 and 10").keep.length, 0);
  assert.match(String(richText("**Key** $x^2$")), /<mark class="hl">Key<\/mark> <span class="math">\$x\^2\$<\/span>/);
  assert.match(String(smartText("- one $\\sqrt{2}$\n- two")), /<span class="math">\$\\sqrt\{2\}\$<\/span>/);
});

test("Related facts, chat and memory-trick prompts", () => {
  const f = tasks.facts(q);
  assert.match(f, /5–8 closely related facts/);
  assert.match(f, /Correct answer: A\) Periyar/);
  const c = chatTask(q, "Saved text", [{ role: "user", text: "Why not Pamba?" }, { role: "ai", text: "Pamba is third." }], "And Chaliyar?");
  assert.match(c, /Saved explanation: Saved text/);
  assert.match(c, /Student: Why not Pamba\?\n\nTutor: Pamba is third\./);
  assert.match(c, /Student: And Chaliyar\?\n\nReply as the tutor/);
  assert.doesNotMatch(chatTask(q, "", [], "Hi"), /CONVERSATION SO FAR|Saved explanation/);
  // chats keep only the last 12 messages in the prompt
  const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "ai" : "user", text: `m${i}` }));
  assert.doesNotMatch(chatTask(q, "", long, "x"), /: m17\n/);
  assert.match(chatTask(q, "", long, "x"), /: m29/);
  const nt = noteTricksTask("- **Members**: 9 [p.2]");
  assert.ok(nt.includes(MNEMONIC_STYLE));
  assert.match(nt, /use ONLY these facts/);
  assert.match(nt, /- \*\*Members\*\*: 9 \[p\.2\]/);
  assert.ok(tricksTask([q], "en").includes(MNEMONIC_STYLE));
  assert.ok(tasks.mnemonic(q).includes(MNEMONIC_STYLE));
  assert.match(MNEMONIC_STYLE, /Never change or invent a fact/);
});

test("general-knowledge questions get a second, independent answer check", () => {
  const items = [{ text: "Q one?", options: ["a", "b", "c", "d"], answerIndex: 1 }, { text: "Q two?", options: ["a", "b", "c"], answerIndex: 0 }];
  const task = generalCheckTask(items);
  assert.match(task, /#1 Q one\?\n1\) a\n2\) b/);
  assert.match(task, /option number 1-4, or 0 if not sure/);
  assert.doesNotMatch(task, /answerIndex|correct/i); // the checker never sees the first answer
  assert.match(GENERAL_CHECK_SYSTEM, /independently/);
  const checked = applyAnswerCheck(items.map((x) => ({ ...x })), [{ n: 1, answer: 2 }, { n: 2, answer: 3 }]);
  assert.equal(checked[0].check, "agree");
  assert.equal(checked[1].check, "disagree");
});
