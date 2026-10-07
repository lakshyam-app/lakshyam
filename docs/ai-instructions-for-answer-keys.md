# Answer keys and explanations for a paper already in Lakshyam

Use these when the questions are already in the app and you only want to add
the official answer key, or explanations. In the app: open the paper → ⋯ →
**Add answer key** or **Add explanations** → **Copy instructions for AI**.
Answers are matched by the printed question number.

## Answer key
```
You will convert a Kerala PSC answer key PDF into ONE JSON object for the Lakshyam study app.

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
5. Reply with the JSON only, as a downloadable .json file if you can. No commentary and no code fences inside the file.
```

Example:
```
{
  "paper_id": "sample-2026-demo",
  "answers": [
    { "question_number": 1, "correct_option": "B" },
    { "question_number": 5, "correct_option": "X" }
  ]
}
```

## Explanations
```
You will write explanations for a Kerala PSC question paper for the Lakshyam study app.

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
5. Reply with the JSON only, as a downloadable .json file if you can. No commentary and no code fences inside the file.
```

Example:
```
{
  "explanations": [
    { "question_number": 4, "explanation": "Article **32** lets a person go straight to the Supreme Court to enforce Fundamental Rights." }
  ]
}
```
