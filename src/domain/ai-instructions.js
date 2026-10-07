/* Instructions to give an AI (with a question-paper or answer-key PDF) so it returns
   a file Lakshyam can import. The subject and topic lists are written from YOUR
   taxonomy, one name per line and spelled exactly as in the app, so imported
   questions land in the right topic instead of creating near-duplicates.
   Pure: used by the app ("Copy instructions for AI") and by tools/gen-docs.mjs. */

/** taxonomy: [{ subject, topics: [names] }] → the numbered prompt for a question paper. */
export function paperInstructions(taxonomy, { fallback = "Other" } = {}) {
  const subjects = taxonomy.map((s) => s.subject);
  const topicList = taxonomy.map((s) => `${s.subject}:\n${s.topics.filter((x) => x !== fallback).map((x) => `  - ${x}`).join("\n")}`).join("\n\n");
  return `You will convert a Kerala PSC question paper PDF into ONE JSON object for the Lakshyam study app.

SHAPE (exactly these field names):
{
  "paper": {
    "id": "<short unique slug, e.g. kpsc-102-2024-m>",
    "name": "<paper code/name as printed, e.g. 102/2024-M>",
    "post_name": "<optional: the post / exam this paper is for>"
  },
  "questions": [
    {
      "id": "q<printed number>",
      "original_number": <optional: printed number, if it differs from the id>,
      "question_text": "<full question, verbatim>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correct_answer_index": <0-based index of the right option, or null if no answer key was given>,
      "deleted_by_psc": <optional: true if the official answer key deleted this question>,
      "subject": "<one subject from the list below, spelled exactly>",
      "topic": "<one topic from that subject's list, spelled exactly, or \\"${fallback}\\">",
      "explanation": "<optional: only from a reliable source given to you>",
      "difficulty": "<optional: E, M or D, only if the source states it>"
    }
  ]
}

RULES
1. Include every question, in the printed order. Use the printed question number for "id" ("q1", "q2", …).
2. Copy question_text and options word for word. Do not translate, correct or shorten anything; Malayalam stays in Malayalam script.
3. "options" is always a plain list of strings in printed order (usually 4).
4. Never guess the answer. Without an answer key, set "correct_answer_index": null. With a key, match it to the right question number carefully. If the key deletes a question, set "deleted_by_psc": true and "correct_answer_index": null.
5. Skip questions in Hindi, Tamil or Kannada if the paper has them.
6. Maths: plain symbols (÷ × √ ± ≤ ≥ π) are fine for simple things. For fractions, powers or anything stacked, use LaTeX between single dollar signs, e.g. $\\\\frac{x+3}{7}$. Inside JSON every backslash must be written twice (\\\\frac, not \\frac).
7. **double asterisks** = highlight, *single* = italic. Use only where the printed paper emphasises something.
8. Add "explanation" only when a solutions document was provided. Never invent one; leave the field out instead.
9. "subject" must be exactly one of:
${subjects.map((s) => `   - ${s}`).join("\n")}
10. "topic" must be exactly one of the topics listed under its subject (copy the spelling, including commas and "&"). If nothing fits, use "${fallback}".
11. Keep "match the following" and multi-statement questions exactly as printed inside question_text (use a new line, \\n, between statements).
12. Reply with the JSON only, as a downloadable .json file if you can. No commentary and no code fences inside the file.

TOPICS BY SUBJECT
${topicList}`;
}

/** The prompt for an official answer key PDF. */
export function answerKeyInstructions() {
  return `You will convert a Kerala PSC answer key PDF into ONE JSON object for the Lakshyam study app.

SHAPE:
{
  "paper_id": "<optional: the question paper's id, if known>",
  "answers": [
    { "question_number": <printed question number>, "correct_option": "<A, B, C or D; X if the question was deleted>" }
  ]
}

RULES
1. Include every question number in the key, in order.
2. If the key has several booklet columns (alphacodes A, B, C, D…), use ONLY the column for the booklet the question paper came from (usually A unless told otherwise). Ignore the other columns.
3. If a question is deleted (shown as X, "deleted" or "cancelled"), write "correct_option": "X". Never guess a letter for it.
4. Do not add questions that are not in the key.
5. Reply with the JSON only, as a downloadable .json file if you can. No commentary and no code fences inside the file.`;
}

/** The prompt for explanations of a paper already in the app. */
export function explanationsInstructions() {
  return `You will write explanations for a Kerala PSC question paper for the Lakshyam study app.

SHAPE:
{
  "explanations": [
    { "question_number": <printed question number>, "explanation": "<2-3 short sentences: why the right answer is right; add one related fact if useful>" }
  ]
}

RULES
1. Use the question paper and its answer key that are given to you. Explain the answer in the key; do not change it.
2. Be accurate. If you are not sure of a fact, leave that question out instead of guessing.
3. Questions in Malayalam get explanations in Malayalam; the others in English.
4. Maths and highlights follow the same rules as the paper: LaTeX between $…$ with every backslash written twice, **bold** for key terms.
5. Reply with the JSON only, as a downloadable .json file if you can. No commentary and no code fences inside the file.`;
}
