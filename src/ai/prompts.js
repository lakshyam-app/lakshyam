/* What we ask the AI. Pure functions: they take plain data and return text.
   Same instructions as PSC Exam Vault, so answers look the same. */

const L = (i) => String.fromCharCode(65 + i);

const STYLE = "Formatting rules: plain text only. Use '-' for bullet points. No markdown headings, tables or code fences. You may wrap key facts in **double asterisks**. Use $...$ only for real maths. Be concise and exam-focused.";

export function langInstruction(lang) {
  if (lang === "ml") return "Write your answer in Malayalam (keep proper nouns, dates and technical terms accurate; English terms in brackets where helpful).";
  if (lang === "both") return "Write the answer in English first, then a Malayalam version under a line saying 'മലയാളം:'.";
  return "Write in clear, simple English.";
}

export function tutorSystem(lang, extra = "") {
  return `You are an expert tutor for Kerala PSC (Public Service Commission) competitive exams, helping a student revise. Be accurate; if you are unsure of a fact, say so instead of guessing. ${STYLE} ${langInstruction(lang)} ${extra}`.trim();
}

/** q: { text, options, answerIndex, status, subject, topic }; selected: index, "none" or undefined. */
export function questionBlock(q, selected) {
  const opts = q.options.map((o, i) => `${L(i)}) ${o}`).join("\n");
  let correct;
  if (q.status === "deleted_by_psc") correct = "Official status: this question was DELETED by PSC (no valid answer).";
  else if (q.answerIndex === null || q.answerIndex === undefined) correct = "Correct answer: NOT marked in the app (work it out and say how confident you are).";
  else correct = `Correct answer: ${L(q.answerIndex)}) ${q.options[q.answerIndex]}`;
  let chosen = "";
  if (Number.isInteger(selected)) chosen = `\nStudent chose: ${L(selected)}) ${q.options[selected]}`;
  else if (selected === "none") chosen = "\nStudent left it unanswered.";
  return `Subject: ${q.subject || "?"} | Topic: ${q.topic || "?"}\nQuestion: ${q.text}\nOptions:\n${opts}\n${correct}${chosen}`;
}

export const tasks = {
  explain: (q, selected) => {
    const mistake = Number.isInteger(selected) && selected !== q.answerIndex;
    return `${questionBlock(q, selected)}\n\nTask: ${mistake
      ? "Explain why the student's choice is wrong, why the correct answer is right, and give one short tip to avoid this mistake next time."
      : "Explain why the correct answer is right and why each other option is wrong, briefly."}`;
  },
  mnemonic: (q) => `${questionBlock(q)}\n\nTask: Give 1-2 catchy, memorable mnemonics or memory tricks (rhymes, acronyms, associations) for the key fact(s) tested here. Keep each to one or two lines.`,
  note: (q) => `${questionBlock(q)}\n\nTask: Write a compact revision note (4-6 bullet points) on the topic behind this question — the key facts a student must remember for similar questions. Only include facts you are confident about.`
};

export const GENERATE_SYSTEM = "You write multiple-choice questions for Kerala PSC exams in the style of past papers. Accuracy matters more than cleverness: every question must have exactly one unambiguously correct option you are certain about. Output ONLY a JSON array, no commentary.";

/** examples: [{ text, options }] */
export function generateTask({ subject, topic, n, lang, difficulty, examples }) {
  const seed = examples.map((q, i) => `Example ${i + 1}:\n${q.text}\n${q.options.map((o, j) => `${L(j)}) ${o}`).join("\n")}`).join("\n\n");
  const diff = difficulty === "mixed" ? "a mix of easy, medium and difficult" : { E: "easy", M: "medium", D: "difficult" }[difficulty];
  return `Subject: ${subject}\nTopic: ${topic}\nWrite ${n} NEW multiple-choice questions on this topic in the style of the examples below (do not copy them). Language: ${lang === "ml" ? "Malayalam" : "English"}. Difficulty: ${diff}. 4 options each.\n\nReturn a JSON array where each item is: {"question_text": "...", "options": ["...","...","...","..."], "correct_answer_index": 0-3, "explanation": "1-3 sentence explanation", "difficulty": "E" | "M" | "D"}\n\n${seed ? `Style examples:\n${seed}` : "(No examples available — use typical PSC style.)"}`;
}

