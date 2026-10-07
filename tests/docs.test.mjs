// The sample paper and the AI instructions stay in step with the importer and taxonomy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePaper, buildPaperRecords } from "../src/data/paper-json.js";
import { TAXONOMY_SEED, FALLBACK_TOPIC } from "../src/data/taxonomy-seed.js";
import { paperInstructions, answerKeyInstructions } from "../src/domain/ai-instructions.js";

const sample = JSON.parse(readFileSync(new URL("../docs/sample-paper.json", import.meta.url), "utf8"));

test("sample paper is valid and uses real subjects and topics", () => {
  assert.deepEqual(validatePaper(sample), []);
  sample.questions.forEach((q) => {
    assert.ok(TAXONOMY_SEED[q.subject], `subject ${q.subject}`);
    assert.ok(TAXONOMY_SEED[q.subject].includes(q.topic) || q.topic === FALLBACK_TOPIC, `topic ${q.topic}`);
  });
  const r = buildPaperRecords(sample, { syllabusId: "syl:a", existingPaper: null, existingQuestions: new Map(), resolveTopic: () => ({ subjectId: "s", topicId: "t" }), otherTexts: new Map(), now: 1 });
  const q5 = r.questions.find((q) => q.number === "5");
  assert.equal(q5.status, "deleted_by_psc");
  assert.equal(r.questions.find((q) => q.number === "3").text.includes("\\frac"), true);
  assert.equal(r.questions.find((q) => q.number === "6").answerIndex, null);
});

test("AI instructions list every subject and topic exactly as spelled in the app", () => {
  const tax = Object.entries(TAXONOMY_SEED).map(([subject, topics]) => ({ subject, topics }));
  const text = paperInstructions(tax);
  Object.entries(TAXONOMY_SEED).forEach(([s, topics]) => {
    assert.ok(text.includes(`   - ${s}\n`) || text.includes(`   - ${s}\n`.trim()), s);
    topics.filter((x) => x !== "Other").forEach((x) => assert.ok(text.includes(`  - ${x}\n`) || text.endsWith(`  - ${x}`), x));
  });
  assert.ok(text.includes("Atmosphere, Pressure Belts & Winds"), "commas kept (old guide dropped them)");
  assert.match(text, /\$\\\\frac\{x\+3\}\{7\}\$/);
  assert.match(answerKeyInstructions(), /"correct_option": "<A, B, C or D; X/);
});
