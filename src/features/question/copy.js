/* Plain-text copies of questions (same layout as PSC Exam Vault's "Copy"). */
import { letterFor } from "../../domain/text.js";
import { t } from "../../core/i18n.js";
import * as store from "../../data/store.js";
import { copyText } from "../../core/clipboard.js";

export function questionAsText(q, n) {
  const paper = store.paper(q.paperId);
  const deleted = q.status === "deleted_by_psc";
  const lines = [`Q${n}${q.number ? ` (Paper Q${q.number})` : ""}. ${q.text}`];
  q.options.forEach((opt, i) => {
    lines.push(`   ${letterFor(i)}) ${opt}${!deleted && q.answerIndex === i ? " (correct)" : ""}`);
  });
  if (deleted) lines.push(`   [${t("question.deleted")}]`);
  if (q.explanation) lines.push(`   Explanation: ${q.explanation}`);
  const where = [
    paper ? `Paper: ${paper.name}` : null, paper?.postName ? `Post: ${paper.postName}` : null,
    `Subject: ${store.subject(q.subjectId)?.name || ""}`, `Topic: ${store.topic(q.topicId)?.name || ""}`
  ].filter(Boolean).join(" | ");
  lines.push(`   [${where}]`);
  return lines.join("\n");
}

export const copyQuestion = (q) => copyText(questionAsText(q, 1));

export function copyQuestions(questions, label) {
  const head = `${label} — ${t("common.questions", { n: questions.length })}`;
  return copyText([head, "", ...questions.map((q, i) => `${questionAsText(q, i + 1)}\n`)].join("\n"));
}
