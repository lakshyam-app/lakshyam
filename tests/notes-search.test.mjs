// 1.18: find in my notes (no AI), and what is read aloud. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { passagesOf, queryOf, rank, snippet, words } from "../src/domain/note-search.js";
import { speakable, questionSpeech, pcmToWav } from "../src/features/question/speak.js";

const sources = [
  { kind: "pdf", ref: "p1", name: "rivers.pdf", pages: [
    { n: 1, t: "Kerala has 44 rivers. Most of them flow west into the Arabian Sea." },
    { n: 2, t: "Periyar is the longest river of Kerala, about 244 km long.\nIt is called the lifeline of Kerala." },
    { n: 3, t: "Pamba is the third longest river; Sabarimala is on its banks." }] },
  { kind: "note", ref: "n1", name: "My note", pages: [{ n: null, t: "- Bharathapuzha: river of Nila, second longest\n- Chaliyar flows through Malappuram" }] },
  { kind: "pdf", ref: "p2", name: "malayalam.pdf", pages: [{ n: 1, t: "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദിയായ പെരിയാറിന്റെ നീളം 244 കി.മീ ആണ്." }] }
];
const P = passagesOf(sources);

test("the page that is about the question and has the answer comes first", () => {
  const q = { text: "Which is the longest river in Kerala?", options: ["Pamba", "Periyar", "Chaliyar", "Bharathapuzha"], answerIndex: 1 };
  const r = rank(P, queryOf(q));
  assert.equal(r[0].src.ref, "p1"); assert.equal(r[0].page, 2); assert.equal(r[0].hasAnswer, true);
});

test("Malayalam words match inside longer words (endings)", () => {
  const q = { text: "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏത്?", options: ["പമ്പ", "പെരിയാർ", "ചാലിയാർ", "ഭാരതപ്പുഴ"], answerIndex: 1 };
  const r = rank(P, queryOf(q));
  assert.equal(r[0].src.ref, "p2");
});

test("nothing close → nothing shown; combined answers are not searched for", () => {
  assert.equal(rank(P, queryOf({ text: "Who wrote the novel Indulekha in 1889?", options: ["O. Chandu Menon", "x", "y", "z"], answerIndex: 0 })).length, 0);
  assert.equal(queryOf({ text: "Which are correct?", options: ["i and ii", "ii only", "Both", "None"], answerIndex: 0 }).answer, "");
  assert.ok(!words("Which of the following statements is correct").length);
});

test("snippet marks the matched words and is escaped", () => {
  const s = String(snippet("Periyar <b>is</b> the longest river", ["periyar", "longest"]));
  assert.match(s, /<mark>Periyar<\/mark> &lt;b&gt;is&lt;\/b&gt; the <mark>longest<\/mark>/);
});

test("read aloud: plain words, options with letters, a playable WAV", () => {
  assert.equal(speakable("**Speed** = $\\frac{d}{t}$"), "Speed = d by t");
  const sp = questionSpeech({ text: "Longest river?", options: ["Periyar", "Pamba"], lang: "en" });
  assert.equal(sp.text, "Longest river?\nOption A. Periyar.\nOption B. Pamba.");
  assert.equal(sp.lang, "en-IN");
  assert.equal(questionSpeech({ text: "ഏറ്റവും നീളം കൂടിയ നദി?", options: ["പെരിയാർ"] }).lang, "ml-IN");
  const wav = pcmToWav(new Uint8Array(480), 24000);
  assert.equal(wav.size, 44 + 480); assert.equal(wav.type, "audio/wav");
});
