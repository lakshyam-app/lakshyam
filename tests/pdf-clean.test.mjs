import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../src/pdf/pdf-tools.js";

const body = (n) => `Heading ${n}\nThis is a long enough sentence number ${n} about rivers and dams in the state.\nAnother line ${n} with more words to make it usable.`;
const page = (t) => ({ t, src: "text" });

test("watermark and repeated short lines are removed before the AI sees a page", () => {
  const pages = [1, 2, 3, 4].map((n) => page(`${body(n)}\nsa\nch\nstudent42@mail.example\n Bullet point ${n} here`));
  const noise = T.noiseLines(pages);
  assert.ok(noise.has("sa") && noise.has("student42@mail.example"));
  assert.ok(!noise.has("Heading 1"));
  const ct = T.cleanPageText(pages[0].t, noise);
  assert.doesNotMatch(ct, /student42|^sa$/m);
  assert.match(ct, /^• Bullet point 1 here$/m);
  const ch = T.buildChunks(pages);
  assert.doesNotMatch(T.chunkText(ch[0]), /student42/);
  // the quote check uses the same cleaned text
  assert.equal(T.checkQuote("Another line 1 with more words to make it usable.", ch[0]).level, "exact");
});

test("each section carries the end of the page before it, as context only", () => {
  const big = (n) => page(`${body(n)}\n${Array.from({ length: 80 }, (_, i) => `Filler ${n}-${i} sentence with words.`).join(" ")}`);
  const pages = [big(1), big(2), big(3)];
  const ch = T.buildChunks(pages);
  assert.ok(ch.length >= 2);
  assert.equal(ch[0].before, null);
  assert.equal(ch[1].before.n, ch[1].pages[0] - 1);
  assert.ok(ch[1].before.t.length <= 600);
  const ctx = T.contextBlock(ch[1]);
  assert.match(ctx, /CONTEXT — the end of page \d/);
  assert.match(ctx, /Take no facts or quotes from it/);
  assert.equal(T.contextBlock(ch[0]), "");
  // the context is not part of what quotes are checked against
  assert.ok(!T.chunkSource(ch[1]).includes(ch[1].before.t) || ch[1].pages.includes(ch[1].before.n));
});

test("section labels and repeated note points", () => {
  assert.equal(T.pagesLabel([4]), "Page 4");
  assert.equal(T.pagesLabel([2, 3]), "Pages 2–3");
  const a = T.bulletWords("- ⭐ The **DM Act, 2005** was enacted after the **2004 tsunami** [p.1].");
  const b = T.bulletWords("- ⭐ The **Disaster Management Act, 2005** was enacted after the **2004 tsunami** [p.2].");
  const c = T.bulletWords("- The NDMA is chaired by the Prime Minister [p.2].");
  assert.equal(T.isRepeat(T.bulletWords("- The DM Act, 2005 was enacted after the 2004 tsunami [p.3]."), [a]), true);
  assert.equal(T.isRepeat(c, [a, b]), false);
});

test("diagonal watermark text is left out of a page; an all-rotated page is kept", () => {
  const it = (str, tr = [12, 0, 0, 12, 0, 0], eol = true) => ({ str, transform: tr, hasEOL: eol });
  const items = [it("A normal line of study text that is long enough."), it("Another normal line of study text here."), it("A third ordinary line of the page, about rivers and dams."), it("student42@mail.example", [35, 35, -35, 35, 0, 0])];
  assert.doesNotMatch(T.pageText(items), /student42/);
  const rotated = [it("Sideways page text one", [0, 12, -12, 0, 0, 0]), it("Sideways page text two", [0, 12, -12, 0, 0, 0])];
  assert.match(T.pageText(rotated), /Sideways page text one/);
});
