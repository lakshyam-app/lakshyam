// Writes the AI instruction guides in docs/ from the same code the app uses,
// with the starting taxonomy. Run: node tools/gen-docs.mjs
import { writeFileSync } from "node:fs";
import { TAXONOMY_SEED, FALLBACK_TOPIC } from "../src/data/taxonomy-seed.js";
import { paperInstructions, answerKeyInstructions, explanationsInstructions } from "../src/domain/ai-instructions.js";

const taxonomy = Object.entries(TAXONOMY_SEED).map(([subject, topics]) => ({ subject, topics }));
const fence = (s) => "```\n" + s + "\n```";

writeFileSync(new URL("../docs/ai-instructions-for-json.md", import.meta.url), `# Turning a question paper PDF into a Lakshyam file (with an AI)

**Easiest way:** in the app, Library → Papers → + Add paper → **Copy instructions for AI**.
That copy lists *your own* subjects and topics (including any you added or renamed),
so it is always up to date. This page has the same instructions with the starting
subject and topic list, for reference.

## Steps
1. Open an AI chat (Gemini, ChatGPT, Claude…), attach the question paper PDF
   (and the answer key PDF if you have it).
2. Paste the instructions below and send.
3. Save the JSON it gives you, or copy it.
4. In Lakshyam: + Add paper → Choose file (or paste) → Check → Add paper.
   You see a report before anything is saved; adding the same paper again
   updates it and keeps the answers and explanations you set in the app.

Small mistakes are fine: subject, topic, answer, "deleted by PSC" and
explanation can all be changed on each question inside the app.

A small example file: [sample-paper.json](sample-paper.json) (made-up questions:
a statement question, Malayalam text, stacked maths, an explanation, a question
deleted by PSC and one without an answer yet).

## Instructions to paste
${fence(paperInstructions(taxonomy, { fallback: FALLBACK_TOPIC }))}
`);

writeFileSync(new URL("../docs/ai-instructions-for-answer-keys.md", import.meta.url), `# Answer keys and explanations for a paper already in Lakshyam

Use these when the questions are already in the app and you only want to add
the official answer key, or explanations. In the app: open the paper → ⋯ →
**Add answer key** or **Add explanations** → **Copy instructions for AI**.
Answers are matched by the printed question number.

## Answer key
${fence(answerKeyInstructions())}

Example:
${fence(`{
  "paper_id": "sample-2026-demo",
  "answers": [
    { "question_number": 1, "correct_option": "B" },
    { "question_number": 5, "correct_option": "X" }
  ]
}`)}

## Explanations
${fence(explanationsInstructions())}

Example:
${fence(`{
  "explanations": [
    { "question_number": 4, "explanation": "Article **32** lets a person go straight to the Supreme Court to enforce Fundamental Rights." }
  ]
}`)}
`);
console.log("docs written");