/** Keeps only well-formed generated questions. */
export function cleanGenerated(arr) {
  const list = Array.isArray(arr) ? arr : (arr?.questions || []);
  return list.filter((x) => x && typeof x.question_text === "string" && x.question_text.trim() && Array.isArray(x.options) && x.options.length >= 2
      && Number.isInteger(Number(x.correct_answer_index)) && Number(x.correct_answer_index) >= 0 && Number(x.correct_answer_index) < x.options.length)
    .map((x) => ({
      text: x.question_text.trim(), options: x.options.map((o) => String(o)), answerIndex: Number(x.correct_answer_index),
      explanation: String(x.explanation || "").trim(), difficulty: ["E", "M", "D"].includes(x.difficulty) ? x.difficulty : null
    }));
}

/** s: { weak, untried, slow, guess, due: [strings], marking: { pos, pen } } */

export function tricksTask(batch, lang) {
  return `${batch.map((q, i) => `#${i + 1}\n${questionBlock(q)}`).join("\n\n")}\n\nFor each numbered question, return JSON array items: {"n": number, "fact": "the one key fact to remember (1 line)", "mnemonic": "a catchy memory trick (1-2 lines)"}. Only use facts you are sure of; if unsure set mnemonic to "". ${langInstruction(lang)} Output ONLY the JSON array.`;
}

/** g: { n, right, wrong, net, acc, breakEven, pos, pen, byTopic: [strings], byDiff: [strings], recentWrong: [strings] } */
export function guessCoachTask(g) {
  return `A Kerala PSC aspirant's exam has marking +${g.pos} per correct and -${Math.round(g.pen * 100) / 100} per wrong answer (break-even accuracy ${Math.round(g.breakEven * 100)}%). Their guessing record:\nOverall: ${g.n} guesses, ${g.right} right, ${g.wrong} wrong, net ${g.net} marks, accuracy ${Math.round(g.acc * 100)}%.\n\nBy topic (worst first):\n${g.byTopic.join("\n") || "n/a"}\n\nBy difficulty:\n${g.byDiff.join("\n") || "n/a"}\n\nRecent wrong guesses:\n${g.recentWrong.join("\n") || "none"}\n\nGive a short coaching summary: (1) is guessing helping or hurting overall, (2) the topics where they should skip rather than guess and the ones where guessing is fine, (3) a simple elimination-based rule of thumb for when to guess (e.g. how many options to eliminate first, using the break-even figure), (4) 3 concrete tips. Use the numbers; do not invent data.`;
}

export const TEST_PROMPT = { system: "You are a connection tester.", user: "Reply with the single word OK." };

/* ---------- Smart insights ---------- */

export function weakSpotsTask(rows, marking) {
  return `These are a Kerala PSC aspirant's weakest areas, ranked by marks at stake (how often the topic appears in past papers × how often they get it wrong). Marking: +${marking.pos} / -${Math.round(marking.pen * 100) / 100}.\n\n${rows.join("\n")}\n\nFor the top 5, explain in 1-2 sentences why it matters and give ONE concrete action for this week (what to read, how many questions to practise, what to revise). Then give 2 short general tips that follow from the pattern of the whole list. Use only the data given; do not invent statistics. Keep it short and encouraging.`;
}

export function patternsTask(stats, examples) {
  return `Here are recent past-paper questions a Kerala PSC aspirant got wrong (with their answer, the right answer and their time). Summary: ${stats}\n\n${examples.join("\n\n")}\n\nFind the 3-5 clearest PATTERNS in these mistakes (for example: confusing similar names, dates and years, statement-type questions, 'which is NOT' questions, rushing, guessing, a particular sub-area). For each pattern: name it, quote 1-2 of the examples above as evidence (by number), and give one specific habit to fix it. Only state patterns the examples actually show. End with a 2-line memory trick for any 2 facts that were missed.`;
}
